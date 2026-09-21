import os
from datetime import datetime, timezone, timedelta

import bcrypt
import httpx
import jwt
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr, Field

from db import db, serialize
from emails import send_welcome_email

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

router = APIRouter(prefix="/api/auth", tags=["auth"])
JWT_ALGORITHM = "HS256"
TOKEN_TTL_DAYS = 7
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15


async def _check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"_id": identifier})
    if not rec or rec.get("count", 0) < MAX_LOGIN_ATTEMPTS:
        return
    locked_until = rec.get("locked_until")
    if locked_until and datetime.now(timezone.utc) < datetime.fromisoformat(locked_until):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please try again in a few minutes.")
    await db.login_attempts.delete_one({"_id": identifier})


async def _record_failed_login(identifier: str):
    rec = await db.login_attempts.find_one({"_id": identifier})
    count = (rec.get("count", 0) if rec else 0) + 1
    update = {"count": count, "updated_at": datetime.now(timezone.utc).isoformat()}
    if count >= MAX_LOGIN_ATTEMPTS:
        update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)).isoformat()
    await db.login_attempts.update_one({"_id": identifier}, {"$set": update}, upsert=True)


async def _clear_login_attempts(identifier: str):
    await db.login_attempts.delete_one({"_id": identifier})


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return serialize(user)


class RegisterInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
async def register(payload: RegisterInput):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    doc = {
        "name": payload.name,
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    user = serialize({**doc, "_id": result.inserted_id})
    token = create_token(user["id"], email)
    try:
        await send_welcome_email(to=email, name=payload.name)
    except Exception:
        pass
    return {"token": token, "user": user}


@router.post("/login")
async def login(payload: LoginInput, request: Request):
    email = payload.email.lower()
    ident = f"{_client_ip(request)}:{email}"
    await _check_lockout(ident)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        await _record_failed_login(ident)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await _clear_login_attempts(ident)
    serialized = serialize(user)
    token = create_token(serialized["id"], email)
    return {"token": token, "user": serialized}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


class SessionInput(BaseModel):
    session_id: str


@router.post("/session")
async def google_session(payload: SessionInput):
    """Exchange an Emergent Google OAuth session_id for our own JWT."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired Google session")
        data = r.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Could not verify Google session")

    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    existing = await db.users.find_one({"email": email})
    if existing is None:
        doc = {
            "name": data.get("name") or email.split("@")[0],
            "email": email,
            "picture": data.get("picture"),
            "role": "user",
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = await db.users.insert_one(doc)
        user = serialize({**doc, "_id": result.inserted_id})
        try:
            await send_welcome_email(to=email, name=user["name"])
        except Exception:
            pass
    else:
        if data.get("picture") and not existing.get("picture"):
            await db.users.update_one({"_id": existing["_id"]}, {"$set": {"picture": data.get("picture")}})
            existing["picture"] = data.get("picture")
        user = serialize(existing)

    token = create_token(user["id"], email)
    return {"token": token, "user": user}


async def seed_admin():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "name": "Admin",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

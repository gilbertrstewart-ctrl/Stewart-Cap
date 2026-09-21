import asyncio
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db, serialize
from auth import get_current_user
from market_data import quote, UNIVERSE, ensure_fresh, register_symbol, movers
from emails import send_price_alert_email, send_digest_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["alerts"])

DIGEST_TZ = ZoneInfo("America/Toronto")
DIGEST_HOUR = 8


# ---------------- Price alerts ----------------
class AlertInput(BaseModel):
    symbol: str
    target: float = Field(gt=0)
    direction: str = Field(pattern="^(above|below)$")


async def _list_alerts(user_id: str) -> dict:
    docs = await db.alerts.find({"user_id": user_id}).sort("created_at", -1).to_list(200)
    out = []
    for d in docs:
        a = serialize(d)
        if a["symbol"] in UNIVERSE:
            a["price"] = quote(a["symbol"])["price"]
        out.append(a)
    return {"alerts": out}


@router.get("/alerts")
async def get_alerts(user: dict = Depends(get_current_user)):
    await ensure_fresh()
    return await _list_alerts(user["id"])


@router.post("/alerts")
async def create_alert(payload: AlertInput, user: dict = Depends(get_current_user)):
    symbol = payload.symbol.upper().strip()
    if symbol not in UNIVERSE and not await register_symbol(symbol):
        raise HTTPException(status_code=400, detail=f"Could not find ticker {symbol}")
    await db.alerts.insert_one({
        "user_id": user["id"], "symbol": symbol, "target": round(payload.target, 2),
        "direction": payload.direction, "triggered_at": None, "triggered_price": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return await _list_alerts(user["id"])


@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, user: dict = Depends(get_current_user)):
    await db.alerts.delete_one({"_id": ObjectId(alert_id), "user_id": user["id"]})
    return await _list_alerts(user["id"])


def _crossed(a: dict, price: float) -> bool:
    return (a["direction"] == "above" and price >= a["target"]) or (a["direction"] == "below" and price <= a["target"])


async def check_price_alerts():
    pending = await db.alerts.find({"triggered_at": None}).to_list(2000)
    for a in pending:
        if a["symbol"] not in UNIVERSE:
            continue
        q = quote(a["symbol"])
        if not _crossed(a, q["price"]):
            continue
        now = datetime.now(timezone.utc).isoformat()
        await db.alerts.update_one({"_id": a["_id"]}, {"$set": {"triggered_at": now, "triggered_price": q["price"]}})
        user = await db.users.find_one({"_id": ObjectId(a["user_id"])})
        if not user:
            continue
        try:
            await send_price_alert_email(to=user["email"], name=user.get("name", ""), alert=a, q=q)
        except Exception as e:
            logger.warning(f"Price alert email failed for {a['symbol']}: {e}")


# ---------------- Daily digest ----------------
class DigestSettings(BaseModel):
    enabled: bool


@router.get("/digest/settings")
async def get_digest_settings(user: dict = Depends(get_current_user)):
    return {"enabled": bool(user.get("digest_enabled")), "last_sent": user.get("digest_last_sent"), "send_hour": DIGEST_HOUR, "timezone": "America/Toronto"}


@router.put("/digest/settings")
async def set_digest_settings(payload: DigestSettings, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"digest_enabled": payload.enabled}})
    return {"enabled": payload.enabled, "last_sent": user.get("digest_last_sent"), "send_hour": DIGEST_HOUR, "timezone": "America/Toronto"}


async def build_digest(user_id: str) -> dict:
    doc = await db.watchlists.find_one({"user_id": user_id})
    symbols = [s for s in (doc["symbols"] if doc else []) if s in UNIVERSE]
    watch = sorted([quote(s) for s in symbols], key=lambda q: abs(q["change_percent"]), reverse=True)
    m = movers()
    return {
        "watchlist": watch,
        "near_high": [q for q in watch if q["near_high"]],
        "near_low": [q for q in watch if q["near_low"]],
        "big_movers": m["big_movers"][:6],
        "market_near_high": m["high_52w"][:6],
    }


async def send_digest_to(user: dict) -> str | None:
    digest = await build_digest(user["id"])
    email_id = await send_digest_email(to=user["email"], name=user.get("name", ""), digest=digest)
    await db.users.update_one(
        {"_id": ObjectId(user["id"])}, {"$set": {"digest_last_sent": datetime.now(timezone.utc).isoformat()}}
    )
    return email_id


@router.post("/digest/send")
async def send_digest_now(user: dict = Depends(get_current_user)):
    await ensure_fresh()
    email_id = await send_digest_to(user)
    return {"sent": True, "email_id": email_id}


@router.get("/digest/preview")
async def digest_preview(user: dict = Depends(get_current_user)):
    await ensure_fresh()
    return await build_digest(user["id"])


async def run_scheduled_digests():
    now_local = datetime.now(DIGEST_TZ)
    if now_local.hour < DIGEST_HOUR or now_local.weekday() >= 5:
        return
    today = now_local.date().isoformat()
    users = await db.users.find({"digest_enabled": True}).to_list(5000)
    for u in users:
        last = u.get("digest_last_sent")
        if last and datetime.fromisoformat(last).astimezone(DIGEST_TZ).date().isoformat() == today:
            continue
        try:
            await send_digest_to(serialize(u))
        except Exception as e:
            logger.warning(f"Digest failed for {u.get('email')}: {e}")


async def alerts_worker():
    """Every 60s: fire crossed price alerts and send due morning digests."""
    while True:
        await asyncio.sleep(60)
        try:
            await ensure_fresh()
            await check_price_alerts()
            await run_scheduled_digests()
        except Exception as e:
            logger.warning(f"alerts_worker error: {e}")

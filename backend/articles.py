import os
import re
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from db import db, serialize
from auth import get_current_user
from market_data import quote, UNIVERSE, ensure_fresh, register_symbol

router = APIRouter(prefix="/api/articles", tags=["articles"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
DEFAULT_MODELS = {"openai": "gpt-5.4", "anthropic": "claude-sonnet-4-6"}


class ArticleInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body_md: str = Field(min_length=1, max_length=60000)
    summary: Optional[str] = Field(default="", max_length=400)
    tags: list[str] = []
    tickers: list[str] = []
    cover_url: Optional[str] = ""
    visibility: str = Field(default="private", pattern="^(public|private)$")


class DraftInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    symbol: Optional[str] = None
    provider: Optional[str] = "openai"
    angle: Optional[str] = ""


async def optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_tags(tags: list[str]) -> list[str]:
    return list(dict.fromkeys(t.strip().lower().lstrip("#") for t in tags if t.strip()))[:10]


def _clean_tickers(tickers: list[str]) -> list[str]:
    return list(dict.fromkeys(t.strip().upper() for t in tickers if t.strip()))[:10]


def _reading_minutes(md: str) -> int:
    return max(1, round(len(re.findall(r"\w+", md)) / 220))


def _out(doc: dict, user: Optional[dict]) -> dict:
    a = serialize(doc)
    a["is_mine"] = bool(user) and a["author_id"] == user["id"]
    a["can_edit"] = a["is_mine"] or (bool(user) and user.get("role") == "admin" and a["visibility"] == "public")
    a["reading_minutes"] = _reading_minutes(a.get("body_md", ""))
    return a


def _visible_filter(user: Optional[dict]) -> dict:
    if not user:
        return {"visibility": "public"}
    return {"$or": [{"visibility": "public"}, {"author_id": user["id"]}]}


@router.get("")
async def list_articles(scope: str = "all", tag: str = "", ticker: str = "", q: str = "", user: Optional[dict] = Depends(optional_user)):
    flt = _visible_filter(user)
    if scope == "public":
        flt = {"visibility": "public"}
    elif scope == "mine":
        if not user:
            raise HTTPException(status_code=401, detail="Sign in to see your notes")
        flt = {"author_id": user["id"]}
    elif scope == "saved":
        if not user:
            raise HTTPException(status_code=401, detail="Sign in to see saved articles")
        ids = [ObjectId(b["article_id"]) for b in await db.bookmarks.find({"user_id": user["id"]}).to_list(1000)]
        flt = {"$and": [_visible_filter(user), {"_id": {"$in": ids}}]}
    if tag:
        flt = {"$and": [flt, {"tags": tag.lower()}]}
    if ticker:
        flt = {"$and": [flt, {"tickers": ticker.upper()}]}
    if q:
        flt = {"$and": [flt, {"$or": [{"title": {"$regex": re.escape(q), "$options": "i"}}, {"body_md": {"$regex": re.escape(q), "$options": "i"}}]}]}
    docs = await db.articles.find(flt, {"body_md": 1, "title": 1, "summary": 1, "tags": 1, "tickers": 1, "cover_url": 1,
                                        "visibility": 1, "author_id": 1, "author_name": 1, "created_at": 1, "updated_at": 1}) \
        .sort("created_at", -1).to_list(300)
    saved = set()
    if user:
        saved = {b["article_id"] for b in await db.bookmarks.find({"user_id": user["id"]}, {"article_id": 1}).to_list(1000)}
    ids = [str(d["_id"]) for d in docs]
    counts = {}
    async for row in db.comments.aggregate([{"$match": {"article_id": {"$in": ids}}}, {"$group": {"_id": "$article_id", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    items = []
    for d in docs:
        a = _out(d, user)
        a["body_md"] = a["body_md"][:280]
        a["bookmarked"] = a["id"] in saved
        a["comment_count"] = counts.get(a["id"], 0)
        items.append(a)
    return {"articles": items}


@router.get("/tags")
async def list_tags(user: Optional[dict] = Depends(optional_user)):
    docs = await db.articles.find(_visible_filter(user), {"tags": 1}).to_list(1000)
    counts = {}
    for d in docs:
        for t in d.get("tags", []):
            counts[t] = counts.get(t, 0) + 1
    return {"tags": sorted(counts.items(), key=lambda x: -x[1])[:30]}


@router.get("/{article_id}")
async def get_article(article_id: str, user: Optional[dict] = Depends(optional_user)):
    try:
        doc = await db.articles.find_one({"_id": ObjectId(article_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    if doc["visibility"] != "public" and (not user or doc["author_id"] != user["id"]):
        raise HTTPException(status_code=403, detail="This note is private")
    a = _out(doc, user)
    a["bookmarked"] = bool(user) and await db.bookmarks.find_one({"user_id": user["id"], "article_id": article_id}) is not None
    await ensure_fresh()
    a["ticker_quotes"] = []
    for s in a.get("tickers", []):
        if s in UNIVERSE or await register_symbol(s):
            qq = quote(s)
            a["ticker_quotes"].append({k: qq[k] for k in ("symbol", "name", "price", "change_percent", "exchange")})
    return a


@router.post("")
async def create_article(payload: ArticleInput, user: dict = Depends(get_current_user)):
    if payload.visibility == "public" and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can publish public articles. Save it as a private note instead.")
    doc = {
        "title": payload.title.strip(), "body_md": payload.body_md, "summary": (payload.summary or "").strip(),
        "tags": _clean_tags(payload.tags), "tickers": _clean_tickers(payload.tickers),
        "cover_url": (payload.cover_url or "").strip(), "visibility": payload.visibility,
        "author_id": user["id"], "author_name": user.get("name", "Author"),
        "created_at": _now(), "updated_at": _now(),
    }
    res = await db.articles.insert_one(doc)
    return _out({**doc, "_id": res.inserted_id}, user)


@router.put("/{article_id}")
async def update_article(article_id: str, payload: ArticleInput, user: dict = Depends(get_current_user)):
    doc = await db.articles.find_one({"_id": ObjectId(article_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    is_admin = user.get("role") == "admin"
    if doc["author_id"] != user["id"] and not (is_admin and doc["visibility"] == "public"):
        raise HTTPException(status_code=403, detail="You can only edit your own articles")
    if payload.visibility == "public" and not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can publish public articles")
    upd = {
        "title": payload.title.strip(), "body_md": payload.body_md, "summary": (payload.summary or "").strip(),
        "tags": _clean_tags(payload.tags), "tickers": _clean_tickers(payload.tickers),
        "cover_url": (payload.cover_url or "").strip(), "visibility": payload.visibility, "updated_at": _now(),
    }
    await db.articles.update_one({"_id": doc["_id"]}, {"$set": upd})
    return _out({**doc, **upd}, user)


@router.delete("/{article_id}")
async def delete_article(article_id: str, user: dict = Depends(get_current_user)):
    doc = await db.articles.find_one({"_id": ObjectId(article_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    if doc["author_id"] != user["id"] and not (user.get("role") == "admin" and doc["visibility"] == "public"):
        raise HTTPException(status_code=403, detail="You can only delete your own articles")
    await db.articles.delete_one({"_id": doc["_id"]})
    return {"deleted": True}


DRAFT_SYSTEM = (
    "You are a sharp financial writer for STEWART CAP, an investment-tracking publication covering US and Canadian (TSX) "
    "equities. Write clear, well-structured Markdown articles with headings, short paragraphs and bullet points where helpful. "
    "You do not have live news access: ground claims in the data provided and frame forward-looking statements as opinion. "
    "Never give personalised financial advice. Output ONLY the Markdown article body (no title line, no code fences)."
)


@router.post("/ai-draft")
async def ai_draft(payload: DraftInput, user: dict = Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from recommendations import fetch_consensus

    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI drafting is not configured")
    provider = payload.provider if payload.provider in DEFAULT_MODELS else "openai"
    model = DEFAULT_MODELS[provider]

    context = ""
    symbol = (payload.symbol or "").upper().strip()
    if symbol:
        await ensure_fresh()
        if symbol in UNIVERSE or await register_symbol(symbol):
            q = quote(symbol)
            cons = await fetch_consensus(symbol) or {}
            context = (
                f"\nStock data for {q['name']} ({q['symbol']}, {q['exchange']}, sector {q['sector']}): price {q['price']}, "
                f"day change {q['change_percent']}%, 52-week high {q['high_52']} ({q['pct_from_high']}% below), 52-week low {q['low_52']}, "
                f"P/E {q['pe'] or 'n/a'}, market cap {q['market_cap'] or 'n/a'}B, dividend yield {q['dividend_yield'] or 0}%.\n"
                f"Analyst consensus: {cons.get('rating_key') or 'n/a'} from {cons.get('analysts') or 0} analysts, "
                f"mean target {cons.get('target_mean') or 'n/a'} (upside {cons.get('upside_pct') or 'n/a'}%)."
            )
    prompt = (
        f"Write a 500-700 word Markdown article titled \"{payload.title}\".\n"
        f"{('Angle / notes from the editor: ' + payload.angle) if payload.angle else ''}{context}\n\n"
        "Structure: a 2-sentence lede, 3-4 H2 sections, a short 'Bottom line' section, and end with a one-line italic disclaimer "
        "that this is for information only and not financial advice."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"draft-{user['id']}-{datetime.now().timestamp()}", system_message=DRAFT_SYSTEM).with_model(provider, model)
    try:
        md = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI draft failed: {str(e)}")
    md = md.strip()
    if md.startswith("```"):
        md = md.strip("`").lstrip("markdown").strip()
    return {"body_md": md, "provider": provider, "model": model, "tickers": [symbol] if symbol and symbol in UNIVERSE else []}


# ---------------- Comments ----------------
class CommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


async def _visible_article(article_id: str, user: Optional[dict]) -> dict:
    try:
        doc = await db.articles.find_one({"_id": ObjectId(article_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Article not found")
    if doc["visibility"] != "public" and (not user or doc["author_id"] != user["id"]):
        raise HTTPException(status_code=403, detail="This note is private")
    return doc


def _comment_out(c: dict, user: Optional[dict]) -> dict:
    o = serialize(c)
    o["can_delete"] = bool(user) and (o["user_id"] == user["id"] or user.get("role") == "admin")
    return o


@router.get("/{article_id}/comments")
async def list_comments(article_id: str, user: Optional[dict] = Depends(optional_user)):
    await _visible_article(article_id, user)
    docs = await db.comments.find({"article_id": article_id}).sort("created_at", 1).to_list(500)
    return {"comments": [_comment_out(c, user) for c in docs]}


@router.post("/{article_id}/comments")
async def add_comment(article_id: str, payload: CommentInput, user: dict = Depends(get_current_user)):
    doc = await _visible_article(article_id, user)
    if doc["visibility"] != "public":
        raise HTTPException(status_code=400, detail="Comments are only available on published articles")
    c = {"article_id": article_id, "user_id": user["id"], "user_name": user.get("name", "Reader"), "body": payload.body.strip(), "created_at": _now()}
    res = await db.comments.insert_one(c)
    return _comment_out({**c, "_id": res.inserted_id}, user)


@router.delete("/{article_id}/comments/{comment_id}")
async def delete_comment(article_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    c = await db.comments.find_one({"_id": ObjectId(comment_id), "article_id": article_id})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    await db.comments.delete_one({"_id": c["_id"]})
    return {"deleted": True}


# ---------------- Bookmarks ----------------
@router.post("/{article_id}/bookmark")
async def add_bookmark(article_id: str, user: dict = Depends(get_current_user)):
    await _visible_article(article_id, user)
    await db.bookmarks.update_one(
        {"user_id": user["id"], "article_id": article_id},
        {"$setOnInsert": {"user_id": user["id"], "article_id": article_id, "created_at": _now()}}, upsert=True,
    )
    return {"bookmarked": True}


@router.delete("/{article_id}/bookmark")
async def remove_bookmark(article_id: str, user: dict = Depends(get_current_user)):
    await db.bookmarks.delete_one({"user_id": user["id"], "article_id": article_id})
    return {"bookmarked": False}

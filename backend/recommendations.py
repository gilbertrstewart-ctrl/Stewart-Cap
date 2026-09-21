import asyncio
import time
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth import get_current_user
from market_data import quote, UNIVERSE, ensure_fresh, register_symbol

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["recommendations"])

UA = {"User-Agent": "Mozilla/5.0"}
CONSENSUS_TTL = 6 * 3600
SIMILAR_TTL = 24 * 3600

_crumb = {"value": None, "cookies": None, "at": 0.0}
_consensus_cache: dict = {}
_similar_cache: dict = {}


async def _get_crumb(client: httpx.AsyncClient, force: bool = False):
    if not force and _crumb["value"] and time.time() - _crumb["at"] < 3600:
        return _crumb["value"], _crumb["cookies"]
    await client.get("https://fc.yahoo.com", follow_redirects=True)
    r2 = await client.get("https://query1.finance.yahoo.com/v1/test/getcrumb")
    crumb = r2.text.strip()
    if not crumb or "<" in crumb:
        raise RuntimeError("no crumb")
    _crumb.update(value=crumb, cookies=dict(client.cookies), at=time.time())
    return crumb, _crumb["cookies"]


def _raw(d, key):
    v = (d or {}).get(key)
    return v.get("raw") if isinstance(v, dict) else v


async def fetch_consensus(symbol: str) -> dict | None:
    """Wall Street analyst consensus from Yahoo quoteSummary (cached 6h)."""
    now = time.time()
    c = _consensus_cache.get(symbol)
    if c and now - c[0] < c[2]:
        return c[1]
    data = None
    try:
        async with httpx.AsyncClient(timeout=10, headers=UA, cookies=_crumb["cookies"] or None) as client:
            for attempt in range(2):
                crumb, _ = await _get_crumb(client, force=attempt == 1)
                r = await client.get(
                    f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
                    params={"modules": "financialData,recommendationTrend", "crumb": crumb},
                )
                body = r.json()
                res = (body.get("quoteSummary") or {}).get("result")
                if res:
                    fd = res[0].get("financialData") or {}
                    trend = ((res[0].get("recommendationTrend") or {}).get("trend") or [{}])[0]
                    price = quote(symbol)["price"] if symbol in UNIVERSE else _raw(fd, "currentPrice")
                    target = _raw(fd, "targetMeanPrice")
                    data = {
                        "symbol": symbol,
                        "rating_key": fd.get("recommendationKey"),
                        "rating_mean": _raw(fd, "recommendationMean"),
                        "analysts": _raw(fd, "numberOfAnalystOpinions") or 0,
                        "target_mean": target, "target_high": _raw(fd, "targetHighPrice"), "target_low": _raw(fd, "targetLowPrice"),
                        "upside_pct": round((target - price) / price * 100, 2) if target and price else None,
                        "trend": {k: int(trend.get(k) or 0) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")},
                    }
                    if not data["rating_key"] and not data["analysts"]:
                        data = None
                    break
                if (body.get("quoteSummary") or body.get("finance") or {}).get("error", {}).get("code") != "Unauthorized":
                    break
    except Exception as e:
        logger.warning(f"consensus fetch failed {symbol}: {e}")
    _consensus_cache[symbol] = (now, data, CONSENSUS_TTL if data else 300)
    return data


@router.get("/market/consensus/{symbol}")
async def get_consensus(symbol: str):
    await ensure_fresh()
    if symbol not in UNIVERSE and not await register_symbol(symbol):
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    data = await fetch_consensus(symbol)
    return {"symbol": symbol, "consensus": data}


async def fetch_similar(symbol: str) -> list:
    now = time.time()
    c = _similar_cache.get(symbol)
    if c and now - c[0] < SIMILAR_TTL:
        return c[1]
    out = []
    try:
        async with httpx.AsyncClient(timeout=8, headers=UA) as client:
            r = await client.get(f"https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/{symbol}")
            res = (r.json().get("finance") or {}).get("result") or []
            out = [(s["symbol"], float(s.get("score") or 0)) for s in (res[0].get("recommendedSymbols") if res else [])]
    except Exception:
        out = []
    _similar_cache[symbol] = (now, out)
    return out


@router.get("/recommendations")
async def stock_ideas(user: dict = Depends(get_current_user)):
    """'You may like' ideas derived from the user's watchlist + holdings."""
    await ensure_fresh()
    wl = await db.watchlists.find_one({"user_id": user["id"]})
    holdings = await db.holdings.find({"user_id": user["id"]}, {"symbol": 1}).to_list(500)
    owned = list(dict.fromkeys((wl["symbols"] if wl else []) + [h["symbol"] for h in holdings]))
    if not owned:
        return {"ideas": [], "based_on": []}

    similar = await asyncio.gather(*[fetch_similar(s) for s in owned[:15]])
    scores, because = {}, {}
    for src, recs in zip(owned, similar):
        for sym, score in recs:
            if sym in owned or not (sym.isupper() or "." in sym):
                continue
            scores[sym] = scores.get(sym, 0) + score
            because.setdefault(sym, []).append(src)

    top = sorted(scores, key=scores.get, reverse=True)[:8]
    async with httpx.AsyncClient(timeout=8, headers=UA) as client:
        await asyncio.gather(*[register_symbol(s, client=client) for s in top if s not in UNIVERSE], return_exceptions=True)
    valid = [s for s in top if s in UNIVERSE]
    cons = await asyncio.gather(*[fetch_consensus(s) for s in valid])
    ideas = []
    for s, c in zip(valid, cons):
        ideas.append({**quote(s), "because": because[s][:3], "score": round(scores[s], 3), "consensus": c})
    return {"ideas": ideas, "based_on": owned}

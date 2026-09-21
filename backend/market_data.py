import os
import math
import random
import time
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException

from db import db

router = APIRouter(prefix="/api/market", tags=["market"])

ALPHA_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "")
AV_BASE = "https://www.alphavantage.co/query"

# Curated universe of US + Canadian (TSX) stocks. Baseline day snapshots.
# fields: symbol, name, sector, exchange, price, chg (day %), high_52, low_52, pe, mcap(B), vol(M), div(%)
_UNIVERSE = [
    ("AAPL", "Apple Inc.", "Technology", "NASDAQ", 232.5, 0.9, 237.2, 164.1, 34.1, 3450, 52.4, 0.44),
    ("MSFT", "Microsoft Corp.", "Technology", "NASDAQ", 425.0, 1.2, 430.8, 366.5, 36.8, 3160, 21.7, 0.72),
    ("NVDA", "NVIDIA Corp.", "Semiconductors", "NASDAQ", 139.5, 12.4, 140.8, 39.2, 64.2, 3420, 310.5, 0.03),
    ("TSLA", "Tesla Inc.", "Automotive", "NASDAQ", 218.4, -11.8, 271.0, 138.8, 58.9, 697, 118.9, 0.0),
    ("AMZN", "Amazon.com Inc.", "E-Commerce", "NASDAQ", 205.7, 2.1, 215.9, 118.3, 44.3, 2150, 39.2, 0.0),
    ("GOOGL", "Alphabet Inc.", "Technology", "NASDAQ", 166.2, -0.6, 191.7, 127.9, 23.6, 2050, 28.1, 0.49),
    ("META", "Meta Platforms Inc.", "Technology", "NASDAQ", 578.3, 3.4, 602.9, 279.4, 28.7, 1460, 14.8, 0.35),
    ("AMD", "Advanced Micro Devices", "Semiconductors", "NASDAQ", 122.8, 6.2, 227.3, 116.4, 121.5, 199, 45.6, 0.0),
    ("NFLX", "Netflix Inc.", "Media", "NASDAQ", 762.5, 0.4, 771.5, 400.0, 44.9, 326, 3.1, 0.0),
    ("JPM", "JPMorgan Chase & Co.", "Banking", "NYSE", 224.9, 1.0, 230.4, 179.2, 12.4, 641, 8.9, 2.3),
    ("DIS", "Walt Disney Co.", "Media", "NYSE", 96.7, -2.3, 123.7, 83.9, 40.1, 175, 9.4, 0.9),
    ("BA", "Boeing Co.", "Aerospace", "NYSE", 139.0, -4.1, 267.5, 137.0, 0.0, 85, 7.8, 0.0),
    ("SHOP.TO", "Shopify Inc.", "Technology", "TSX", 148.9, 13.6, 155.2, 74.5, 82.1, 190, 3.2, 0.0),
    ("TD.TO", "Toronto-Dominion Bank", "Banking", "TSX", 78.2, -0.5, 87.1, 73.6, 10.9, 137, 6.1, 5.2),
    ("RY.TO", "Royal Bank of Canada", "Banking", "TSX", 176.4, 1.1, 178.1, 121.5, 13.2, 249, 3.4, 3.4),
    ("ENB.TO", "Enbridge Inc.", "Energy", "TSX", 59.8, 0.7, 60.7, 44.9, 21.4, 130, 6.9, 6.3),
    ("BNS.TO", "Bank of Nova Scotia", "Banking", "TSX", 78.5, -1.2, 80.4, 60.2, 11.8, 97, 4.2, 5.4),
    ("BMO.TO", "Bank of Montreal", "Banking", "TSX", 132.7, 0.9, 136.1, 100.9, 14.6, 97, 2.8, 4.6),
    ("CNR.TO", "Canadian National Railway", "Industrials", "TSX", 148.3, -0.8, 180.0, 143.5, 18.9, 94, 1.9, 2.2),
    ("SU.TO", "Suncor Energy Inc.", "Energy", "TSX", 52.1, -10.9, 58.7, 41.3, 8.9, 66, 8.1, 4.1),
    ("BCE.TO", "BCE Inc.", "Telecom", "TSX", 38.4, -3.2, 57.8, 37.9, 18.2, 35, 4.6, 8.9),
    ("MFC.TO", "Manulife Financial Corp.", "Insurance", "TSX", 44.6, 2.6, 45.1, 28.9, 16.4, 78, 5.2, 3.6),
    ("CP.TO", "Canadian Pacific Kansas City", "Industrials", "TSX", 108.9, 0.3, 122.5, 100.1, 26.1, 101, 2.4, 0.7),
    ("GOOG", "Alphabet Inc. (C)", "Technology", "NASDAQ", 167.8, -0.5, 193.3, 129.4, 23.8, 2050, 18.5, 0.49),
]

UNIVERSE = {}
for sym, name, sector, exch, price, chg, hi, lo, pe, mcap, vol, div in _UNIVERSE:
    prev_close = round(price / (1 + chg / 100.0), 2)
    UNIVERSE[sym] = {
        "symbol": sym, "name": name, "sector": sector, "exchange": exch,
        "base_price": price, "day_change_pct": chg, "high_52": hi, "low_52": lo,
        "pe": pe, "market_cap": mcap, "volume": vol, "dividend_yield": div,
        "prev_close": prev_close,
    }


def _jitter(symbol: str) -> float:
    """Small intraday jitter (~+-0.4%) that changes every ~20s for a live feel."""
    bucket = int(time.time() // 20)
    rng = random.Random(f"{symbol}-{bucket}")
    return rng.uniform(-0.004, 0.004)


def quote(symbol: str) -> dict:
    s = UNIVERSE.get(symbol)
    if not s:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    price = round(s["base_price"] * (1 + _jitter(symbol)), 2)
    change = round(price - s["prev_close"], 2)
    change_pct = round((price - s["prev_close"]) / s["prev_close"] * 100, 2)
    return {
        "symbol": s["symbol"], "name": s["name"], "sector": s["sector"], "exchange": s["exchange"],
        "price": price, "prev_close": s["prev_close"], "change": change, "change_percent": change_pct,
        "high_52": s["high_52"], "low_52": s["low_52"], "pe": s["pe"], "market_cap": s["market_cap"],
        "volume": s["volume"], "dividend_yield": s["dividend_yield"],
    }


def all_quotes() -> list:
    return [quote(sym) for sym in UNIVERSE]


def movers() -> dict:
    quotes = all_quotes()
    near_high, near_low, big = [], [], []
    for q in quotes:
        if q["price"] >= q["high_52"] * 0.985:
            near_high.append({**q, "pct_from_52w_high": round((q["price"] - q["high_52"]) / q["high_52"] * 100, 2)})
        if q["price"] <= q["low_52"] * 1.02:
            near_low.append({**q, "pct_from_52w_low": round((q["price"] - q["low_52"]) / q["low_52"] * 100, 2)})
        if abs(q["change_percent"]) >= 10:
            big.append({**q, "direction": "up" if q["change_percent"] > 0 else "down"})
    near_high.sort(key=lambda x: x["change_percent"], reverse=True)
    near_low.sort(key=lambda x: x["change_percent"])
    big.sort(key=lambda x: abs(x["change_percent"]), reverse=True)
    return {"high_52w": near_high, "low_52w": near_low, "big_movers": big}


def history(symbol: str, rng: str = "1M") -> list:
    if symbol not in UNIVERSE:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    points_map = {"1D": 26, "1W": 35, "1M": 30, "3M": 66, "1Y": 52, "5Y": 60}
    n = points_map.get(rng, 30)
    s = UNIVERSE[symbol]
    end_price = s["base_price"]
    seed_rng = random.Random(f"{symbol}-{rng}-hist")
    # random walk backwards from current price
    vol = {"1D": 0.004, "1W": 0.01, "1M": 0.02, "3M": 0.03, "1Y": 0.05, "5Y": 0.08}.get(rng, 0.02)
    prices = [end_price]
    for _ in range(n - 1):
        step = 1 + seed_rng.uniform(-vol, vol)
        prices.append(prices[-1] / step)
    prices = list(reversed(prices))
    now = datetime.now(timezone.utc)
    step_map = {
        "1D": timedelta(minutes=15), "1W": timedelta(hours=5), "1M": timedelta(days=1),
        "3M": timedelta(days=3), "1Y": timedelta(weeks=1), "5Y": timedelta(days=30),
    }
    delta = step_map.get(rng, timedelta(days=1))
    out = []
    for i, p in enumerate(prices):
        ts = now - delta * (len(prices) - 1 - i)
        out.append({"t": ts.isoformat(), "price": round(p, 2)})
    return out


async def try_alpha_quote(symbol: str) -> dict | None:
    """Best-effort real quote from Alpha Vantage, cached in Mongo. Returns None on failure/limit."""
    if not ALPHA_KEY:
        return None
    cached = await db.av_cache.find_one({"_id": f"q:{symbol}"})
    if cached and cached.get("expires", 0) > time.time():
        return cached["data"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(AV_BASE, params={"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": ALPHA_KEY})
        data = r.json()
        gq = data.get("Global Quote") or {}
        if not gq or "05. price" not in gq:
            return None
        result = {
            "symbol": symbol,
            "price": float(gq["05. price"]),
            "change": float(gq.get("09. change", 0) or 0),
            "change_percent": float((gq.get("10. change percent", "0%") or "0%").replace("%", "")),
            "source": "alpha_vantage",
        }
        await db.av_cache.update_one(
            {"_id": f"q:{symbol}"},
            {"$set": {"data": result, "expires": time.time() + 3600}},
            upsert=True,
        )
        return result
    except Exception:
        return None


@router.get("/ticker")
async def ticker():
    return {"quotes": all_quotes(), "updated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/universe")
async def universe():
    return {"quotes": all_quotes()}


@router.get("/movers")
async def get_movers():
    return movers()


@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    q = quote(symbol)
    live = await try_alpha_quote(symbol)
    if live:
        q["live_price"] = live["price"]
        q["source"] = "alpha_vantage"
    else:
        q["source"] = "simulated"
    return q


@router.get("/history/{symbol}")
async def get_history(symbol: str, range: str = "1M"):
    return {"symbol": symbol, "range": range, "points": history(symbol, range)}


@router.get("/search")
async def search(q: str = ""):
    ql = q.lower().strip()
    if not ql:
        return {"results": all_quotes()[:12]}
    results = [quote(sym) for sym, s in UNIVERSE.items() if ql in sym.lower() or ql in s["name"].lower()]
    return {"results": results}

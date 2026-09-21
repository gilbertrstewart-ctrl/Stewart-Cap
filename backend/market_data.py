import os
import asyncio
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


YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/"
LIVE_TTL = 60  # seconds between live refreshes

_LIVE = {}
_last_refresh = 0.0

for _sym, _s in UNIVERSE.items():
    _LIVE[_sym] = {
        "price": _s["base_price"], "prev_close": _s["prev_close"],
        "high_52": _s["high_52"], "low_52": _s["low_52"],
        "source": "simulated", "as_of": None,
    }


async def _fetch_yahoo(sym: str):
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(f"{YAHOO}{sym}", params={"interval": "1d", "range": "1d"})
        m = r.json()["chart"]["result"][0]["meta"]
        price = m.get("regularMarketPrice")
        prev = m.get("chartPreviousClose") or m.get("previousClose")
        if price is None or not prev:
            return None
        return {
            "price": round(float(price), 2),
            "prev_close": round(float(prev), 2),
            "high_52": round(float(m.get("fiftyTwoWeekHigh") or UNIVERSE[sym]["high_52"]), 2),
            "low_52": round(float(m.get("fiftyTwoWeekLow") or UNIVERSE[sym]["low_52"]), 2),
            "source": "live", "as_of": m.get("regularMarketTime"),
        }
    except Exception:
        return None


async def ensure_fresh(force: bool = False):
    """Refresh live prices from Yahoo Finance at most once per LIVE_TTL seconds."""
    global _last_refresh
    now = time.time()
    if not force and now - _last_refresh < LIVE_TTL:
        return
    _last_refresh = now
    results = await asyncio.gather(*[_fetch_yahoo(s) for s in UNIVERSE], return_exceptions=True)
    for sym, res in zip(UNIVERSE.keys(), results):
        if isinstance(res, dict):
            _LIVE[sym] = res


def quote(symbol: str) -> dict:
    s = UNIVERSE.get(symbol)
    if not s:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    live = _LIVE[symbol]
    price, prev = live["price"], live["prev_close"]
    high, low = live["high_52"], live["low_52"]
    change = round(price - prev, 2)
    change_pct = round((price - prev) / prev * 100, 2) if prev else 0
    pct_from_high = round((high - price) / high * 100, 2) if high else None
    pct_from_low = round((price - low) / low * 100, 2) if low else None
    as_of = None
    if live.get("as_of"):
        as_of = datetime.fromtimestamp(live["as_of"], tz=timezone.utc).isoformat()
    return {
        "symbol": s["symbol"], "name": s["name"], "sector": s["sector"], "exchange": s["exchange"],
        "price": price, "prev_close": prev, "change": change, "change_percent": change_pct,
        "high_52": high, "low_52": low, "pe": s["pe"], "market_cap": s["market_cap"],
        "volume": s["volume"], "dividend_yield": s["dividend_yield"],
        "pct_from_high": pct_from_high, "pct_from_low": pct_from_low,
        "near_high": pct_from_high is not None and 0 <= pct_from_high <= 10,
        "at_high": pct_from_high is not None and pct_from_high <= 1.5,
        "near_low": pct_from_low is not None and 0 <= pct_from_low <= 10,
        "source": live["source"], "as_of": as_of,
    }


def all_quotes() -> list:
    return [quote(sym) for sym in UNIVERSE]


def movers() -> dict:
    quotes = all_quotes()
    near_high, near_low, big = [], [], []
    for q in quotes:
        if q["pct_from_high"] is not None and 0 <= q["pct_from_high"] <= 10:
            near_high.append(q)
        if q["pct_from_low"] is not None and 0 <= q["pct_from_low"] <= 10:
            near_low.append(q)
        if abs(q["change_percent"]) >= 10:
            big.append({**q, "direction": "up" if q["change_percent"] > 0 else "down"})
    near_high.sort(key=lambda x: x["pct_from_high"])
    near_low.sort(key=lambda x: x["pct_from_low"])
    big.sort(key=lambda x: abs(x["change_percent"]), reverse=True)
    return {
        "near_high": near_high, "near_low": near_low, "big_movers": big,
        "high_52w": [q for q in near_high if q["at_high"]],
        "low_52w": [q for q in near_low if q["pct_from_low"] <= 2],
    }


def _sim_history(symbol: str, rng: str = "1M") -> list:
    n_map = {"1D": 26, "1W": 35, "1M": 30, "3M": 66, "1Y": 52, "5Y": 60}
    n = n_map.get(rng, 30)
    end_price = _LIVE[symbol]["price"]
    seed_rng = random.Random(f"{symbol}-{rng}-hist")
    vol = {"1D": 0.004, "1W": 0.01, "1M": 0.02, "3M": 0.03, "1Y": 0.05, "5Y": 0.08}.get(rng, 0.02)
    prices = [end_price]
    for _ in range(n - 1):
        prices.append(prices[-1] / (1 + seed_rng.uniform(-vol, vol)))
    prices = list(reversed(prices))
    now = datetime.now(timezone.utc)
    step_map = {
        "1D": timedelta(minutes=15), "1W": timedelta(hours=5), "1M": timedelta(days=1),
        "3M": timedelta(days=3), "1Y": timedelta(weeks=1), "5Y": timedelta(days=30),
    }
    delta = step_map.get(rng, timedelta(days=1))
    return [{"t": (now - delta * (len(prices) - 1 - i)).isoformat(), "price": round(p, 2)} for i, p in enumerate(prices)]


_YRANGE = {
    "1D": ("1d", "5m"), "1W": ("5d", "30m"), "1M": ("1mo", "1d"),
    "3M": ("3mo", "1d"), "1Y": ("1y", "1wk"), "5Y": ("5y", "1mo"),
}


async def history(symbol: str, rng: str = "1M") -> list:
    if symbol not in UNIVERSE:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    yr, yi = _YRANGE.get(rng, ("1mo", "1d"))
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(f"{YAHOO}{symbol}", params={"interval": yi, "range": yr})
        res = r.json()["chart"]["result"][0]
        ts = res["timestamp"]
        closes = res["indicators"]["quote"][0]["close"]
        out = []
        for t, c in zip(ts, closes):
            if c is None:
                continue
            out.append({"t": datetime.fromtimestamp(t, tz=timezone.utc).isoformat(), "price": round(float(c), 2)})
        if len(out) >= 2:
            return out
    except Exception:
        pass
    return _sim_history(symbol, rng)


async def _refresher():
    """Keep live prices warm in the background so requests never block on Yahoo."""
    while True:
        try:
            await ensure_fresh(force=True)
        except Exception:
            pass
        await asyncio.sleep(45)


@router.get("/ticker")
async def ticker():
    await ensure_fresh()
    return {"quotes": all_quotes(), "updated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/universe")
async def universe():
    await ensure_fresh()
    return {"quotes": all_quotes()}


@router.get("/movers")
async def get_movers():
    await ensure_fresh()
    return movers()


@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    await ensure_fresh()
    return quote(symbol)


@router.get("/history/{symbol}")
async def get_history(symbol: str, range: str = "1M"):
    return {"symbol": symbol, "range": range, "points": await history(symbol, range)}


@router.get("/search")
async def search(q: str = ""):
    await ensure_fresh()
    ql = q.lower().strip()
    if not ql:
        return {"results": all_quotes()[:12]}
    results = [quote(sym) for sym, s in UNIVERSE.items() if ql in sym.lower() or ql in s["name"].lower()]
    return {"results": results}


_news_cache = {}


@router.get("/news/{symbol}")
async def get_news(symbol: str):
    if symbol not in UNIVERSE:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    now = time.time()
    cached = _news_cache.get(symbol)
    if cached and now - cached[0] < cached[2]:
        return {"symbol": symbol, "news": cached[1]}

    # For TSX (.TO) tickers, plain symbol search is thin — also try base ticker and company name.
    name = UNIVERSE[symbol]["name"].split(" Inc")[0].split(" Corp")[0].split(" Co.")[0].strip()
    attempts = [symbol]
    if "." in symbol:
        attempts.append(symbol.split(".")[0])
    attempts.append(name)

    items = []
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            for query in attempts:
                r = await client.get(
                    "https://query1.finance.yahoo.com/v1/finance/search",
                    params={"q": query, "newsCount": 8, "quotesCount": 0},
                )
                for n in r.json().get("news", []):
                    if not n.get("title") or not n.get("link"):
                        continue
                    items.append({
                        "title": n.get("title"),
                        "publisher": n.get("publisher"),
                        "link": n.get("link"),
                        "published": n.get("providerPublishTime"),
                    })
                    if len(items) >= 4:
                        break
                if items:
                    break
    except Exception:
        items = []
    _news_cache[symbol] = (now, items, 300 if items else 30)
    return {"symbol": symbol, "news": items}

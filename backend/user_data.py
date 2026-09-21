from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth import get_current_user
from market_data import quote, UNIVERSE, ensure_fresh, register_symbol, history, cad_usd_rate, symbol_currency
from recommendations import fetch_consensus, fetch_dividend
import asyncio

router = APIRouter(prefix="/api", tags=["user-data"])


# ---------------- Watchlist ----------------
class WatchInput(BaseModel):
    symbol: str


@router.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    await ensure_fresh()
    doc = await db.watchlists.find_one({"user_id": user["id"]})
    symbols = doc["symbols"] if doc else []
    valid = [s for s in symbols if s in UNIVERSE]
    cons = await asyncio.gather(*[fetch_consensus(s) for s in valid], return_exceptions=True)
    quotes = []
    for s, c in zip(valid, cons):
        quotes.append({**quote(s), "consensus_key": c.get("rating_key") if isinstance(c, dict) else None})
    return {"symbols": symbols, "quotes": quotes}


@router.post("/watchlist")
async def add_watchlist(payload: WatchInput, user: dict = Depends(get_current_user)):
    symbol = payload.symbol.upper().strip()
    if symbol not in UNIVERSE and not await register_symbol(symbol):
        raise HTTPException(status_code=400, detail=f"Could not find ticker {symbol}. Try e.g. AAPL or TD.TO")
    await db.watchlists.update_one(
        {"user_id": user["id"]},
        {"$addToSet": {"symbols": symbol}, "$setOnInsert": {"user_id": user["id"]}},
        upsert=True,
    )
    return await get_watchlist(user)


@router.delete("/watchlist/{symbol}")
async def remove_watchlist(symbol: str, user: dict = Depends(get_current_user)):
    await db.watchlists.update_one({"user_id": user["id"]}, {"$pull": {"symbols": symbol}})
    return await get_watchlist(user)


# ---------------- Portfolio ----------------
class HoldingInput(BaseModel):
    symbol: str
    shares: float = Field(gt=0)
    avg_price: float = Field(gt=0)


@router.get("/portfolio")
async def get_portfolio(user: dict = Depends(get_current_user)):
    await ensure_fresh()
    holdings = await db.holdings.find({"user_id": user["id"]}).to_list(500)
    rate = await cad_usd_rate()  # 1 CAD = rate USD
    to_cad = {"CAD": 1.0, "USD": 1.0 / rate}
    to_usd = {"CAD": rate, "USD": 1.0}
    items = []
    totals = {"CAD": {"value": 0.0, "cost": 0.0, "day": 0.0}, "USD": {"value": 0.0, "cost": 0.0, "day": 0.0}}
    for h in holdings:
        sym = h["symbol"]
        if sym not in UNIVERSE:
            continue
        q = quote(sym)
        cur = symbol_currency(sym)
        market_value = q["price"] * h["shares"]
        cost = h["avg_price"] * h["shares"]
        gain = market_value - cost
        day = q["change"] * h["shares"]
        for base, conv in (("CAD", to_cad), ("USD", to_usd)):
            totals[base]["value"] += market_value * conv[cur]
            totals[base]["cost"] += cost * conv[cur]
            totals[base]["day"] += day * conv[cur]
        items.append({
            "id": str(h["_id"]), "symbol": sym, "name": q["name"], "exchange": q["exchange"], "currency": cur,
            "shares": h["shares"], "avg_price": h["avg_price"], "price": q["price"], "change_percent": q["change_percent"],
            "market_value": round(market_value, 2), "market_value_cad": round(market_value * to_cad[cur], 2),
            "market_value_usd": round(market_value * to_usd[cur], 2),
            "cost": round(cost, 2), "gain": round(gain, 2), "gain_percent": round(gain / cost * 100, 2) if cost else 0,
        })

    def _summary(t):
        gain = t["value"] - t["cost"]
        base = t["value"] - t["day"]
        return {
            "total_value": round(t["value"], 2), "total_cost": round(t["cost"], 2), "total_gain": round(gain, 2),
            "total_gain_percent": round(gain / t["cost"] * 100, 2) if t["cost"] else 0,
            "day_change": round(t["day"], 2), "day_change_percent": round(t["day"] / base * 100, 2) if base else 0,
        }

    return {"holdings": items, "summary": _summary(totals["CAD"]), "summary_usd": _summary(totals["USD"]),
            "summary_cad": _summary(totals["CAD"]), "fx": {"cad_usd": rate, "usd_cad": round(1 / rate, 4)}}


@router.get("/portfolio/dividends")
async def portfolio_dividends(user: dict = Depends(get_current_user)):
    await ensure_fresh()
    holdings = [h for h in await db.holdings.find({"user_id": user["id"]}).to_list(500) if h["symbol"] in UNIVERSE]
    shares = {}
    for h in holdings:
        shares[h["symbol"]] = shares.get(h["symbol"], 0) + h["shares"]
    divs = await asyncio.gather(*[fetch_dividend(s) for s in shares], return_exceptions=True)
    rate = await cad_usd_rate()
    items, total_cad, total_usd = [], 0.0, 0.0
    now_ts = datetime.now(timezone.utc).timestamp()
    for sym, d in zip(shares, divs):
        if not isinstance(d, dict):
            continue
        cur = d["currency"] if d["currency"] in ("CAD", "USD") else symbol_currency(sym)
        income = round(d["dividend_rate"] * shares[sym], 2)
        income_cad = income if cur == "CAD" else income / rate
        income_usd = income if cur == "USD" else income * rate
        total_cad += income_cad
        total_usd += income_usd
        items.append({
            "symbol": sym, "name": UNIVERSE[sym]["name"], "shares": shares[sym], "currency": cur,
            "dividend_rate": d["dividend_rate"], "dividend_yield": d["dividend_yield"],
            "ex_date": d["ex_date"], "pay_date": d["pay_date"],
            "upcoming": bool(d["ex_date"] and d["ex_date"] >= now_ts - 86400) or bool(d["pay_date"] and d["pay_date"] >= now_ts),
            "annual_income": income, "annual_income_cad": round(income_cad, 2), "annual_income_usd": round(income_usd, 2),
            "pays": d["dividend_rate"] > 0,
        })
    items.sort(key=lambda x: (-(x["pay_date"] or 0) if x["upcoming"] else 0, -x["annual_income_cad"]))
    return {"holdings": items, "total_annual_cad": round(total_cad, 2), "total_annual_usd": round(total_usd, 2),
            "monthly_cad": round(total_cad / 12, 2), "fx": {"cad_usd": rate}}


@router.get("/portfolio/history")
async def portfolio_history(range: str = "1M", currency: str = "CAD", user: dict = Depends(get_current_user)):
    """Total portfolio value over time = sum(shares x daily close), forward-filled, converted to `currency`."""
    holdings = [h for h in await db.holdings.find({"user_id": user["id"]}).to_list(500) if h["symbol"] in UNIVERSE]
    if not holdings:
        return {"range": range, "points": []}
    rate = await cad_usd_rate()
    conv = {"CAD": 1.0, "USD": 1.0 / rate} if currency != "USD" else {"CAD": rate, "USD": 1.0}
    shares = {}
    for h in holdings:
        shares[h["symbol"]] = shares.get(h["symbol"], 0) + h["shares"] * conv[symbol_currency(h["symbol"])]
    series = await asyncio.gather(*[history(s, range) for s in shares])
    by_day = {}
    for sym, pts in zip(shares, series):
        by_day[sym] = {p["t"][:16 if range in ("1D", "1W") else 10]: p["price"] for p in pts}
    keys = sorted(set().union(*[set(d) for d in by_day.values()]))
    last = {}
    points = []
    for k in keys:
        total = 0.0
        for sym, d in by_day.items():
            if k in d:
                last[sym] = d[k]
            if sym in last:
                total += last[sym] * shares[sym]
        if len(last) == len(shares):
            points.append({"t": k, "value": round(total, 2)})
    cost = sum(h["avg_price"] * h["shares"] * conv[symbol_currency(h["symbol"])] for h in holdings)
    return {"range": range, "points": points, "invested": round(cost, 2), "currency": "USD" if currency == "USD" else "CAD"}


@router.post("/portfolio")
async def add_holding(payload: HoldingInput, user: dict = Depends(get_current_user)):
    symbol = payload.symbol.upper().strip()
    if symbol not in UNIVERSE and not await register_symbol(symbol):
        raise HTTPException(status_code=400, detail=f"Could not find ticker {symbol}. Try e.g. AAPL or TD.TO")
    await db.holdings.insert_one({
        "user_id": user["id"],
        "symbol": symbol,
        "shares": payload.shares,
        "avg_price": payload.avg_price,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return await get_portfolio(user)


@router.delete("/portfolio/{holding_id}")
async def delete_holding(holding_id: str, user: dict = Depends(get_current_user)):
    await db.holdings.delete_one({"_id": ObjectId(holding_id), "user_id": user["id"]})
    return await get_portfolio(user)


# ---------------- Brokers gateway ----------------
BROKERS = [
    {"name": "Wealthsimple", "country": "CA", "url": "https://www.wealthsimple.com/en-ca/product/trade", "tags": ["Commission-free", "TSX & US"], "blurb": "Zero-commission trading for Canadian & US stocks."},
    {"name": "Questrade", "country": "CA", "url": "https://www.questrade.com/", "tags": ["Low fees", "Registered accounts"], "blurb": "Popular Canadian broker with RRSP/TFSA support."},
    {"name": "TD Direct Investing", "country": "CA", "url": "https://www.td.com/ca/en/investing/direct-investing", "tags": ["Full-service", "Research"], "blurb": "WebBroker platform from TD with deep research tools."},
    {"name": "RBC Direct Investing", "country": "CA", "url": "https://www.rbcdirectinvesting.com/", "tags": ["Big bank", "Integrated"], "blurb": "Trade directly from your RBC banking dashboard."},
    {"name": "Interactive Brokers", "country": "US/Global", "url": "https://www.interactivebrokers.com/", "tags": ["Global markets", "Pro tools"], "blurb": "Access 150+ markets with low margin rates."},
    {"name": "Charles Schwab", "country": "US", "url": "https://www.schwab.com/", "tags": ["$0 commission", "Research"], "blurb": "Full-service US brokerage with rich research."},
    {"name": "Fidelity", "country": "US", "url": "https://www.fidelity.com/", "tags": ["$0 commission", "Retirement"], "blurb": "US brokerage strong on retirement & funds."},
    {"name": "E*TRADE", "country": "US", "url": "https://us.etrade.com/", "tags": ["Options", "Mobile"], "blurb": "Powerful options tools from Morgan Stanley."},
]


@router.get("/brokers")
async def brokers():
    return {"brokers": BROKERS}

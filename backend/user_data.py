from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth import get_current_user
from market_data import quote, UNIVERSE, ensure_fresh

router = APIRouter(prefix="/api", tags=["user-data"])


# ---------------- Watchlist ----------------
class WatchInput(BaseModel):
    symbol: str


@router.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    await ensure_fresh()
    doc = await db.watchlists.find_one({"user_id": user["id"]})
    symbols = doc["symbols"] if doc else []
    quotes = []
    for s in symbols:
        if s in UNIVERSE:
            quotes.append(quote(s))
    return {"symbols": symbols, "quotes": quotes}


@router.post("/watchlist")
async def add_watchlist(payload: WatchInput, user: dict = Depends(get_current_user)):
    if payload.symbol not in UNIVERSE:
        raise HTTPException(status_code=400, detail="Unknown symbol")
    await db.watchlists.update_one(
        {"user_id": user["id"]},
        {"$addToSet": {"symbols": payload.symbol}, "$setOnInsert": {"user_id": user["id"]}},
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
    items = []
    total_value = total_cost = day_change = 0.0
    for h in holdings:
        sym = h["symbol"]
        if sym not in UNIVERSE:
            continue
        q = quote(sym)
        market_value = q["price"] * h["shares"]
        cost = h["avg_price"] * h["shares"]
        gain = market_value - cost
        day_change += q["change"] * h["shares"]
        total_value += market_value
        total_cost += cost
        items.append({
            "id": str(h["_id"]),
            "symbol": sym,
            "name": q["name"],
            "exchange": q["exchange"],
            "shares": h["shares"],
            "avg_price": h["avg_price"],
            "price": q["price"],
            "change_percent": q["change_percent"],
            "market_value": round(market_value, 2),
            "cost": round(cost, 2),
            "gain": round(gain, 2),
            "gain_percent": round(gain / cost * 100, 2) if cost else 0,
        })
    total_gain = total_value - total_cost
    return {
        "holdings": items,
        "summary": {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain": round(total_gain, 2),
            "total_gain_percent": round(total_gain / total_cost * 100, 2) if total_cost else 0,
            "day_change": round(day_change, 2),
            "day_change_percent": round(day_change / (total_value - day_change) * 100, 2) if (total_value - day_change) else 0,
        },
    }


@router.post("/portfolio")
async def add_holding(payload: HoldingInput, user: dict = Depends(get_current_user)):
    if payload.symbol not in UNIVERSE:
        raise HTTPException(status_code=400, detail="Unknown symbol")
    await db.holdings.insert_one({
        "user_id": user["id"],
        "symbol": payload.symbol,
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

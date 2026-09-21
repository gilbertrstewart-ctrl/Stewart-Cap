import os
import json
import logging
from datetime import datetime, timezone

from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage

from db import db
from market_data import quote
from auth import get_current_user
from emails import send_email, build_analysis_email

router = APIRouter(prefix="/api/ai", tags=["ai"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

SYSTEM_MESSAGE = (
    "You are a seasoned equity market analyst. Given a stock and its recent price move, "
    "produce a concise, plausible, clearly-hypothetical explanation of likely catalysts based on "
    "typical market drivers (earnings, guidance, analyst actions, sector rotation, macro data, "
    "regulatory news, product cycles). You do NOT have live news access, so frame causes as "
    "informed hypotheses, not confirmed facts. Always respond with STRICT JSON only, no markdown."
)


DEFAULT_MODELS = {"openai": "gpt-5.4", "anthropic": "claude-sonnet-4-6"}


class AnalyzeInput(BaseModel):
    symbol: str
    provider: Optional[str] = "anthropic"
    model: Optional[str] = None


class EmailAnalysisInput(BaseModel):
    symbol: str
    provider: Optional[str] = "anthropic"
    model: Optional[str] = None


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


async def run_analysis(symbol: str, provider: str = "anthropic", model: str = None) -> dict:
    q = quote(symbol)
    provider = provider if provider in DEFAULT_MODELS else "anthropic"
    model = model or DEFAULT_MODELS[provider]
    day_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bucket = "up" if q["change_percent"] >= 0 else "down"
    cache_id = f"{symbol}:{provider}:{model}:{day_key}:{bucket}"

    cached = await db.ai_analysis.find_one({"_id": cache_id})
    if cached:
        return cached["data"]

    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI analysis is not configured")

    direction = "risen" if q["change_percent"] >= 0 else "fallen"
    prompt = f"""Analyze this stock move and return STRICT JSON.

Stock: {q['name']} ({q['symbol']}) on {q['exchange']}
Sector: {q['sector']}
Current price: {q['price']}
Day change: {q['change_percent']}% (has {direction})
52-week high: {q['high_52']}, 52-week low: {q['low_52']}
P/E: {q['pe']}, Market cap: {q['market_cap']}B, Dividend yield: {q['dividend_yield']}%

Return JSON with EXACTLY these keys:
{{
  "catalyst_summary": "2-3 sentence hypothesis of why the stock moved this much",
  "sentiment_score": <integer 0-100, 0=very bearish 100=very bullish>,
  "sentiment_label": "Bearish|Neutral|Bullish|Very Bullish|Very Bearish",
  "likely_catalysts": [{{"title": "short title", "detail": "one sentence"}}],
  "key_metrics": [{{"label": "metric name", "value": "value with context"}}],
  "analyst_takeaways": ["short actionable bullet", "..."],
  "risk_flags": ["short risk bullet", "..."],
  "disclaimer": "This is an AI-generated hypothesis, not financial advice."
}}
Provide 3 likely_catalysts, 3 key_metrics, 3 analyst_takeaways, 2 risk_flags."""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"analysis-{symbol}-{provider}",
        system_message=SYSTEM_MESSAGE,
    ).with_model(provider, model)

    try:
        raw = await chat.send_message(UserMessage(text=prompt))
        analysis = _extract_json(raw)
    except Exception as e:
        logging.getLogger(__name__).warning(f"AI analysis failed for {symbol}: {e}")
        raise HTTPException(status_code=502, detail="AI analysis is temporarily unavailable. Please try again later.")

    result = {
        "symbol": q["symbol"],
        "name": q["name"],
        "change_percent": q["change_percent"],
        "price": q["price"],
        "provider": provider,
        "model": model,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "analysis": analysis,
    }
    await db.ai_analysis.update_one({"_id": cache_id}, {"$set": {"data": result}}, upsert=True)
    return result


@router.post("/analyze")
async def analyze(payload: AnalyzeInput, user: dict = Depends(get_current_user)):
    return await run_analysis(payload.symbol, payload.provider, payload.model)


RATING_SYSTEM = (
    "You are a disciplined, independent equity research analyst. Given a stock's fundamentals, price position "
    "and Wall Street consensus, produce a clear Buy / Hold / Sell recommendation with a balanced bull and bear case. "
    "You do NOT have live news; base your view on valuation, momentum, 52-week positioning, dividend and consensus data. "
    "Always respond with STRICT JSON only, no markdown."
)


async def run_rating(symbol: str, provider: str = "openai", model: str = None) -> dict:
    from recommendations import fetch_consensus

    q = quote(symbol)
    provider = provider if provider in DEFAULT_MODELS else "openai"
    model = model or DEFAULT_MODELS[provider]
    day_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache_id = f"rating:{symbol}:{provider}:{model}:{day_key}"
    cached = await db.ai_analysis.find_one({"_id": cache_id})
    if cached:
        return cached["data"]
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI rating is not configured")

    cons = await fetch_consensus(symbol) or {}
    cons_txt = (
        f"Analyst consensus: {cons.get('rating_key')} (mean {cons.get('rating_mean')}, {cons.get('analysts')} analysts), "
        f"mean target {cons.get('target_mean')} (upside {cons.get('upside_pct')}%), "
        f"breakdown {cons.get('trend')}"
        if cons else "Analyst consensus: not available"
    )
    prompt = f"""Rate this stock and return STRICT JSON.

Stock: {q['name']} ({q['symbol']}) on {q['exchange']}, sector {q['sector']}
Price: {q['price']} (day change {q['change_percent']}%)
52-week high {q['high_52']} ({q['pct_from_high']}% below), 52-week low {q['low_52']} ({q['pct_from_low']}% above)
P/E: {q['pe'] or 'n/a'}, Market cap: {q['market_cap'] or 'n/a'}B, Dividend yield: {q['dividend_yield'] or 0}%
{cons_txt}

Return JSON with EXACTLY these keys:
{{
  "rating": "Buy|Hold|Sell",
  "confidence": <integer 0-100>,
  "horizon": "e.g. 6-12 months",
  "thesis": "2-3 sentence core thesis",
  "bull_case": ["short bullet", "short bullet", "short bullet"],
  "bear_case": ["short bullet", "short bullet", "short bullet"],
  "what_to_watch": ["short bullet", "short bullet"],
  "disclaimer": "AI-generated opinion for information only, not financial advice."
}}"""

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"rating-{symbol}-{provider}", system_message=RATING_SYSTEM).with_model(provider, model)
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
        rating = _extract_json(raw)
    except Exception as e:
        logging.getLogger(__name__).warning(f"AI rating failed for {symbol}: {e}")
        raise HTTPException(status_code=502, detail="AI rating is temporarily unavailable. Please try again later.")
    if rating.get("rating") not in ("Buy", "Hold", "Sell"):
        rating["rating"] = "Hold"

    result = {
        "symbol": q["symbol"], "name": q["name"], "price": q["price"], "provider": provider, "model": model,
        "generated_at": datetime.now(timezone.utc).isoformat(), "rating": rating, "consensus": cons or None,
    }
    await db.ai_analysis.update_one({"_id": cache_id}, {"$set": {"data": result}}, upsert=True)
    return result


@router.post("/rating")
async def ai_rating(payload: AnalyzeInput, user: dict = Depends(get_current_user)):
    return await run_rating(payload.symbol, payload.provider, payload.model)


@router.post("/email")
async def email_analysis(payload: EmailAnalysisInput, user: dict = Depends(get_current_user)):
    result = await run_analysis(payload.symbol, payload.provider, payload.model)
    html = build_analysis_email(user.get("name", "there"), result)
    subject = f"STEWART CAP: AI analysis for {result['symbol']}"
    await send_email(to=user["email"], subject=subject, html=html)
    return {"status": "sent", "to": user["email"]}

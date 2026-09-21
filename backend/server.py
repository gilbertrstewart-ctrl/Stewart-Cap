from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import asyncio
import logging

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import db
import auth
import market_data
import ai_analysis
import user_data
import alerts
import recommendations
import articles

app = FastAPI(title="ApexTicker API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "ApexTicker API running"}


app.include_router(api_router)
app.include_router(auth.router)
app.include_router(market_data.router)
app.include_router(ai_analysis.router)
app.include_router(user_data.router)
app.include_router(alerts.router)
app.include_router(recommendations.router)
app.include_router(articles.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await auth.seed_admin()
    try:
        await asyncio.wait_for(market_data.load_saved_symbols(), timeout=20)
        await asyncio.wait_for(market_data.ensure_fresh(force=True), timeout=15)
    except Exception:
        pass
    asyncio.create_task(market_data._refresher())
    asyncio.create_task(alerts.alerts_worker())
    logger.info("STEWART CAP backend ready")


@app.on_event("shutdown")
async def shutdown():
    from db import client
    client.close()

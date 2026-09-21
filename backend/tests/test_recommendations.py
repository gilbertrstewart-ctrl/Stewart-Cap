"""Tests for iteration 6: consensus, recommendations, AI rating, watchlist consensus_key."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://market-pulse-2566.preview.emergentagent.com"
ADMIN_EMAIL = "admin@apexticker.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---- Consensus endpoint ----
def test_consensus_td_to():
    r = requests.get(f"{BASE_URL}/api/market/consensus/TD.TO", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["symbol"] == "TD.TO"
    c = body["consensus"]
    assert c is not None, "consensus is None; Yahoo may be rate-limiting"
    assert c["analysts"] and c["analysts"] > 0
    assert c["rating_key"]
    assert c["rating_mean"] is not None
    assert c["target_mean"] is not None
    assert c["target_high"] is not None
    assert c["target_low"] is not None
    assert "upside_pct" in c
    for k in ("strongBuy", "buy", "hold", "sell", "strongSell"):
        assert k in c["trend"]


def test_consensus_aapl():
    r = requests.get(f"{BASE_URL}/api/market/consensus/AAPL", timeout=30)
    assert r.status_code == 200
    c = r.json()["consensus"]
    assert c is not None
    assert c["analysts"] > 0


def test_consensus_unknown_symbol_404():
    r = requests.get(f"{BASE_URL}/api/market/consensus/NOTREAL999", timeout=30)
    assert r.status_code == 404


# ---- Recommendations ----
def test_recommendations_requires_auth():
    r = requests.get(f"{BASE_URL}/api/recommendations", timeout=15)
    assert r.status_code == 401


def test_recommendations_admin(admin_headers):
    r = requests.get(f"{BASE_URL}/api/recommendations", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "ideas" in body and "based_on" in body
    based_on = set(body["based_on"])
    assert len(body["ideas"]) > 0, "expected at least one idea for admin (has watchlist)"
    idea_syms = set()
    for idea in body["ideas"]:
        for k in ("symbol", "price", "name", "exchange", "because", "score"):
            assert k in idea, f"missing {k} in idea {idea}"
        assert isinstance(idea["because"], list)
        assert all(b in based_on for b in idea["because"])
        assert "consensus" in idea  # object or null
        idea_syms.add(idea["symbol"])
    assert idea_syms.isdisjoint(based_on), "idea symbol appeared in based_on"


def test_recommendations_empty_for_fresh_user():
    email = f"TEST_reco_{uuid.uuid4().hex[:8]}@example.com"
    reg = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "T", "email": email, "password": "test1234"}, timeout=15)
    assert reg.status_code in (200, 201), reg.text
    tok = reg.json()["token"]
    r = requests.get(f"{BASE_URL}/api/recommendations", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body == {"ideas": [], "based_on": []}


# ---- Watchlist consensus_key ----
def test_watchlist_has_consensus_key(admin_headers):
    r = requests.get(f"{BASE_URL}/api/watchlist", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    quotes = body.get("quotes") if isinstance(body, dict) else body
    assert isinstance(quotes, list) and len(quotes) > 0
    # every quote should contain 'consensus_key' key (string or None)
    for q in quotes:
        assert "consensus_key" in q, f"consensus_key missing from {q.get('symbol')}"


# ---- AI rating (openai only, cached) ----
def test_ai_rating_openai_cached():
    payload = {"symbol": "TD.TO", "provider": "openai"}
    t0 = time.time()
    r1 = requests.post(f"{BASE_URL}/api/ai/rating", json=payload, timeout=90)
    dt1 = time.time() - t0
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["provider"] == "openai"
    assert b1["model"] == "gpt-5.4"
    rating = b1["rating"]
    assert rating["rating"] in ("Buy", "Hold", "Sell")
    assert isinstance(rating["confidence"], int)
    for k in ("horizon", "thesis", "bull_case", "bear_case", "what_to_watch", "disclaimer"):
        assert k in rating
    assert isinstance(rating["bull_case"], list)
    assert isinstance(rating["bear_case"], list)
    assert isinstance(rating["what_to_watch"], list)
    assert "consensus" in b1
    # Second call should be cached => fast & identical
    t1 = time.time()
    r2 = requests.post(f"{BASE_URL}/api/ai/rating", json=payload, timeout=30)
    dt2 = time.time() - t1
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["rating"] == b1["rating"], "cached rating should match"
    assert dt2 < max(5.0, dt1 / 2), f"second call not obviously cached: dt1={dt1:.2f}s dt2={dt2:.2f}s"

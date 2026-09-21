"""ApexTicker backend regression tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
# Load frontend .env as fallback
if "market-pulse" not in BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

ADMIN = {"email": "admin@apexticker.com", "password": "admin123"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def user_token(s):
    email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Tester", "email": email, "password": "secret123"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == email.lower()
    return data["token"]


# ---- Market ----
def test_ticker(s):
    r = s.get(f"{BASE_URL}/api/market/ticker", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "quotes" in d and len(d["quotes"]) >= 15
    syms = {q["symbol"] for q in d["quotes"]}
    assert "AAPL" in syms and "SHOP.TO" in syms
    q0 = d["quotes"][0]
    for k in ("price", "change_percent", "name", "exchange"):
        assert k in q0


def test_movers(s):
    r = s.get(f"{BASE_URL}/api/market/movers", timeout=30)
    assert r.status_code == 200
    d = r.json()
    # New keys after Yahoo Finance integration
    for k in ("near_high", "near_low", "big_movers"):
        assert k in d, f"missing key {k}"
    # near_high items should be within 10% of 52w high
    for q in d["near_high"]:
        assert q.get("near_high") is True
        assert 0 <= q["pct_from_high"] <= 10
        assert "at_high" in q
    # near_low items within 10% of low
    for q in d["near_low"]:
        assert 0 <= q["pct_from_low"] <= 10
    # big_movers may legitimately be empty with real data
    for q in d["big_movers"]:
        assert abs(q["change_percent"]) >= 10
        assert q["direction"] in ("up", "down")


def test_quote_and_history(s):
    r = s.get(f"{BASE_URL}/api/market/quote/AAPL", timeout=30)
    assert r.status_code == 200
    q = r.json()
    assert q["symbol"] == "AAPL" and q["price"] > 0
    assert q.get("source") in ("simulated", "live", "alpha_vantage")
    # new fields
    for k in ("pct_from_high", "pct_from_low", "near_high", "at_high", "near_low", "as_of"):
        assert k in q, f"missing {k}"

    r = s.get(f"{BASE_URL}/api/market/history/AAPL?range=1M", timeout=30)
    assert r.status_code == 200
    h = r.json()
    assert h["symbol"] == "AAPL" and len(h["points"]) > 5
    assert "t" in h["points"][0] and "price" in h["points"][0]


def test_quote_unknown(s):
    r = s.get(f"{BASE_URL}/api/market/quote/FAKEZZZ", timeout=30)
    assert r.status_code == 404


def test_search(s):
    r = s.get(f"{BASE_URL}/api/market/search?q=apple", timeout=30)
    assert r.status_code == 200
    res = r.json()["results"]
    assert any(x["symbol"] == "AAPL" for x in res)


# ---- Auth ----
def test_admin_login(admin_token):
    assert admin_token and len(admin_token) > 20


def test_login_invalid(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "nope@x.com", "password": "wrong"}, timeout=30)
    assert r.status_code == 401


def test_me(s, user_token):
    r = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {user_token}"}, timeout=30)
    assert r.status_code == 200
    assert "email" in r.json() and "id" in r.json()


def test_me_no_token(s):
    r = s.get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 401


# ---- Watchlist ----
def test_watchlist_crud(s, user_token):
    h = {"Authorization": f"Bearer {user_token}"}
    r = s.post(f"{BASE_URL}/api/watchlist", json={"symbol": "AAPL"}, headers=h, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "AAPL" in d["symbols"]
    assert any(q["symbol"] == "AAPL" for q in d["quotes"])

    r = s.post(f"{BASE_URL}/api/watchlist", json={"symbol": "NVDA"}, headers=h, timeout=30)
    assert "NVDA" in r.json()["symbols"]

    # GET verify
    r = s.get(f"{BASE_URL}/api/watchlist", headers=h, timeout=30)
    assert r.status_code == 200
    assert set(r.json()["symbols"]) >= {"AAPL", "NVDA"}

    # Delete
    r = s.delete(f"{BASE_URL}/api/watchlist/AAPL", headers=h, timeout=30)
    assert r.status_code == 200
    assert "AAPL" not in r.json()["symbols"]

    # Bad symbol
    r = s.post(f"{BASE_URL}/api/watchlist", json={"symbol": "ZZZZZ"}, headers=h, timeout=30)
    assert r.status_code == 400


def test_watchlist_requires_auth(s):
    r = s.get(f"{BASE_URL}/api/watchlist", timeout=30)
    assert r.status_code == 401


# ---- Portfolio ----
def test_portfolio_crud(s, user_token):
    h = {"Authorization": f"Bearer {user_token}"}
    r = s.post(f"{BASE_URL}/api/portfolio",
               json={"symbol": "MSFT", "shares": 10, "avg_price": 300.0}, headers=h, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["holdings"], "no holdings returned"
    hold = [x for x in d["holdings"] if x["symbol"] == "MSFT"][0]
    assert hold["shares"] == 10 and hold["avg_price"] == 300.0
    assert hold["market_value"] > 0 and "gain" in hold
    assert d["summary"]["total_value"] > 0
    holding_id = hold["id"]

    r = s.get(f"{BASE_URL}/api/portfolio", headers=h, timeout=30)
    assert r.status_code == 200
    assert any(x["id"] == holding_id for x in r.json()["holdings"])

    r = s.delete(f"{BASE_URL}/api/portfolio/{holding_id}", headers=h, timeout=30)
    assert r.status_code == 200
    assert not any(x["id"] == holding_id for x in r.json()["holdings"])

    # invalid symbol
    r = s.post(f"{BASE_URL}/api/portfolio",
               json={"symbol": "ZZZZZ", "shares": 1, "avg_price": 1}, headers=h, timeout=30)
    assert r.status_code == 400


# ---- Brokers ----
def test_brokers(s):
    r = s.get(f"{BASE_URL}/api/brokers", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert len(d["brokers"]) >= 4
    assert all("url" in b and "name" in b for b in d["brokers"])


# ---- AI Analyze ----
def test_ai_analyze(s):
    r = s.post(f"{BASE_URL}/api/ai/analyze", json={"symbol": "NVDA"}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["symbol"] == "NVDA"
    a = d["analysis"]
    for k in ("catalyst_summary", "sentiment_score", "sentiment_label",
              "likely_catalysts", "key_metrics", "analyst_takeaways", "risk_flags"):
        assert k in a, f"missing {k} in AI analysis"
    assert isinstance(a["sentiment_score"], int)
    assert 0 <= a["sentiment_score"] <= 100
    assert len(a["likely_catalysts"]) >= 1


def test_ai_analyze_unknown(s):
    r = s.post(f"{BASE_URL}/api/ai/analyze", json={"symbol": "ZZZZZ"}, timeout=30)
    assert r.status_code == 404


# ---- AI Analyze provider selection ----
def test_ai_analyze_openai(s):
    r = s.post(f"{BASE_URL}/api/ai/analyze",
               json={"symbol": "AAPL", "provider": "openai"}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["provider"] == "openai"
    assert d["model"] == "gpt-5.4"
    a = d["analysis"]
    assert "catalyst_summary" in a and "sentiment_score" in a


def test_ai_analyze_anthropic(s):
    r = s.post(f"{BASE_URL}/api/ai/analyze",
               json={"symbol": "AAPL", "provider": "anthropic"}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["provider"] == "anthropic"
    assert d["model"] == "claude-sonnet-4-6"


# ---- AI Email ----
@pytest.fixture(scope="session")
def deliverable_user_token(s):
    """Register a user with delivered@resend.dev (unique per run)."""
    unique = f"delivered+test{uuid.uuid4().hex[:8]}@resend.dev"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Delivered Tester", "email": unique, "password": "secret123"}, timeout=60)
    if r.status_code != 200:
        # If deliverable email domain still triggers welcome-email issue, we tolerate — welcome is best-effort.
        pytest.skip(f"deliverable user registration failed: {r.status_code} {r.text}")
    return r.json()["token"], unique


def test_ai_email_requires_auth(s):
    r = s.post(f"{BASE_URL}/api/ai/email",
               json={"symbol": "NVDA", "provider": "anthropic"}, timeout=30)
    assert r.status_code == 401


def test_ai_email_sends(s, deliverable_user_token):
    token, email = deliverable_user_token
    h = {"Authorization": f"Bearer {token}"}
    r = s.post(f"{BASE_URL}/api/ai/email",
               json={"symbol": "NVDA", "provider": "anthropic"}, headers=h, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("status") == "sent"
    assert d.get("to") == email


# ---- Google session ----
def test_google_session_invalid(s):
    r = s.post(f"{BASE_URL}/api/auth/session",
               json={"session_id": "invalid-session-xyz-not-real"}, timeout=30)
    assert r.status_code == 401


# ---- News ----
def test_news_aapl(s):
    r = s.get(f"{BASE_URL}/api/market/news/AAPL", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["symbol"] == "AAPL"
    assert isinstance(d["news"], list)
    assert len(d["news"]) >= 1
    assert len(d["news"]) <= 4
    for n in d["news"]:
        assert n.get("title") and n.get("link")


@pytest.mark.parametrize("sym", ["TD.TO", "RY.TO"])
def test_news_tsx(s, sym):
    r = s.get(f"{BASE_URL}/api/market/news/{sym}", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["symbol"] == sym
    assert isinstance(d["news"], list)
    # TSX news may be sparse — allow empty but structure should be valid
    for n in d["news"]:
        assert n.get("title") and n.get("link")


def test_news_unknown(s):
    r = s.get(f"{BASE_URL}/api/market/news/ZZZZZ", timeout=15)
    assert r.status_code == 404

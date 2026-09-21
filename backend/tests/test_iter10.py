"""Iteration 10 tests: security hardening (admin pwd, AI auth, password policy, brute force) + regression."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://market-pulse-2566.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@apexticker.com"
ADMIN_NEW_PWD = "Kx9$mQ7v!ZrB2t"
ADMIN_OLD_PWD = "admin123"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_NEW_PWD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


# --- Admin password change ---
def test_admin_old_password_rejected(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_OLD_PWD}, timeout=20)
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


def test_admin_new_password_accepted(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 20


# --- AI auth ---
def test_ai_analyze_requires_auth(s):
    r = s.post(f"{API}/ai/analyze", json={"symbol": "AAPL", "provider": "anthropic"}, timeout=20)
    assert r.status_code == 401


def test_ai_rating_requires_auth(s):
    r = s.post(f"{API}/ai/rating", json={"symbol": "AAPL", "provider": "anthropic"}, timeout=20)
    assert r.status_code == 401


def test_ai_analyze_with_token_not_401(s, admin_token):
    r = s.post(
        f"{API}/ai/analyze",
        json={"symbol": "AAPL", "provider": "anthropic"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=90,
    )
    assert r.status_code != 401, f"got {r.status_code}: {r.text[:200]}"
    assert r.status_code in (200, 502, 500, 503), f"unexpected {r.status_code}"


def test_ai_rating_with_token_not_401(s, admin_token):
    r = s.post(
        f"{API}/ai/rating",
        json={"symbol": "AAPL", "provider": "anthropic"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=90,
    )
    assert r.status_code != 401


# --- Password policy ---
def test_register_short_password_rejected(s):
    email = f"TEST_shortpwd_{uuid.uuid4().hex[:8]}@resend.dev"
    r = s.post(f"{API}/auth/register", json={"name": "Test", "email": email, "password": "short"}, timeout=20)
    assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"


def test_register_valid_password_accepted(s):
    email = f"TEST_okpwd_{uuid.uuid4().hex[:8]}@resend.dev"
    r = s.post(f"{API}/auth/register", json={"name": "Test", "email": email, "password": "goodpass8"}, timeout=30)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
    d = r.json()
    assert "token" in d and d["user"]["email"].lower() == email.lower()


# --- Regression: public/auth endpoints ---
def test_market_ticker_public(s):
    r = s.get(f"{API}/market/ticker", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d.get("quotes"), list) and len(d["quotes"]) > 0


def test_market_movers_public(s):
    r = s.get(f"{API}/market/movers", timeout=30)
    assert r.status_code == 200


def test_market_quote_public(s):
    r = s.get(f"{API}/market/quote/AAPL", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d.get("symbol", "").upper() == "AAPL"


def test_articles_public(s):
    r = s.get(f"{API}/articles", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d.get("articles"), list)


def test_watchlist_requires_auth(s):
    r = s.get(f"{API}/watchlist", timeout=20)
    assert r.status_code == 401


def test_watchlist_read_with_token(s, admin_token):
    r = s.get(f"{API}/watchlist", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d.get("symbols"), list)


# --- Brute force lockout (run LAST with throwaway email) ---
def test_zzz_brute_force_lockout(s):
    """Known issue: lockout uses request.client.host which is per-pod IP behind LB,
    so failures are split across pod identifiers. Attempt up to 30 to trigger 429."""
    email = f"TEST_bruteforce_{uuid.uuid4().hex[:8]}@resend.dev"
    reg = s.post(f"{API}/auth/register", json={"name": "BF", "email": email, "password": "correctpass1"}, timeout=20)
    assert reg.status_code == 200
    codes = []
    got_429 = False
    for i in range(30):
        r = s.post(f"{API}/auth/login", json={"email": email, "password": "wrongpass1"}, timeout=20)
        codes.append(r.status_code)
        if r.status_code == 429:
            got_429 = True
            break
    assert got_429, f"never got 429 in 30 attempts, codes={codes}"

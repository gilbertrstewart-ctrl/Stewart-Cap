"""Iteration 8: comments, bookmarks, newsletter, portfolio history, market overview."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if "market-pulse" not in BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

SEED_ARTICLE = "6ab13058bc98d51da1eda7c5"
ADMIN = {"email": "admin@apexticker.com", "password": "admin123"}
DELIV = {"email": "delivered@resend.dev", "password": "test1234"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _register(s):
    email = f"iter8_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Iter8", "email": email, "password": "secret123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


def _login(s, creds):
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(s):
    return _login(s, ADMIN)


@pytest.fixture(scope="module")
def u1(s):
    return _register(s)


@pytest.fixture(scope="module")
def u2(s):
    return _register(s)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Comments ----------
def test_comments_anon_get(s):
    r = s.get(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/comments", timeout=30)
    assert r.status_code == 200
    assert "comments" in r.json()


def test_comment_unauth_post(s):
    r = s.post(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/comments", json={"body": "x"}, timeout=30)
    assert r.status_code == 401


def test_comment_empty_body(s, u1):
    tok, _ = u1
    r = s.post(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/comments",
               json={"body": ""}, headers=H(tok), timeout=30)
    assert r.status_code == 422


created_comment = {}


def test_comment_post_and_flags(s, u1):
    tok, user = u1
    r = s.post(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/comments",
               json={"body": "hi from iter8"}, headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["body"] == "hi from iter8"
    assert d["can_delete"] is True
    assert d["user_name"]
    assert "id" in d
    created_comment["id"] = d["id"]
    # GET shows it
    r2 = s.get(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/comments", headers=H(tok), timeout=30)
    assert any(c["id"] == d["id"] for c in r2.json()["comments"])


def test_comment_delete_forbidden(s, u2):
    tok2, _ = u2
    r = s.delete(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/comments/{created_comment['id']}",
                 headers=H(tok2), timeout=30)
    assert r.status_code == 403


def test_comment_admin_delete(s, admin_token):
    r = s.delete(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/comments/{created_comment['id']}",
                 headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    assert r.json() == {"deleted": True}


def test_comment_on_private_note(s, u1):
    tok, _ = u1
    # U1 creates a private article
    r = s.post(f"{BASE_URL}/api/articles",
               json={"title": "TEST private", "body_md": "hi", "visibility": "private"},
               headers=H(tok), timeout=30)
    assert r.status_code == 200
    aid = r.json()["id"]
    try:
        r2 = s.post(f"{BASE_URL}/api/articles/{aid}/comments",
                    json={"body": "hello"}, headers=H(tok), timeout=30)
        assert r2.status_code == 400
    finally:
        s.delete(f"{BASE_URL}/api/articles/{aid}", headers=H(tok), timeout=30)


# ---------- Bookmarks ----------
def test_bookmark_flow(s, u1):
    tok, _ = u1
    r = s.post(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/bookmark", headers=H(tok), timeout=30)
    assert r.status_code == 200 and r.json() == {"bookmarked": True}

    r = s.get(f"{BASE_URL}/api/articles?scope=saved", headers=H(tok), timeout=30)
    assert r.status_code == 200
    arts = r.json()["articles"]
    match = [a for a in arts if a["id"] == SEED_ARTICLE]
    assert match, f"seeded article not in saved: {[a['id'] for a in arts]}"
    a = match[0]
    assert a["bookmarked"] is True
    assert isinstance(a["comment_count"], int)

    r = s.get(f"{BASE_URL}/api/articles/{SEED_ARTICLE}", headers=H(tok), timeout=30)
    assert r.status_code == 200 and r.json()["bookmarked"] is True

    r = s.delete(f"{BASE_URL}/api/articles/{SEED_ARTICLE}/bookmark", headers=H(tok), timeout=30)
    assert r.status_code == 200 and r.json() == {"bookmarked": False}

    r = s.get(f"{BASE_URL}/api/articles?scope=saved", headers=H(tok), timeout=30)
    assert not any(a["id"] == SEED_ARTICLE for a in r.json()["articles"])


def test_saved_scope_unauth(s):
    r = s.get(f"{BASE_URL}/api/articles?scope=saved", timeout=30)
    assert r.status_code == 401


# ---------- Newsletter ----------
def test_newsletter_preview_admin(s, admin_token):
    r = s.get(f"{BASE_URL}/api/newsletter/preview", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["articles"], list) and len(d["articles"]) >= 1
    assert isinstance(d["subscribers"], int)
    assert "sends_on" in d


def test_newsletter_send_self(s):
    tok = _login(s, DELIV)
    r = s.post(f"{BASE_URL}/api/newsletter/send", headers=H(tok), timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sent"] == 1
    assert d["failed"] == 0
    assert d["articles"] >= 1


def test_newsletter_unauth(s):
    r = s.post(f"{BASE_URL}/api/newsletter/send", timeout=30)
    assert r.status_code == 401


# ---------- Portfolio history ----------
def test_portfolio_history_admin(s, admin_token):
    for rng, minpts in [("1M", 15), ("1Y", 40), ("1W", 3)]:
        r = s.get(f"{BASE_URL}/api/portfolio/history?range={rng}", headers=H(admin_token), timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["points"]) >= minpts, f"range {rng} pts={len(d['points'])}"
        for p in d["points"][:3]:
            assert "t" in p and "value" in p
        assert d["invested"] == 10500 or abs(d["invested"] - 10500) < 0.01


def test_portfolio_history_empty(s, u1):
    tok, _ = u1
    r = s.get(f"{BASE_URL}/api/portfolio/history?range=1M", headers=H(tok), timeout=30)
    assert r.status_code == 200
    assert r.json() == {"range": "1M", "points": []}


# ---------- Market overview ----------
def test_market_overview(s):
    r = s.get(f"{BASE_URL}/api/market/overview", timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    names = {i["name"] for i in items}
    expected = {"TSX Composite", "NASDAQ", "S&P 500", "Dow Jones", "Crude Oil (WTI)", "Bitcoin", "CAD → USD"}
    assert expected.issubset(names), f"missing: {expected - names}"
    for i in items:
        assert isinstance(i["price"], (int, float))
        assert "change" in i and "change_percent" in i
    cad = next(i for i in items if i["name"] == "CAD → USD")
    assert 0.6 <= cad["price"] <= 0.8, f"CAD/USD price out of range: {cad['price']}"

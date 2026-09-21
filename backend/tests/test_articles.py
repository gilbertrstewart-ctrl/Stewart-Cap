"""Articles feature backend tests (iteration 7)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN = {"email": "admin@apexticker.com", "password": "admin123"}
SEEDED_PUBLIC_ID = "6ab13058bc98d51da1eda7c5"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _register(s):
    email = f"test_articles_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Art Tester", "email": email, "password": "secret123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def u1_token(s):
    return _register(s)


@pytest.fixture(scope="module")
def u2_token(s):
    return _register(s)


# ---- Public listing / anonymous ----
def test_anonymous_list_only_public(s):
    r = s.get(f"{BASE_URL}/api/articles", timeout=30)
    assert r.status_code == 200
    arts = r.json()["articles"]
    assert all(a["visibility"] == "public" for a in arts)
    # Seeded public article should be there
    assert any("TD" in (a.get("title") or "") for a in arts)


# ---- U1 private note ----
def test_u1_cannot_publish_public(s, u1_token):
    h = {"Authorization": f"Bearer {u1_token}"}
    r = s.post(f"{BASE_URL}/api/articles",
               json={"title": "TEST public attempt", "body_md": "## nope\nbody",
                     "visibility": "public"}, headers=h, timeout=30)
    assert r.status_code == 403
    assert "admin" in r.json().get("detail", "").lower()


@pytest.fixture(scope="module")
def u1_private_article(s, u1_token):
    h = {"Authorization": f"Bearer {u1_token}"}
    r = s.post(f"{BASE_URL}/api/articles",
               json={"title": "TEST_u1 private note",
                     "body_md": "## Private\nHello world content here.",
                     "summary": "test", "tags": ["priv"], "tickers": ["AAPL"],
                     "visibility": "private"}, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    a = r.json()
    assert a["visibility"] == "private"
    assert a["is_mine"] is True
    assert a.get("id")
    return a


def test_u1_private_created(u1_private_article):
    assert u1_private_article["title"] == "TEST_u1 private note"


def test_u1_scope_mine_includes_it(s, u1_token, u1_private_article):
    h = {"Authorization": f"Bearer {u1_token}"}
    r = s.get(f"{BASE_URL}/api/articles?scope=mine", headers=h, timeout=30)
    assert r.status_code == 200
    ids = [a["id"] for a in r.json()["articles"]]
    assert u1_private_article["id"] in ids


def test_anonymous_does_not_see_private(s, u1_private_article):
    r = s.get(f"{BASE_URL}/api/articles", timeout=30)
    ids = [a["id"] for a in r.json()["articles"]]
    assert u1_private_article["id"] not in ids


def test_u2_cannot_get_u1_private(s, u2_token, u1_private_article):
    h = {"Authorization": f"Bearer {u2_token}"}
    r = s.get(f"{BASE_URL}/api/articles/{u1_private_article['id']}", headers=h, timeout=30)
    assert r.status_code == 403


def test_u1_can_get_own_full(s, u1_token, u1_private_article):
    h = {"Authorization": f"Bearer {u1_token}"}
    r = s.get(f"{BASE_URL}/api/articles/{u1_private_article['id']}", headers=h, timeout=30)
    assert r.status_code == 200
    a = r.json()
    assert "body_md" in a and "reading_minutes" in a and "ticker_quotes" in a
    assert isinstance(a["ticker_quotes"], list)


def test_u1_update_title(s, u1_token, u1_private_article):
    h = {"Authorization": f"Bearer {u1_token}"}
    aid = u1_private_article["id"]
    r = s.put(f"{BASE_URL}/api/articles/{aid}",
              json={"title": "TEST_u1 updated title",
                    "body_md": u1_private_article["body_md"] if u1_private_article.get("body_md") else "## Private\nHello",
                    "visibility": "private", "tags": ["priv"], "tickers": ["AAPL"]},
              headers=h, timeout=30)
    assert r.status_code == 200
    assert r.json()["title"] == "TEST_u1 updated title"


def test_u2_cannot_update(s, u2_token, u1_private_article):
    h = {"Authorization": f"Bearer {u2_token}"}
    r = s.put(f"{BASE_URL}/api/articles/{u1_private_article['id']}",
              json={"title": "hijack", "body_md": "nope", "visibility": "private"},
              headers=h, timeout=30)
    assert r.status_code == 403


def test_u2_cannot_delete(s, u2_token, u1_private_article):
    h = {"Authorization": f"Bearer {u2_token}"}
    r = s.delete(f"{BASE_URL}/api/articles/{u1_private_article['id']}", headers=h, timeout=30)
    assert r.status_code == 403


def test_u1_delete(s, u1_token, u1_private_article):
    h = {"Authorization": f"Bearer {u1_token}"}
    r = s.delete(f"{BASE_URL}/api/articles/{u1_private_article['id']}", headers=h, timeout=30)
    assert r.status_code == 200
    assert r.json().get("deleted") is True


# ---- Admin public with tags/tickers ----
def test_admin_public_article_flow(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.post(f"{BASE_URL}/api/articles",
               json={"title": "TEST_admin public article",
                     "body_md": "## Head\nBody",
                     "tags": ["test"], "tickers": ["AAPL"],
                     "visibility": "public"}, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["visibility"] == "public"
    aid = a["id"]

    # tag filter
    r = s.get(f"{BASE_URL}/api/articles?tag=test", timeout=30)
    assert r.status_code == 200
    assert any(x["id"] == aid for x in r.json()["articles"])

    # ticker filter
    r = s.get(f"{BASE_URL}/api/articles?ticker=AAPL", timeout=30)
    assert any(x["id"] == aid for x in r.json()["articles"])

    # q filter — title contains "public"
    r = s.get(f"{BASE_URL}/api/articles?q=public", timeout=30)
    assert any(x["id"] == aid for x in r.json()["articles"])

    # tags endpoint
    r = s.get(f"{BASE_URL}/api/articles/tags", timeout=30)
    assert r.status_code == 200
    tags = r.json()["tags"]
    assert any(t[0] == "test" and t[1] >= 1 for t in tags)

    # delete
    r = s.delete(f"{BASE_URL}/api/articles/{aid}", headers=h, timeout=30)
    assert r.status_code == 200
    assert r.json().get("deleted") is True


def test_missing_article_404(s):
    r = s.get(f"{BASE_URL}/api/articles/000000000000000000000000", timeout=30)
    assert r.status_code == 404


# ---- AI Draft ----
def test_ai_draft_unauth(s):
    r = s.post(f"{BASE_URL}/api/articles/ai-draft",
               json={"title": "x", "provider": "openai"}, timeout=30)
    assert r.status_code == 401


def test_ai_draft_admin_openai(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.post(f"{BASE_URL}/api/articles/ai-draft",
               json={"title": "Why Canadian banks matter",
                     "symbol": "RY.TO", "provider": "openai"},
               headers=h, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["provider"] == "openai"
    assert d["model"] == "gpt-5.4"
    assert d["body_md"] and "##" in d["body_md"]
    assert d["tickers"] == ["RY.TO"]

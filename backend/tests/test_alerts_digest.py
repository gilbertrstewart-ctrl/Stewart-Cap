"""Tests for Price Alerts and Daily Digest endpoints (iteration 5)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN = {"email": "admin@apexticker.com", "password": "admin123"}
DELIVERED = {"email": "delivered@resend.dev", "password": "test1234"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(s, creds):
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(s):
    return _login(s, ADMIN)


@pytest.fixture(scope="module")
def delivered_token(s):
    return _login(s, DELIVERED)


# ---------------- Price alerts CRUD ----------------
def test_alerts_requires_auth(s):
    r = s.get(f"{BASE_URL}/api/alerts", timeout=30)
    assert r.status_code == 401


def test_create_alert_bad_direction(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 1, "direction": "sideways"},
               headers=h, timeout=30)
    assert r.status_code == 422


def test_create_alert_bad_target(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 0, "direction": "above"},
               headers=h, timeout=30)
    assert r.status_code == 422


def test_create_alert_bad_symbol(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "NOTREAL123", "target": 1, "direction": "above"},
               headers=h, timeout=30)
    assert r.status_code == 400
    assert "Could not find ticker" in r.json().get("detail", "")


def test_alerts_crud(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}

    # Clean any leftover admin AAPL alerts
    r = s.get(f"{BASE_URL}/api/alerts", headers=h, timeout=30)
    for a in r.json().get("alerts", []):
        if a["symbol"] == "AAPL":
            s.delete(f"{BASE_URL}/api/alerts/{a['id']}", headers=h, timeout=15)

    # Create
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 1, "direction": "above"},
               headers=h, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "alerts" in d
    match = [a for a in d["alerts"] if a["symbol"] == "AAPL" and a["target"] == 1.0]
    assert match, f"created alert not returned: {d}"
    a = match[0]
    assert a["direction"] == "above"
    assert "price" in a and isinstance(a["price"], (int, float)) and a["price"] > 0
    assert "id" in a
    alert_id = a["id"]

    # GET verifies persistence
    r = s.get(f"{BASE_URL}/api/alerts", headers=h, timeout=30)
    assert r.status_code == 200
    assert any(x["id"] == alert_id for x in r.json()["alerts"])

    # DELETE
    r = s.delete(f"{BASE_URL}/api/alerts/{alert_id}", headers=h, timeout=30)
    assert r.status_code == 200
    assert not any(x["id"] == alert_id for x in r.json()["alerts"])


# ---------------- Alert trigger (background worker) ----------------
def test_alert_triggers_after_worker_tick(s, delivered_token):
    """Create alert with target=1 above (immediately crossed by AAPL price);
    worker (60s) should mark triggered."""
    h = {"Authorization": f"Bearer {delivered_token}"}

    # Clean up any existing AAPL alerts for delivered user
    r = s.get(f"{BASE_URL}/api/alerts", headers=h, timeout=30)
    for a in r.json().get("alerts", []):
        if a["symbol"] == "AAPL":
            s.delete(f"{BASE_URL}/api/alerts/{a['id']}", headers=h, timeout=15)

    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 1, "direction": "above"},
               headers=h, timeout=30)
    assert r.status_code == 200, r.text
    alerts = r.json()["alerts"]
    aapl = [a for a in alerts if a["symbol"] == "AAPL" and a["target"] == 1.0][0]
    alert_id = aapl["id"]
    assert aapl["triggered_at"] is None

    # Wait up to ~90s for worker (runs every 60s)
    triggered = False
    deadline = time.time() + 90
    while time.time() < deadline:
        time.sleep(10)
        r = s.get(f"{BASE_URL}/api/alerts", headers=h, timeout=30)
        found = next((a for a in r.json()["alerts"] if a["id"] == alert_id), None)
        if found and found.get("triggered_at"):
            triggered = True
            assert found.get("triggered_price") is not None
            assert isinstance(found["triggered_price"], (int, float))
            break

    # Cleanup
    s.delete(f"{BASE_URL}/api/alerts/{alert_id}", headers=h, timeout=15)
    assert triggered, "alert did not trigger within 90s"


# ---------------- Digest ----------------
def test_digest_settings_default(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.get(f"{BASE_URL}/api/digest/settings", headers=h, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert set(["enabled", "last_sent", "send_hour", "timezone"]).issubset(d.keys())
    assert d["send_hour"] == 8
    assert d["timezone"] == "America/Toronto"
    assert isinstance(d["enabled"], bool)


def test_digest_settings_toggle(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.put(f"{BASE_URL}/api/digest/settings",
              json={"enabled": True}, headers=h, timeout=30)
    assert r.status_code == 200
    assert r.json()["enabled"] is True

    r = s.get(f"{BASE_URL}/api/digest/settings", headers=h, timeout=30)
    assert r.json()["enabled"] is True

    r = s.put(f"{BASE_URL}/api/digest/settings",
              json={"enabled": False}, headers=h, timeout=30)
    assert r.status_code == 200
    assert r.json()["enabled"] is False

    r = s.get(f"{BASE_URL}/api/digest/settings", headers=h, timeout=30)
    assert r.json()["enabled"] is False


def test_digest_preview(s, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.get(f"{BASE_URL}/api/digest/preview", headers=h, timeout=45)
    assert r.status_code == 200
    d = r.json()
    for k in ("watchlist", "near_high", "near_low", "big_movers", "market_near_high"):
        assert k in d, f"missing key {k}"
        assert isinstance(d[k], list)


def test_digest_send_deliverable(s, delivered_token):
    h = {"Authorization": f"Bearer {delivered_token}"}
    r = s.post(f"{BASE_URL}/api/digest/send", headers=h, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("sent") is True
    assert isinstance(d.get("email_id"), str) and len(d["email_id"]) > 0


def test_digest_send_admin_undeliverable(s, admin_token):
    """admin@apexticker.com is undeliverable; expect 502 (not 500)."""
    h = {"Authorization": f"Bearer {admin_token}"}
    r = s.post(f"{BASE_URL}/api/digest/send", headers=h, timeout=60)
    # Expected 502; must not be a 500
    assert r.status_code != 500, f"unexpected 500: {r.text}"
    assert r.status_code in (502, 400, 422), f"unexpected status {r.status_code}: {r.text}"

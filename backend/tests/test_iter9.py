"""Iteration 9 tests: CAD/USD portfolio, dividends, percent alerts."""
import os
import time
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
DELIV = {"email": "delivered@resend.dev", "password": "test1234"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def deliv_h(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json=DELIV, timeout=30)
    if r.status_code != 200:
        # register
        r = s.post(f"{BASE_URL}/api/auth/register",
                   json={"name": "Deliv", "email": DELIV["email"], "password": DELIV["password"]},
                   timeout=30)
        assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def fresh_user_h(s):
    email = f"iter9_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "Iter9", "email": email, "password": "secret123"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ---------- Portfolio CAD/USD ----------
def test_portfolio_currency_split(s, admin_h):
    r = s.get(f"{BASE_URL}/api/portfolio", headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "summary" in d and "summary_cad" in d and "summary_usd" in d
    assert "fx" in d
    fx = d["fx"]
    assert 0.6 <= fx["cad_usd"] <= 0.8, f"cad_usd out of range: {fx}"
    assert 1.2 <= fx["usd_cad"] <= 1.6, f"usd_cad out of range: {fx}"

    syms = {h["symbol"]: h for h in d["holdings"]}
    assert "TD.TO" in syms and "AAPL" in syms, f"expected holdings missing: {list(syms)}"
    td = syms["TD.TO"]
    aa = syms["AAPL"]
    assert td["currency"] == "CAD", f"TD.TO currency={td.get('currency')}"
    assert aa["currency"] == "USD", f"AAPL currency={aa.get('currency')}"
    for k in ("market_value", "market_value_cad", "market_value_usd"):
        assert k in td and k in aa, f"missing {k}"

    # summary should equal summary_cad (default CAD)
    assert abs(d["summary"]["total_value"] - d["summary_cad"]["total_value"]) < 0.01

    # summary_cad.total ≈ summary_usd.total / fx.cad_usd within 1%
    expected_cad = d["summary_usd"]["total_value"] / fx["cad_usd"]
    diff = abs(expected_cad - d["summary_cad"]["total_value"]) / d["summary_cad"]["total_value"]
    assert diff < 0.01, f"CAD/USD summary mismatch: cad={d['summary_cad']['total_value']} usd={d['summary_usd']['total_value']} fx={fx['cad_usd']}"


def test_portfolio_history_usd(s, admin_h):
    r = s.get(f"{BASE_URL}/api/portfolio/history?range=1M&currency=USD", headers=admin_h, timeout=45)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("currency") == "USD"
    assert len(d.get("points", [])) > 0
    inv = d["invested"]
    assert abs(inv - 8352) / 8352 < 0.02, f"invested USD={inv}, expected ~8352"


def test_portfolio_history_cad(s, admin_h):
    r_usd = s.get(f"{BASE_URL}/api/portfolio/history?range=1M&currency=USD", headers=admin_h, timeout=45).json()
    r = s.get(f"{BASE_URL}/api/portfolio/history?range=1M&currency=CAD", headers=admin_h, timeout=45)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("currency") == "CAD"
    inv = d["invested"]
    assert abs(inv - 11700) / 11700 < 0.03, f"invested CAD={inv}, expected ~11700"

    # last point CAD ≈ USD / fx.cad_usd
    p = s.get(f"{BASE_URL}/api/portfolio", headers=admin_h, timeout=30).json()
    fx = p["fx"]["cad_usd"]
    last_cad = d["points"][-1]["value"]
    last_usd = r_usd["points"][-1]["value"]
    expected = last_usd / fx
    assert abs(expected - last_cad) / last_cad < 0.02, f"last point CAD={last_cad}, expected≈{expected}"


# ---------- Dividends ----------
def test_dividends_admin(s, admin_h):
    r = s.get(f"{BASE_URL}/api/portfolio/dividends", headers=admin_h, timeout=45)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "holdings" in d and "total_annual_cad" in d
    assert d["total_annual_cad"] > 0
    assert abs(d["monthly_cad"] - d["total_annual_cad"] / 12) < 0.5
    assert "fx" in d

    by_sym = {h["symbol"]: h for h in d["holdings"]}
    for sym in ("TD.TO", "AAPL"):
        assert sym in by_sym, f"missing {sym} in dividends"
        h = by_sym[sym]
        assert h["pays"] is True, f"{sym} pays={h.get('pays')}"
        assert h["dividend_rate"] > 0
        assert "dividend_yield" in h
        assert isinstance(h.get("ex_date"), int) and isinstance(h.get("pay_date"), int)
        assert "annual_income" in h and "annual_income_cad" in h and "annual_income_usd" in h
        # annual_income = rate * shares
        expected = h["dividend_rate"] * h["shares"]
        assert abs(h["annual_income"] - expected) < 0.5
        assert "upcoming" in h


def test_dividends_fresh_user(s, fresh_user_h):
    r = s.get(f"{BASE_URL}/api/portfolio/dividends", headers=fresh_user_h, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["holdings"] == []
    assert d["total_annual_cad"] == 0
    assert d["monthly_cad"] == 0


def test_dividends_unauth(s):
    r = s.get(f"{BASE_URL}/api/portfolio/dividends", timeout=15)
    assert r.status_code == 401


# ---------- Percent alerts ----------
def _newest(lst, sym, kind):
    alerts = lst.get("alerts", lst) if isinstance(lst, dict) else lst
    matches = [a for a in alerts if a["symbol"] == sym and a.get("kind") == kind]
    return sorted(matches, key=lambda a: a["created_at"], reverse=True)[0] if matches else None


def test_pct_alert_create_valid(s, admin_h):
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 0.01, "direction": "above", "kind": "pct"},
               headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    newest = _newest(r.json(), "AAPL", "pct")
    assert newest is not None and newest["kind"] == "pct"
    s.delete(f"{BASE_URL}/api/alerts/{newest['id']}", headers=admin_h, timeout=15)


def test_alert_invalid_kind(s, admin_h):
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 1, "direction": "above", "kind": "weird"},
               headers=admin_h, timeout=30)
    assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text}"


def test_pct_alert_target_too_big(s, admin_h):
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 150, "direction": "above", "kind": "pct"},
               headers=admin_h, timeout=30)
    assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"


def test_price_alert_default_kind(s, admin_h):
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "AAPL", "target": 1, "direction": "above"},
               headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    newest = _newest(r.json(), "AAPL", "price")
    assert newest is not None and newest["kind"] == "price"
    s.delete(f"{BASE_URL}/api/alerts/{newest['id']}", headers=admin_h, timeout=15)


def test_pct_alert_triggers(s, deliv_h):
    q = s.get(f"{BASE_URL}/api/market/quote/NVDA", timeout=30).json()
    cp = q.get("change_percent", 0)
    direction = "above" if cp >= 0.01 else "below"
    r = s.post(f"{BASE_URL}/api/alerts",
               json={"symbol": "NVDA", "target": 0.01, "direction": direction, "kind": "pct"},
               headers=deliv_h, timeout=30)
    assert r.status_code == 200, r.text
    newest = _newest(r.json(), "NVDA", "pct")
    assert newest is not None
    aid = newest["id"]
    try:
        triggered = False
        for _ in range(9):
            time.sleep(10)
            lst = s.get(f"{BASE_URL}/api/alerts", headers=deliv_h, timeout=30).json()
            alerts = lst.get("alerts", lst) if isinstance(lst, dict) else lst
            row = next((a for a in alerts if a["id"] == aid), None)
            if row and row.get("triggered_at"):
                triggered = True
                break
        assert triggered, f"pct alert not triggered within 90s for cp={cp} direction={direction}"
    finally:
        s.delete(f"{BASE_URL}/api/alerts/{aid}", headers=deliv_h, timeout=15)

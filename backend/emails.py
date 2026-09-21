import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()
logger = logging.getLogger(__name__)

# Emergent managed email proxy. CONSTANT — never read from env, so it survives deployment.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]  # this app's OWN brand (G1)
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


_SHELL = (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
    'style="background:#0f121c;padding:32px 0;font-family:Arial,Helvetica,sans-serif">'
    '<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" '
    'style="background:#151926;border-radius:14px;overflow:hidden">'
    '<tr><td style="background:#3B82F6;padding:18px 28px;color:#fff;font-size:18px;font-weight:bold;letter-spacing:1px">'
    'STEWART CAP</td></tr>'
    '<tr><td style="padding:28px;color:#e2e8f0;font-size:15px;line-height:1.6">{body}</td></tr>'
    '<tr><td style="padding:16px 28px;background:#0f121c;color:#64748b;font-size:12px">'
    'Sent by STEWART CAP. Informational only, not financial advice. '
    'We never ask for your password or card details by email.</td></tr>'
    '</table></td></tr></table>'
)


async def send_welcome_email(*, to: str, name: str) -> str | None:
    body = (
        f"<p style='margin:0 0 14px'>Hi {escape(name or 'there')}, welcome to <strong>STEWART CAP</strong>! 🎉</p>"
        "<p style='margin:0 0 14px'>Your account is ready. You can now:</p>"
        "<ul style='margin:0 0 14px;padding-left:20px'>"
        "<li>Track your US &amp; TSX portfolio with live prices</li>"
        "<li>Build a watchlist with 52-week-high alerts</li>"
        "<li>Get AI cause analysis on any dramatic mover</li>"
        "</ul>"
        "<p style='margin:0'>Happy investing.</p>"
    )
    return await send_email(to=to, subject="Welcome to STEWART CAP", html=_SHELL.format(body=body))


def build_analysis_email(name: str, result: dict) -> str:
    a = result.get("analysis", {})
    catalysts = "".join(
        f"<li style='margin-bottom:6px'><strong>{escape(str(c.get('title','')))}</strong> - "
        f"{escape(str(c.get('detail','')))}</li>"
        for c in (a.get("likely_catalysts") or [])
    )
    takeaways = "".join(f"<li style='margin-bottom:6px'>{escape(str(t))}</li>" for t in (a.get("analyst_takeaways") or []))
    engine = "ChatGPT" if result.get("provider") == "openai" else "Claude"

    catalysts_block = ""
    if catalysts:
        catalysts_block = (
            "<p style='margin:0 0 6px;font-weight:bold'>Likely catalysts</p>"
            "<ul style='margin:0 0 16px;padding-left:20px'>" + catalysts + "</ul>"
        )
    takeaways_block = ""
    if takeaways:
        takeaways_block = (
            "<p style='margin:0 0 6px;font-weight:bold'>Analyst takeaways</p>"
            "<ul style='margin:0 0 16px;padding-left:20px'>" + takeaways + "</ul>"
        )

    intro = (
        f"<p style='margin:0 0 14px'>Hi {escape(name or 'there')}, here is your AI cause analysis for "
        f"<strong>{escape(str(result.get('symbol','')))}</strong> ({escape(str(result.get('name','')))}), "
        f"which moved <strong>{escape(str(result.get('change_percent','')))}%</strong>.</p>"
    )
    meta = (
        f"<p style='margin:0 0 6px;color:#94a3b8;font-size:12px'>Engine: {engine} &middot; Sentiment: "
        f"{escape(str(a.get('sentiment_label','')))} ({escape(str(a.get('sentiment_score','')))}/100)</p>"
    )
    summary = f"<p style='margin:0 0 16px'>{escape(str(a.get('catalyst_summary','')))}</p>"
    disclaimer = (
        f"<p style='margin:0;color:#94a3b8;font-size:12px'>"
        f"{escape(str(a.get('disclaimer','This is an AI-generated hypothesis, not financial advice.')))}</p>"
    )
    body = intro + meta + summary + catalysts_block + takeaways_block + disclaimer
    return _SHELL.format(body=body)


def _pct(n) -> str:
    v = float(n or 0)
    color = "#16a34a" if v >= 0 else "#dc2626"
    return f"<span style='color:{color};font-weight:bold'>{'+' if v >= 0 else ''}{v:.2f}%</span>"


def _row(q: dict, extra: str = "") -> str:
    return (
        "<tr>"
        f"<td style='padding:6px 0;border-bottom:1px solid #263041'><strong>{escape(q['symbol'])}</strong>"
        f"<span style='color:#94a3b8;font-size:12px'> &middot; {escape(str(q.get('name', '')))}</span></td>"
        f"<td style='padding:6px 0;border-bottom:1px solid #263041;text-align:right'>${q['price']:,.2f}</td>"
        f"<td style='padding:6px 0;border-bottom:1px solid #263041;text-align:right'>{_pct(q['change_percent'])}{extra}</td>"
        "</tr>"
    )


def _table(title: str, rows: str) -> str:
    if not rows:
        return ""
    return (
        f"<p style='margin:18px 0 6px;font-weight:bold'>{title}</p>"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='font-size:14px'>" + rows + "</table>"
    )


async def send_price_alert_email(*, to: str, name: str, alert: dict, q: dict) -> str | None:
    word = "rose above" if alert["direction"] == "above" else "fell below"
    body = (
        f"<p style='margin:0 0 14px'>Hi {escape(name or 'there')},</p>"
        f"<p style='margin:0 0 14px'><strong>{escape(alert['symbol'])}</strong> ({escape(str(q.get('name', '')))}) just "
        f"<strong>{word} your target of ${alert['target']:,.2f}</strong>.</p>"
        f"<p style='margin:0 0 14px;font-size:22px'>Now: <strong>${q['price']:,.2f}</strong> &nbsp;{_pct(q['change_percent'])} today</p>"
        f"<p style='margin:0;color:#94a3b8;font-size:12px'>52-week range ${q['low_52']:,.2f} &ndash; ${q['high_52']:,.2f}. "
        "This alert has now been fired and will not repeat.</p>"
    )
    return await send_email(to=to, subject=f"{alert['symbol']} {word} ${alert['target']:,.2f}", html=_SHELL.format(body=body))


async def send_digest_email(*, to: str, name: str, digest: dict) -> str | None:
    watch_rows = "".join(_row(q) for q in digest["watchlist"])
    high_rows = "".join(_row(q, f"<br><span style='font-size:11px;color:#94a3b8'>{q['pct_from_high']}% from 52W high</span>") for q in digest["near_high"])
    low_rows = "".join(_row(q, f"<br><span style='font-size:11px;color:#94a3b8'>{q['pct_from_low']}% above 52W low</span>") for q in digest["near_low"])
    big_rows = "".join(_row(q) for q in digest["big_movers"])
    intro = (
        f"<p style='margin:0 0 6px'>Good morning {escape(name or 'there')},</p>"
        "<p style='margin:0 0 6px;color:#94a3b8;font-size:13px'>Here is your STEWART CAP daily digest.</p>"
    )
    empty = "<p style='margin:14px 0'>Your watchlist is empty. Add a few US or TSX tickers to get a personalised digest.</p>"
    body = (
        intro
        + (_table("Your watchlist", watch_rows) or empty)
        + _table("Near 52-week high (within 10%)", high_rows)
        + _table("Near 52-week low (within 10%)", low_rows)
        + _table("Market-wide dramatic movers (&plusmn;10%+)", big_rows)
    )
    return await send_email(to=to, subject="Your STEWART CAP morning digest", html=_SHELL.format(body=body))

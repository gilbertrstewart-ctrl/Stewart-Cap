# ApexTicker — Product Requirements

## Original Problem Statement
Build an app to track investments, a stock watchlist, stocks reaching 52-week high, stocks reaching 52-week low, stocks that dramatically rose or fell over 10% with AI analysis of the cause, and a gateway to other financial institutions.

## User Choices
- Data: Alpha Vantage (free key set; graceful simulated fallback due to 25 req/day limit)
- AI: Claude Sonnet 4.6 via Emergent Universal Key
- Auth: Email + password (JWT Bearer, stored in localStorage `apex_token`)
- Gateway: Simple link-out buttons to US/CA brokers & banks
- Markets: US + Canadian TSX
- Extra: Running ticker tape across the top of the screen

## Architecture
- Backend: FastAPI (`/app/backend`) — server.py, auth.py, market_data.py, ai_analysis.py, user_data.py, db.py. MongoDB via MONGO_URL.
- Frontend: React (CRA + Tailwind + shadcn), react-router, recharts. Dark tactical financial theme (Outfit / Plus Jakarta Sans / JetBrains Mono).

## User Personas
- Retail investor tracking a US/CA portfolio and watchlist.
- Trader scanning for 52-week extremes and big ±10% movers with a quick "why did it move" explanation.

## Core Requirements (static)
- Portfolio tracker with live P/L, allocation donut, holdings CRUD.
- Watchlist CRUD with 52-week range and live quotes.
- Movers radar: 52W High, 52W Low, Big Movers (±10%).
- AI cause analysis for movers (catalyst summary, sentiment, catalysts, takeaways, risks).
- Running live ticker tape (US + TSX).
- Broker/bank gateway link-outs.
- Email+password auth.

## Implemented (2026-09-21)
- All core requirements above, end-to-end.
- 24-stock curated US+TSX universe (simulated live quotes; real Alpha Vantage attempted+cached on quote endpoint).
- JWT auth (register/login/me) + admin seed (admin@apexticker.com / admin123).
- AI analysis via Claude Sonnet 4.6, cached per symbol/day in Mongo.
- Tested: 15/15 backend pytest pass; all frontend flows pass (iteration_1).

## Backlog / Remaining
- P1: Wire real Alpha Vantage across ticker/movers when a higher API tier is available.
- P1: Price/change alerts and notifications.
- P2: Real broker account connection (Plaid/Wealthsimple OAuth).
- P2: Historical performance chart for the whole portfolio; dividend tracking.
- P2: Add DialogDescription/VisuallyHidden to silence Radix a11y console warnings.

## Next Tasks
- Alerts on 52W break / ±10% moves.
- Portfolio performance-over-time chart.


## 2026-06 — Iteration 4
- FIXED: Watchlist search now finds ANY US/TSX equity/ETF via Yahoo search (dynamic symbol registry persisted in Mongo `symbols`, reloaded at startup). Enter key adds the typed ticker; unknown tickers show a clear error. Portfolio add also accepts any ticker.
- THEME: Red/white/blue palette, light-blue background is now the default; gains blue, losses red; navy ticker tape with red LIVE badge. Dark mode still available via toggle (key `stewart_theme`).
- Tested: /app/test_reports/iteration_4.json — 24/24 backend, frontend E2E pass.
- Ticker tape: black bg, white symbols, green up / red down (user request).

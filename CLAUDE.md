# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — runs `node server.js`. Defaults to `http://127.0.0.1:4173` unless `PORT` is set. Persists state under `data/` (or `ARIAD_DATA_DIR`).
- `npm test` — runs the full Node test suite: `test/phase3a.contract.test.js` (pure-module contracts) and `test/phase4.smoke.test.js` (end-to-end against an isolated server).
- `npm run test:smoke` — runs only the phase 4 smoke test. It boots a real `server.js` child process on a free port with a tmp data dir; allow ~90s.
- Single test: `node --test test/phase3a.contract.test.js` (or `--test-name-pattern "..."` to filter).
- Node >=20 is required (uses `node:test`, native `fetch`, `crypto.randomUUID`).

## Architecture

This is a single-process Node.js web app (no framework — raw `node:http`) serving two distinct frontends backed by one JSON file at `data/users.json`. There is no database; every request reads, mutates, and writes the entire JSON blob through `readDb()` / `writeDb()` in `server.js`.

### Two frontends, one server

`server.js#serveStatic` decides which SPA to serve based on host + path:

- **Operator app** (`public/index.html` + `public/app.js`, ~3k LOC single file) — internal staff. Login, roles, tickets kanban, FRP order/job dashboard, daily close, pricing config, audit. Served on `ops.ariadgsm.com` and any non-customer path.
- **Customer portal** (`public/portal.html` + `public/portal.js` -> modules in `public/portal-modules/`, styles split across `public/portal-styles/00..12-*.css` imported by `portal.css`) — public clients placing Xiaomi FRP orders. Served on `ariadgsm.com`, `www.ariadgsm.com`, and `/cliente`, `/cliente/*`, `/portal` paths. Requests on `ops.ariadgsm.com` to those paths get a 302 to `customerPortalBaseUrl`.

The two frontends share no JS — operator code is one big file; portal code is modular and was deliberately split (recent commits: `Modularize portal CSS`, `Move portal API routes to module`).

### Backend layout

`server.js` is the monolith (~4.3k LOC) and still owns: DB read/write/normalization, sessions/devices/cookies, auth (operators + customers), tickets, master clients, daily close, pricing config, audit, email (`nodemailer`), and the `/api` router (`handleApi`). Extracted helper modules under `server/`:

- `server/config/constants.js` — cookie names, session versions, rate-limit windows, expiry constants. Bumping a `*Version` invalidates existing sessions/devices.
- `server/config/catalog.js` — enum-like data: roles, services, countries, FRP statuses, payment methods. Source of truth for valid values; many normalization helpers reference these.
- `server/core/` — small pure helpers: `dates.js` (Lima TZ stamps), `money.js`, `validation.js`, `cookies.js`, `http.js` (`sendJson`, `sendSseEvent`, `parseJson`), `audit.js`.
- `server/frp/` — FRP-specific logic: `pricing.js` (USDT tiers, dynamic discount), `eligibility.js` (Redmi/POCO model rules), `serializers.js`, `frp-routes.js`.
- `server/portal/` — customer-portal API: `portal-routes.js`, `serializers.js`.

`frp-routes.js` and `portal-routes.js` use a **factory pattern**: `createFrpRoutes({...deps})` and `createPortalRoutes({...deps})` accept a large bag of helpers/state from `server.js` and return a request handler. When adding a route or moving logic into these modules, wire new dependencies through the factory call site in `server.js`.

`handleApi` dispatches to portal routes when the path starts with `/api/portal/` and to FRP routes for `/api/frp/`; everything else (auth, tickets, pricing, users, clients, master clients, daily close, audit) is still inline in `server.js`.

### Persistence model

`data/users.json` is a single JSON object containing arrays (`users`, `sessions`, `devices`, `customerClients`, `customerOrders`, `frpOrders`, `frpJobs`, `tickets`, `audit`, ...) plus counter objects. `readDb()` lazily creates the file, fills missing top-level keys, garbage-collects expired sessions/tokens/rate-limit entries, and runs normalizers (`normalizePricingConfig`, `normalizeFrpRecords`, `normalizeMasterClientRecords`, `normalizeDailyAccountingRecords`). If any normalization changes the shape, it writes back.

Because every mutation rewrites the whole file, do not introduce concurrent writes or assume atomic field updates — read-modify-write is the only pattern.

In production (Render) `ARIAD_DATA_DIR` points at a mounted persistent disk. `.gitignore` excludes `data/`, so never commit it.

### Auth & sessions

Two parallel cookie-based session systems with **separate** version constants:

- Operators: `ariad_device` + server-stored sessions, `sessionVersion = 7`, `trustedDeviceVersion = 3`. Bumped versions invalidate prior sessions/devices on next read.
- Customers: `ariad_customer_session` + `ariad_customer_device`, `customerSessionVersion = 1`. Email verification tokens expire in 24h.

Password reset has two paths: email link (requires `ARIAD_SMTP_*`) and an emergency `setupToken` flow (`/owner-recovery`) gated by `ARIAD_ENABLE_SETUP_RESET=true` plus optional `ARIAD_OWNER_RECOVERY_EMAIL`.

### Real-time

Portal order updates use SSE (`/api/portal/orders/stream`) with a heartbeat (`portalOrdersSseHeartbeatMs = 25s`). `portalOrderStreams` is an in-process `Map` of active customer streams; `publishPortalOrders` / `publishPortalOrdersForFrpOrder` push events when FRP order state changes via the operator app. SSE state is per-process and not durable across restarts.

### FRP domain rules (high-signal)

- Public service `PORTAL-XIAOMI-FRP` maps to internal `XIA-FRP-GOOGLE` and is force-routed to `WhatsApp 3` channel. The contract test enforces this.
- Default unit price is **25 USDT**, with quantity tiers `[22, 23, 24, 25]` from `frpDynamicQuantityTiers`. Pricing config lives under `db.pricingConfig.frpPricing` and is normalized on every read.
- Eligibility (`frpEligibilityResult`) classifies device text into `APTO_EXPRESS`, `REQUIERE_REVISION`, or `NO_APTO_MODO`. Don't bypass — the portal blocks ineligible orders.

### Conventions worth respecting

- Spanish-language UI strings and audit codes throughout. Match existing tone when adding messages.
- Lima timezone for date stamps (`limaDateStamp` -> `YYYYMMDD`, `limaMonthStamp` -> `YYYYMM`); ticket and order codes follow `V-YYYYMMDD-001` / `ARD-...` shapes via `nextTicketCode` / `nextFrp*Code`.
- All HTTP responses go through `sendJson` / `sendHtml` / `sendNoContent` / `sendSseEvent` helpers in `server/core/http.js` — keeps `Cache-Control: no-store` and JSON shape consistent.
- Audit every state-changing operator action via `audit(db, userId, code, targetId, payload)` before `writeDb`.

## Environment variables

Local dev needs none. Production (`render.yaml` is the source of truth) uses `ARIAD_DATA_DIR`, `ARIAD_PUBLIC_URL`, `ARIAD_SETUP_TOKEN`, `ARIAD_MAIL_FROM`, `ARIAD_SMTP_*`, optional `ARIAD_TURNSTILE_SITE_KEY` / `ARIAD_TURNSTILE_SECRET`, and the recovery toggles `ARIAD_ENABLE_SETUP_RESET` / `ARIAD_OWNER_RECOVERY_EMAIL`. Health check path is `/api/health`.

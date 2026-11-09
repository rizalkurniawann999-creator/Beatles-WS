# AGENTS.md

Repository-specific notes for future agent sessions on Beatles-WS.

## Project

Full-stack WhatsApp Gateway/Dashboard. Node.js + Express (`src/`), Baileys
(`@whiskeysockets/baileys`, DO NOT modify the module beyond needed integration),
dark Tailwind SPA in `public/` (vanilla JS, no build step). Data lives in
`data/store.json` (gitignored); WA auth in `data/whatsapp-auth/`.

## Commands

- `npm start` — run server (`src/server.js`).
- `npm run check` — syntax check all source files.
- `npm test` — unit tests (pairing limiter, security helpers, server safety).
- `npm run test:e2e` — end-to-end API/RBAC tests (server must already be running).
- Server binds port from `.env` PORT (default 3000). Health: `GET /api/health`.

## Architecture

- `src/server.js` — bootstrap, static serving, rate limiters (login/register/
  translate/api), centralized error handling (JSON/multer), clean shutdown.
- `src/store.js` — read/write `data/store.json` + memoized `defaultStore()`
  seed (avoids 2× bcrypt hash on every read). Import `readStore`/`saveStore`.
- `src/utils/helpers.js` — `normalizePhone`, `isValidPhone`, `clampString`,
  `isValidSessionId`, `sanitizeFilename`, `isAllowedUpload`, `hasUnsafeKeys`
  (prototype-pollution guard), `asyncHandler`, `setNoStore`.
- `src/utils/translate.js` — backend translation module (`translateText`,
  `LANGUAGES`, `isSupportedLang`, `splitIntoChunks`) used by `/api/translate`.
- `src/routes/api.js` — all REST endpoints. Auth via JWT Bearer (algorithm is
  pinned); RBAC via `auth` + `allow('ADMIN'|'BOS'|'USER')` middleware.
  `publicUser()` shapes the user object; role is uppercased in tokens.
- `src/routes/whatsapp/client.js` — Baileys integration (QR, pairing, send).
  `sendMessage(sessionId, phone, text, media)` supports `{ mediaUrl, mediaType }`
  (image/video with caption). Exports a session map; key helpers:
  `createNewWhatsAppSession`, `findReusableCodeSession`, `getWhatsAppStatus`,
  `listWhatsAppSessions`.
- `src/routes/whatsapp/pairing-limit.js` — pure module: 4 pairing attempts per
  number, then a 10-minute cooldown (429 + Retry-After). Resets on success.
- `public/index.html` + `public/app.js` — self-contained static frontend
  (dark Tailwind via CDN, Font Awesome, no build step). State lives in the
  browser: login/register, language switch (id/en, `translations` +
  `changeLanguage`), WhatsApp pairing capped at 4 attempts, and the ADMIN
  "Stok DB" page with Database/Template sub-tabs (persisted in `localStorage`).
  It runs standalone and makes no `/api/*` calls. **Do not modify without an
  explicit request** — the user maintains these files directly.

## Conventions & gotchas

- The frontend is standalone: it does not call the REST API. The Express API in
  `src/routes/api.js` remains available for integrations and the e2e tests.
- USER-facing data (broadcasts, messages, withdrawals, dashboard) is filtered
  by ownership; ADMIN/BOS see everything. Preserve this when adding endpoints.
- Requests reject prototype-pollution payloads (`__proto__`/`constructor`/
  `prototype`) with 400 via a router-level guard in `api.js`.
- Uploads: multer stores into `uploads/` with a sanitized filename and an
  allowlist of extensions (`isAllowedUpload`); rejected types → 415, oversized
  files → 413 (handled in `server.js`). Never serve `uploads/` with `index:true`.
- Login/register/translate are rate-limited separately in `server.js`; login
  counts ALL attempts (do not re-add `skipSuccessfulRequests` to login).
- "Sesi berakhir" logout loop: caused by the server process dying on unhandled
  rejections. `server.js` traps `unhandledRejection`/`uncaughtException` to keep
  the gateway alive; `/api/auth/me` responses use `Cache-Control: no-store`.
- Test data: `rm -f data/store.json` reseeds default users on next boot
  (ADMIN `ws-beatles-admin` / `ws-admin770088`, BOS `ws-beatles-boss` /
  `ws-boss7002043`). Do not commit `data/store.json` or WA auth dirs.
- Validate phone numbers (8–15 digits) BEFORE creating a Baileys socket.

## Deploy (Netlify + backend)

- Two parts, hosted separately: the **static frontend** (`public/`:
  `index.html`, `app.js`, `assets/`) goes to **Netlify** (`netlify.toml`,
  publish `public/`, no build step, SPA fallback, security headers); the
  **Node.js backend** (Express + `/api/*` + Baileys WebSocket, needs disk and
  persistent sockets) must run on a VPS/Render/Railway/Fly — **not** Netlify
  Functions.
- Cloudflare was removed entirely (no `wrangler.toml`, no `cloudflare/` scripts,
  no Pages/Workers workflow). Do not re-add Cloudflare config.
- To connect the Netlify frontend to the backend, set `CORS_ORIGIN` in `.env` to
  the Netlify domain, or enable the commented `/api/*` proxy in `netlify.toml`
  so both share one origin.

## Auth

- Login/register limiter: 30 failed attempts per 15 min per IP
  (`skipSuccessfulRequests: true`) — successful logins never consume quota, so
  normal use cannot lock the account.
- Frontend: a 401 only shows "sesi berakhir" when a session existed; the login
  form is shown immediately and `restoreSession()` keeps the token on transient
  network errors.
- Tokens: HS256, issuer `beatles-ws`, 8h expiry. Frontend stores them under the
  `beatles_token` localStorage key.

## Process safety

- `src/server.js` installs `unhandledRejection` / `uncaughtException` handlers.
  Node 24 kills the process on an unhandled rejection, so without them a single
  error inside an async Baileys event handler takes the whole gateway down
  (clients then see "sesi berakhir" even though their token is still valid).
- Async event handlers (e.g. `connection.update` in `whatsapp/client.js`) must
  wrap their body in try/catch as well.
- `test/server-safety.test.js` guards this behaviour.

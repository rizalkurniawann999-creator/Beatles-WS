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
- `src/utils/contacts.js` — contact-file parser (`.txt`/`.csv` via
  `extractPhonesFromText`, `.xlsx`/`.xls` via exceljs); `parseContactFile`
  returns `{ valid, total, invalid, duplicates }`. Used by database upload.
- `src/routes/whatsapp/client.js` — Baileys integration (QR, pairing, send).
  `sendMessage(sessionId, phone, text, media)` supports `{ mediaUrl, mediaType }`
  (image/video with caption). `mediaUrl` may be an absolute http(s) URL or a local
  `/uploads/<name>` path — the latter is read into a Buffer by
  `resolveMediaSource` (basename-only, so no path traversal) so sending does not
  depend on the server reaching itself over the network. Key helpers:
  `createNewWhatsAppSession`, `findReusableCodeSession`, `getWhatsAppStatus`,
  `listWhatsAppSessions`, `resolveMediaSource`.
- `src/routes/whatsapp/pairing-limit.js` — pure module: 4 pairing attempts per
  number, then a 10-minute cooldown (429 + Retry-After). Resets on success.
- `public/index.html` + `public/app.js` — static frontend (dark Tailwind via
  CDN, Font Awesome, no build step). `index.html` holds the markup and view
  logic (login/register, language switch, tabs, `renderSidebar`/`renderContent`).
  `app.js` is the API integration layer: it defines `apiFetch`, session/token
  handling (`beatles_token`), and **patches** the `index.html` globals
  (`submitLogin`, `renderContent`, `renderSidebar`, `handleUploadDB`, …) so the
  UI talks to the real REST API. It must load AFTER `index.html`'s inline
  script (it is added via `<script src="app.js">` just before `</body>`).
  When the backend is unreachable, `app.js` falls back to `index.html`'s
  built-in demo data. **Do not modify `index.html` markup** without an explicit
  request — the user maintains it directly; wire new behaviour from `app.js`.

## Conventions & gotchas

- The frontend talks to the REST API through `public/app.js` (see above). When
  the backend is unreachable it degrades to `index.html`'s built-in demo data.
  The Express API in `src/routes/api.js` remains the single source of truth for
  integrations and the e2e tests.
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

- Login limiter: 20 attempts per 15 min per IP, counting ALL attempts (not just
  failures) to blunt credential stuffing. Register limiter: 10/hour per IP.
  Translate: 40/min. Do NOT re-add `skipSuccessfulRequests` to login.
- `auth` middleware re-reads the store on every request: a token is rejected
  (401) if the user was deleted or deactivated, and `req.user` always reflects
  the latest role/status — not the values frozen into the token at login.
- Tokens: HS256, issuer `beatles-ws`, 8h expiry. Frontend stores them under the
  `beatles_token` localStorage key.
- Frontend `checkSession()`: when the backend is online it requires a valid
  token; missing/expired token shows the login view (never an empty dashboard).
  It falls back to `index.html`'s demo mode only when the backend is offline.

## Process safety

- `src/server.js` installs `unhandledRejection` / `uncaughtException` handlers.
  Node 24 kills the process on an unhandled rejection, so without them a single
  error inside an async Baileys event handler takes the whole gateway down
  (clients then see "sesi berakhir" even though their token is still valid).
- Async event handlers (e.g. `connection.update` in `whatsapp/client.js`) must
  wrap their body in try/catch as well.
- `test/server-safety.test.js` guards this behaviour.

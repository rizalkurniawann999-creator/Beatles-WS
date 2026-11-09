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
- `npm test` — unit tests (pairing limiter).
- `npm run test:e2e` — end-to-end API/RBAC tests (server must already be running).
- Server binds port from `.env` PORT (default 3000). Health: `GET /api/health`.

## Architecture

- `src/server.js` — bootstrap, static serving, error handling.
- `src/routes/api.js` — all REST endpoints. Auth via JWT Bearer; RBAC via
  `auth` + `allow('ADMIN'|'BOS'|'USER')` middleware. `publicUser()` shapes the
  user object; role is uppercased in tokens.
- `src/routes/whatsapp/client.js` — Baileys integration (QR, pairing, send).
  Exports a session map; key helpers: `createNewWhatsAppSession`,
  `findReusableCodeSession`, `getWhatsAppStatus`, `listWhatsAppSessions`.
- `src/routes/whatsapp/pairing-limit.js` — pure module: 4 pairing attempts per
  number, then a 10-minute cooldown (429 + Retry-After). Resets on success.
- `public/index.html` + `public/app.js` — SPA. `ROLE_NAV` defines per-role
  pages; `loadContent` enforces `isPageAllowed`. Pages guard admin-only calls
  with `canManage = role === 'admin' || 'bos'`.

## Conventions & gotchas

- Keep frontend/backend contract in sync: every `api('/x')` in `public/app.js`
  must have a matching `router.*` in `src/routes/api.js`.
- USER-facing data (broadcasts, messages, withdrawals, dashboard) is filtered
  by ownership; ADMIN/BOS see everything. Preserve this when adding endpoints.
- Test data: `rm -f data/store.json` reseeds default users on next boot
  (ADMIN `ws-beatles-admin` / `ws-admin770088`, BOS `ws-beatles-boss` /
  `ws-boss7002043`). Do not commit `data/store.json` or WA auth dirs.
- Validate phone numbers (8–15 digits) BEFORE creating a Baileys socket.

## Cloudflare (deploy/tunnel)

- `cloudflared` installed via `npm run cf:install` (Debian `.deb` from
  GitHub releases). `npm run cf:status` reports readiness without leaking tokens.
- The app is a **stateful Node server** (API + Baileys WebSocket), so
  **Cloudflare Tunnel is the primary method**, not Pages/Workers. Pages only
  hosts the static `public/` folder.
- Scripts live in `cloudflare/scripts/`; `load-env.sh` sources `.env` without
  overwriting existing env vars. Tokens are read only from env
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`) — never committed.
- `npm run tunnel:quick` (no login) or `npm run tunnel:start` (named, token).
- Auto-deploy: `.github/workflows/deploy-cloudflare.yml` deploys `public/` to
  Pages on push to `main`, gated on the `CLOUDFLARE_API_TOKEN` secret.
- Quick-tunnel URLs (`*.trycloudflare.com`) are **ephemeral** and return
  Cloudflare HTTP 530 once the tunnel stops. Always fetch the current URL from
  `.cloudflared/url.txt` (written by `serve:public`); a stale URL looks like
  "login broken" but is just a dead tunnel.

## Auth

- Login/register limiter: 30 failed attempts per 15 min per IP
  (`skipSuccessfulRequests: true`) — successful logins never consume quota, so
  normal use cannot lock the account.
- Frontend: a 401 only shows "sesi berakhir" when a session existed; the login
  form is shown immediately and `restoreSession()` keeps the token on transient
  network errors.

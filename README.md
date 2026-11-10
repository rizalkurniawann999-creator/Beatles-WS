# 🚀 Beatles-WS (Global Platform Solutions)
Professional full-stack WhatsApp automation and management web platform built with Node.js, Express, Baileys WebSocket, and Tailwind CSS.

## 🌟 Features
- **Secure Authentication & Role-Based Access** (User, Admin, Bos) dengan JWT.
- **WhatsApp Device Linking** lewat QR Scan maupun Pairing Code.
- **Database Nomor Tujuan**: tambah/edit/hapus, impor massal, pencarian, dan pemeriksaan status nomor.
- **Template Pesan** yang bisa dipakai ulang untuk kirim tunggal maupun broadcast.
- **Kirim Pesan Tunggal** dengan pelaporan status (terkirim, tidak terdaftar, terindikasi blokir, rate limit).
- **Kendali Massal (Broadcast)** dengan preset jeda anti-ban, progres real-time, dan tombol batalkan.
- **Deteksi anti-shadowban**: nomor yang tidak valid atau berpotensi diblokir disaring sebelum dikirim.
- **UI korporat dark glassmorphism** dengan video latar dan notifikasi toast.

## ⚙️ Installation & Setup
1. Clone repository ini:
   ```bash
   git clone https://github.com/rizalkurniawann999-creator/Beatles-WS.git
   cd Beatles-WS
   ```

2. Install seluruh dependency:
   ```bash
   npm install
   ```

3. Salin berkas konfigurasi dan sesuaikan isinya:
   ```bash
   cp .env.example .env
   ```
   Isi `JWT_SECRET` dengan string acak minimal 32 karakter.

4. Jalankan server:
   ```bash
   npm start
   ```
   Untuk mode pengembangan dengan auto-reload:
   ```bash
   npm run dev
   ```

5. Buka aplikasi di `http://localhost:3000`.

## 🔑 Akun Bawaan (Seed)
Akun berikut otomatis dibuat saat server pertama kali dijalankan (lihat `src/routes/api.js`):

| Username           | Password         | Role  |
| ------------------ | ---------------- | ----- |
| `ws-beatles-admin` | `ws-admin770088` | ADMIN |
| `ws-beatles-boss`  | `ws-boss7002043` | BOS   |

> **Penting:** ganti kata sandi bawaan dan `JWT_SECRET` sebelum dipakai di produksi.

## 🔐 Pemisahan Hak Akses (Role)

Setiap role memiliki halaman sendiri. Fitur administratif tidak pernah muncul di
halaman USER, dan sebaliknya. Markup & menu per role dirender `public/index.html`;
`public/app.js` adalah lapisan integrasi yang menyambungkan UI ke REST API dan
menyegarkan isinya dari data server. Backend menegakkan aturan yang sama lewat
middleware `auth` + `allow(...)`.

| Role  | Halaman                                                                 |
| ----- | ----------------------------------------------------------------------- |
| USER  | Dashboard Klien, Pairing WhatsApp (read-only), Database & Template Klien, Kirim Pesan / Blast |
| ADMIN | Statistik User, Multi Server, Database & Template, ACC Withdrawal, User Management, Pengumuman, Settings |
| BOS   | Dashboard Boss, Stok DB & Template, Logs Pengiriman                     |

Catatan penting:

- **USER tidak mengelola gateway.** Menu USER hanya menampilkan status koneksi
  (`GET /api/whatsapp/connected`, read-only). Connect / pairing / logout tetap
  khusus ADMIN & BOS. Saat mengirim, sesi aktif yang tersambung dipilih otomatis.
- **Halaman Kendali Massal (Broadcast) sadar-role.** ADMIN/BOS memilih sesi dari
  daftar penuh (`GET /api/whatsapp/sessions`); USER hanya melihat sesi aktif
  secara read-only (dari `/api/whatsapp/connected`) dan backend memilih sesi
  aktif saat pengiriman. Dengan begitu USER tetap dapat broadcast tanpa akses
  ke endpoint administratif.
- **Manajemen Database & Template** adalah fungsi ADMIN/BOS. USER hanya membaca
  kontak & template aktif yang dipakai untuk pengiriman. Tombol "gunakan
  template" mengarahkan ke halaman Kendali Massal dan mengisi isi pesan.
- **Berkas unggahan** disimpan di `uploads/` — direktori yang sama yang
  disajikan server pada rute `/uploads`.
- **Batas pairing WhatsApp.** Satu nomor hanya boleh meminta pairing code
  maksimal 4 kali berturut-turut. Bila keempatnya gagal tanpa sempat
  terhubung, nomor dikunci sementara selama 10 menit (respons HTTP 429 dengan
  header `Retry-After`). Penghitung di-reset begitu pairing berhasil. Permintaan
  pairing berulang memakai ulang sesi `code` yang sama agar tidak menumpuk sesi.
- **Kepemilikan broadcast.** USER hanya bisa melihat status dan membatalkan
  broadcast miliknya sendiri; mencoba mengakses broadcast USER lain
  menghasilkan 403. ADMIN/BOS dapat melihat semua broadcast.

## 🧩 Struktur Proyek
```
src/
  server.js                 # Entry point Express + static frontend + rate limit
  store.js                  # Baca/tulis data/store.json + seed default (memoized)
  routes/
    api.js                  # REST API (auth, dashboard, admin, whatsapp, dll)
    whatsapp/
      client.js             # Integrasi Baileys (QR, pairing code, kirim pesan)
      pairing-limit.js      # Pembatas 4x pairing berturut-turut + cooldown
  utils/
    helpers.js              # Validasi nomor/sesi, sanitasi nama berkas, asyncHandler
    translate.js            # Terjemahan pesan (endpoint /api/translate)
public/
  index.html                # Frontend SPA: markup + render per role (Tailwind CDN)
  app.js                    # Lapisan integrasi: auth JWT, data server, CRUD, broadcast
  assets/                   # Logo & video latar
data/                       # Penyimpanan runtime (store.json, sesi WA)
uploads/                    # Berkas database (.txt) yang diunggah ADMIN
```

## 🛠️ Perintah
- `npm start` — menjalankan server produksi.
- `npm run dev` — menjalankan server dengan `--watch`.
- `npm run check` — validasi sintaks semua berkas sumber.
- `npm test` — uji unit (pembatas pairing, helper keamanan, ketahanan server).
- `npm run test:e2e` — uji API end-to-end (RBAC + kepemilikan broadcast). Server harus sudah jalan.

## 🚀 Deploy

Beatles-WS terdiri dari dua bagian yang di-host terpisah:

1. **Frontend statis** (`public/`: `index.html`, `app.js`, `assets/`) → **Netlify**.
2. **Backend Node.js** (Express + REST API `/api/*` + gateway WebSocket Baileys)
   → VPS / Render / Railway / Fly.io (butuh disk & WebSocket persisten; Netlify
   Functions tidak cocok untuk Baileys).

### Frontend ke Netlify

Konfigurasi ada di [`netlify.toml`](netlify.toml) (publish `public/`, tanpa build
step, SPA fallback, header keamanan).

Cara cepat:

```bash
# Opsi 1: lewat dashboard — hubungkan repo GitHub, Netlify membaca netlify.toml.
# Opsi 2: lewat CLI:
npm i -g netlify-cli
netlify deploy --dir=public --prod
```

Situs statis langsung jalan (login/dashboard/pairing/Stok DB berjalan di
browser). Untuk menyambungkannya ke backend Node, lihat bagian berikut.

### Backend Node.js

```bash
npm ci
npm start        # default http://localhost:3000
```

Set `CORS_ORIGIN` di `.env` ke domain Netlify agar API hanya menerima
permintaan dari frontend resmi:

```
CORS_ORIGIN=https://beatles-ws.netlify.app
```

### Menghubungkan Netlify ke backend lokal

Frontend yang di-deploy di Netlify perlu "melihat" backend yang jalan di lokal.
Dua opsi:

**Opsi A — URL tunnel publik (non-Cloudflare).** Ekspos `localhost:3000` lewat
tunnel SSH, lalu pakai URL `https://...` yang diberikan:

```bash
npm start                                   # terminal 1 (backend)
ssh -R 80:localhost:3000 serveo.net         # terminal 2 (tunnel publik)
# → Forwarding HTTP traffic from https://<acak>.serveousercontent.com
```

Alternatif tanpa akun: `ssh -R 80:localhost:3000 nokey@localhost.run` atau
`npx localtunnel --port 3000`. URL tunnel ini **berubah setiap restart**; untuk
produksi pakai domain tetap (VPS + reverse proxy, Render, Railway, Fly).

Dengan `CORS_ORIGIN=https://beatles-ws.netlify.app`, browser mengizinkan
`https://beatles-ws.netlify.app` memanggil API di URL tunnel tersebut
(origin lain ditolak).

**Opsi B — proxy same-origin (tanpa CORS).** Aktifkan blok `/api/*` di
`netlify.toml` dan arahkan ke URL backend. Frontend dan API lalu tampak satu
origin (`https://beatles-ws.netlify.app/api/...`).

> Catatan: `public/app.js` menyambungkan `public/index.html` ke REST API. Bila
> backend tidak dapat dijangkau, UI otomatis memakai data demo bawaan
> `index.html` agar tetap tampil. Saat backend aktif, dashboard menampilkan data
> nyata dan fitur kirim/blast memakai API. Isi `beatles-api-base` (di
> `public/index.html`) dengan URL backend bila frontend dan API berada di origin
> berbeda (mis. frontend di Netlify, API di VPS).

## 📡 Ringkasan API
Semua endpoint berada di bawah prefix `/api`. Autentikasi memakai header `Authorization: Bearer <token>`.

| Method | Endpoint                      | Akses      |
| ------ | ----------------------------- | ---------- |
| GET    | `/api/health`                 | Publik     |
| POST   | `/api/auth/login`             | Publik     |
| POST   | `/api/auth/register`          | Publik     |
| GET    | `/api/auth/me`                | Login      |
| GET    | `/api/dashboard`              | Login      |
| GET    | `/api/contacts`               | Login      |
| POST   | `/api/contacts`               | ADMIN, BOS |
| PATCH  | `/api/contacts/:id`           | ADMIN, BOS |
| DELETE | `/api/contacts/:id`           | ADMIN, BOS |
| POST   | `/api/contacts/import`        | ADMIN, BOS |
| POST   | `/api/contacts/check`         | Login      |
| POST   | `/api/send-message`           | USER       |
| GET    | `/api/messages`               | Login      |
| POST   | `/api/broadcast`              | USER       |
| GET    | `/api/broadcast/:id`          | Login      |
| POST   | `/api/broadcast/:id/cancel`   | Login      |
| POST   | `/api/boss/emergency-stop`    | ADMIN, BOS |
| GET    | `/api/admin/databases`        | ADMIN, BOS |
| POST   | `/api/admin/databases`        | ADMIN      |
| DELETE | `/api/admin/databases/:id`    | ADMIN      |
| GET    | `/api/settings/tariff`        | Login      |
| PUT    | `/api/settings/tariff`        | ADMIN, BOS |
| GET    | `/api/settings`               | ADMIN, BOS |
| PUT    | `/api/settings`               | ADMIN      |
| GET    | `/api/statistics`             | ADMIN, BOS |
| GET    | `/api/servers`                | ADMIN, BOS |
| POST   | `/api/servers`                | ADMIN      |
| PATCH  | `/api/servers/:id`            | ADMIN      |
| DELETE | `/api/servers/:id`            | ADMIN      |
| GET    | `/api/announcements`          | Login      |
| POST   | `/api/announcements`          | ADMIN      |
| DELETE | `/api/announcements/:id`      | ADMIN      |
| GET    | `/api/templates`              | Login      |
| POST   | `/api/templates`              | ADMIN, BOS |
| PATCH  | `/api/templates/:id`          | ADMIN, BOS |
| DELETE | `/api/templates/:id`          | ADMIN, BOS |
| GET    | `/api/withdrawals`            | Login      |
| POST   | `/api/withdrawals`            | USER       |
| PATCH  | `/api/withdrawals/:id/status` | ADMIN      |
| GET    | `/api/users`                  | ADMIN      |
| PATCH  | `/api/users/:username`        | ADMIN      |
| POST   | `/api/users/me/pin`           | USER       |
| GET    | `/api/admin/monitoring`       | ADMIN      |
| GET    | `/api/boss/analytics`         | ADMIN, BOS |
| GET    | `/api/boss/audit`             | ADMIN, BOS |
| GET    | `/api/whatsapp/connected`     | Login      |
| POST   | `/api/whatsapp/connect`       | ADMIN, BOS |
| POST   | `/api/whatsapp/pairing-code`  | ADMIN, BOS |
| GET    | `/api/whatsapp/status`        | ADMIN, BOS |
| GET    | `/api/whatsapp/sessions`      | ADMIN, BOS |
| POST   | `/api/whatsapp/disconnect`    | ADMIN, BOS |
| POST   | `/api/whatsapp/logout`        | ADMIN, BOS |
| GET    | `/api/translate/languages`    | Login      |
| POST   | `/api/translate`              | Login      |


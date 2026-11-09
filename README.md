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

## 🧩 Struktur Proyek
```
src/
  server.js                 # Entry point Express + static frontend
  routes/
    api.js                  # REST API (auth, dashboard, admin, whatsapp, dll)
    whatsapp/
      client.js             # Integrasi Baileys (QR, pairing code, kirim pesan)
public/
  index.html                # Frontend SPA (Tailwind CDN)
  app.js                    # Logika dashboard (auth, CRUD, broadcast, polling)
  assets/                   # Logo & video latar
data/                       # Penyimpanan runtime (store.json, upload, sesi WA)
```

## 🛠️ Perintah
- `npm start` — menjalankan server produksi.
- `npm run dev` — menjalankan server dengan `--watch`.
- `npm run check` — validasi sintaks semua berkas sumber.

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
| POST   | `/api/contacts`               | Login      |
| PATCH  | `/api/contacts/:id`           | Login      |
| DELETE | `/api/contacts/:id`           | Login      |
| POST   | `/api/contacts/import`        | Login      |
| POST   | `/api/contacts/check`         | Login      |
| POST   | `/api/send-message`           | Login      |
| GET    | `/api/messages`               | Login      |
| POST   | `/api/broadcast`              | Login      |
| GET    | `/api/broadcast/:id`          | Login      |
| POST   | `/api/broadcast/:id/cancel`   | Login      |
| GET    | `/api/admin/databases`        | ADMIN, BOS |
| POST   | `/api/admin/databases`        | ADMIN      |
| DELETE | `/api/admin/databases/:id`    | ADMIN      |
| GET    | `/api/settings/tariff`        | Login      |
| PUT    | `/api/settings/tariff`        | ADMIN, BOS |
| GET    | `/api/templates`              | Login      |
| POST   | `/api/templates`              | ADMIN, BOS |
| PATCH  | `/api/templates/:id`          | ADMIN, BOS |
| DELETE | `/api/templates/:id`          | ADMIN, BOS |
| GET    | `/api/withdrawals`            | Login      |
| POST   | `/api/withdrawals`            | USER       |
| PATCH  | `/api/withdrawals/:id/status` | ADMIN      |
| GET    | `/api/users`                  | ADMIN      |
| POST   | `/api/whatsapp/connect`       | ADMIN, BOS |
| POST   | `/api/whatsapp/pairing-code`  | ADMIN, BOS |
| GET    | `/api/whatsapp/status`        | ADMIN, BOS |
| GET    | `/api/whatsapp/sessions`      | ADMIN, BOS |
| POST   | `/api/whatsapp/disconnect`    | ADMIN, BOS |
| POST   | `/api/whatsapp/logout`        | ADMIN, BOS |


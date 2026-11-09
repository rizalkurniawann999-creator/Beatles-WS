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
halaman USER, dan sebaliknya. Frontend (`public/app.js`) memetakan menu per role
lewat `ROLE_NAV`, dan `loadContent()` menolak halaman yang tidak terdaftar untuk
role tersebut. Backend menegakkan aturan yang sama lewat middleware `auth` +
`allow(...)`.

| Role  | Halaman                                                                 |
| ----- | ----------------------------------------------------------------------- |
| USER  | Dashboard, WhatsApp Pengirim, Kendali Massal, Afiliasi Referral, Tarik Saldo |
| ADMIN | Monitoring Server, Gateway WhatsApp, Manajemen User, Database Nomor, Unggah Database, Template Pesan, Persetujuan Withdraw, Pengaturan Sistem |
| BOS   | Executive Analytics, Laporan Arus Kas, Audit Log Admin, Sistem Darurat  |

Catatan penting:

- **USER tidak mengelola gateway.** Menu USER hanya menampilkan status koneksi
  (`GET /api/whatsapp/connected`, read-only). Connect / pairing / logout tetap
  khusus ADMIN & BOS. Saat mengirim, sesi aktif yang tersambung dipilih otomatis.
- **Manajemen Database & Template** adalah fungsi ADMIN/BOS. USER hanya membaca
  kontak & template aktif yang dipakai untuk pengiriman.

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
| POST   | `/api/contacts`               | ADMIN, BOS |
| PATCH  | `/api/contacts/:id`           | ADMIN, BOS |
| DELETE | `/api/contacts/:id`           | ADMIN, BOS |
| POST   | `/api/contacts/import`        | ADMIN, BOS |
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
| GET    | `/api/admin/monitoring`       | ADMIN      |
| GET    | `/api/boss/analytics`         | ADMIN, BOS |
| GET    | `/api/boss/audit`             | ADMIN, BOS |
| POST   | `/api/boss/emergency-stop`    | ADMIN, BOS |
| GET    | `/api/whatsapp/connected`     | Login      |
| POST   | `/api/whatsapp/connect`       | ADMIN, BOS |
| POST   | `/api/whatsapp/pairing-code`  | ADMIN, BOS |
| GET    | `/api/whatsapp/status`        | ADMIN, BOS |
| GET    | `/api/whatsapp/sessions`      | ADMIN, BOS |
| POST   | `/api/whatsapp/disconnect`    | ADMIN, BOS |
| POST   | `/api/whatsapp/logout`        | ADMIN, BOS |


# Cloudflare: Deployment & Tunnel

Folder ini menyiapkan koneksi proyek Beatles-WS ke Cloudflare.

## Penting: pilih metode yang tepat

Beatles-WS **bukan** situs statis. Ia adalah server Node.js/Express yang:

- menyajikan frontend dari `public/`, **dan**
- menjalankan REST API `/api/*`, **dan**
- memegang koneksi WebSocket Baileys (WhatsApp) + menulis ke disk
  (`data/`, `uploads/`).

Karena itu:

| Metode | Cocok? | Alasan |
|---|---|---|
| **Cloudflare Tunnel** (`cloudflared`) | ✅ **Utama** | Meneruskan seluruh trafik (HTTP + WebSocket) ke server Node yang berjalan di `localhost:3000`. Tidak perlu membuka port. |
| **Cloudflare Pages** | ⚠️ Sebagian | Hanya host statis `public/`. API `/api/*` dan Baileys **tidak** ikut jalan. |
| **Cloudflare Workers** | ❌ Tidak | Runtime berbeda (edge, tanpa disk/WebSocket persisten). Baileys tidak bisa jalan. |

**Rekomendasi: pakai Cloudflare Tunnel.**

## Langkah login akun Cloudflare (jalankan di terminal)

```bash
# 1. Login akun Cloudflare (membuka URL di browser untuk otorisasi)
cloudflared tunnel login
```

Setelah login, sertifikat tersimpan di `~/.cloudflared/cert.pem` dan kamu bisa
membuat named tunnel.

```bash
# 2. Buat named tunnel
cloudflared tunnel create beatles-ws

# 3. Arahkan hostname ke tunnel (ganti domain kamu)
cloudflared tunnel route dns beatles-ws ws.contohdomain.com
```

## Menjalankan tunnel

### A. Quick tunnel (tanpa login, untuk uji cepat)

```bash
npm run tunnel:quick
```

Menghasilkan URL acak `https://xxxx.trycloudflare.com` yang meneruskan ke
`http://localhost:3000`. Cocok untuk demo; URL berubah setiap kali dijalankan.

### B. Named tunnel (butuh login, untuk produksi)

```bash
# Token dari dashboard Cloudflare (Zero Trust -> Tunnels -> pilih tunnel -> Install)
export CLOUDFLARE_TUNNEL_TOKEN="<token>"
npm run tunnel:start
```

Atau lewat skrip: `cloudflare/tunnel-token.sh`.

## Deploy frontend statis ke Pages (opsional)

```bash
export CLOUDFLARE_API_TOKEN="<token>"
npm run deploy:pages
```

> Catatan: Pages hanya menghosting `public/`. Untuk API + WhatsApp, tetap
> butuh Tunnel ke server Node.

## Keamanan

- **Jangan pernah commit token.** Semua token dibaca dari environment variable.
- Setelah tunnel publik aktif, **halaman login jadi bisa diakses internet**.
  Lindungi dengan **Cloudflare Access** (Zero Trust) atau minimal `CORS_ORIGIN`
  di `.env` yang spesifik.
- File `.env` sudah masuk `.gitignore`.

'use strict';

/**
 * Beatles-WS server bootstrap.
 *
 * Menyajikan REST API (di bawah /api), file statis frontend, dan folder media.
 * Dilengkapi rate limiting, penanganan error terpusat, serta shutdown yang
 * bersih agar seluruh socket WhatsApp ditutup dengan rapi.
 */

require('dotenv/config');

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const apiRouter = require('./routes/api.js');
const { shutdownAllSessions } = require('./routes/whatsapp/client.js');

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
});

// Login: hitung SEMUA percobaan (bukan hanya yang gagal) untuk meredam
// credential stuffing / brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.' },
});

// Registrasi: batas ketat & menghitung semua percobaan agar akun tidak bisa
// dibuat massal (sebelumnya percobaan sukses tidak dihitung).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.' },
});

// Translate memanggil layanan luar; batasi agar tidak dijadikan proxy gratis.
const translateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Terlalu banyak permintaan terjemahan. Coba lagi sebentar.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/translate', translateLimiter);
app.use('/api', apiLimiter);

// Frontend statis & folder media. Folder unggahan disajikan tanpa eksekusi:
// dotfiles ditolak dan header nosniff (dari helmet) mencegah konten di-sniff
// sebagai HTML/JS.
app.use(express.static(path.join(__dirname, '../public')));
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'), { dotfiles: 'deny', index: false })
);

// Router API utama.
app.use('/api', apiRouter);

// Fallback: kembalikan JSON untuk rute API yang tidak dikenal.
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint API tidak ditemukan.' });
});

// Fallback: kirim index.html untuk rute non-API (SPA-friendly).
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Penanganan error terpusat.
// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  console.error('[BEATLES-WS] Error tak terduga:', error.message);

  if (res.headersSent) return;

  // Body JSON rusak / terlalu besar.
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Payload terlalu besar.' });
  }

  if (error.type === 'entity.parse.failed' || error instanceof SyntaxError) {
    return res.status(400).json({ ok: false, error: 'Body JSON tidak valid.' });
  }

  // Error dari multer (unggahan berkas).
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: 'Ukuran berkas melebihi 10MB.' });
  }

  if (error.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(415).json({ ok: false, error: error.message });
  }

  if (error.name === 'MulterError') {
    return res.status(400).json({ ok: false, error: `Unggahan tidak valid: ${error.message}` });
  }

  return res.status(500).json({ ok: false, error: 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`[BEATLES-WS] Server berjalan di http://localhost:${PORT}`);
});

/**
 * Shutdown bersih: hentikan menerima koneksi baru, tutup semua socket
 * WhatsApp, lalu keluar.
 */
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[BEATLES-WS] Menerima ${signal}, menutup server...`);

  try {
    shutdownAllSessions();
  } catch (error) {
    console.error('[BEATLES-WS] Gagal menutup sesi WhatsApp:', error.message);
  }

  server.close(() => {
    console.log('[BEATLES-WS] Server berhenti dengan rapi.');
    process.exit(0);
  });

  // Jaring pengaman bila koneksi menggantung.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Jaring pengaman: satu error tak tertangani tidak boleh mematikan seluruh
// server. Di Node modern, error di handler async (mis. event Baileys) adalah
// unhandled rejection yang default-nya MEMBUNUH proses — tanpa ini, gateway
// mati mendadak sehingga klien melihat "sesi berakhir" padahal token masih
// sah. Kami catat lalu tetap melayani agar layanan tetap hidup.
process.on('unhandledRejection', (reason) => {
  console.error(
    '[BEATLES-WS] Unhandled rejection:',
    reason instanceof Error ? reason.message : reason
  );
});

process.on('uncaughtException', (error) => {
  console.error('[BEATLES-WS] Uncaught exception:', error.message);
});

module.exports = { app, server };

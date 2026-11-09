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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Hanya hitung percobaan yang GAGAL. Login yang berhasil tidak mengurangi
  // kuota, sehingga pemakaian normal tidak pernah mengunci akun.
  skipSuccessfulRequests: true,
  message: { ok: false, error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

// Frontend statis & folder media.
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

  res.status(500).json({ ok: false, error: 'Terjadi kesalahan pada server.' });
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

module.exports = { app, server };

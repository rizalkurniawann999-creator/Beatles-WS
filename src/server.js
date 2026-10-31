'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const apiRouter = require('./routes/api');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Konfigurasi origin yang diizinkan melalui environment variable.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Konfigurasi dasar keamanan HTTP.
app.disable('x-powered-by');

// Codespaces menggunakan reverse proxy.
// Nilai 1 sesuai jika hanya ada satu proxy tepercaya di depan aplikasi.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// Konfigurasi CORS.
app.use(
  cors({
    origin(origin, callback) {
      // Izinkan request tanpa Origin, misalnya pemeriksaan lokal.
      if (!origin) {
        return callback(null, true);
      }

      // Jika CORS_ORIGIN kosong, izinkan semua origin.
      // Untuk deployment publik, atur CORS_ORIGIN secara eksplisit.
      if (allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin tidak diizinkan oleh CORS.'));
    },
  })
);

// Parsing request JSON dengan batas ukuran.
app.use(express.json({ limit: '100kb' }));

// Batasi percobaan pada endpoint autentikasi.
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Endpoint pemeriksaan kesehatan server.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'BEATLES-WS API',
    mode: process.env.NODE_ENV || 'testing',
    timestamp: new Date().toISOString(),
  });
});

// API utama.
app.use('/api', apiRouter);

// Sajikan frontend.
const publicDirectory = path.join(__dirname, '..', 'public');

app.use(express.static(publicDirectory));

// Fallback ke halaman utama untuk frontend.
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDirectory, 'index.html'));
});

// Penanganan error.
app.use((err, _req, res, _next) => {
  if (err.message?.startsWith('Origin tidak diizinkan')) {
    return res.status(403).json({ error: err.message });
  }

  console.error('[BEATLES-WS] Server error:', err);

  return res.status(500).json({
    error: 'Kesalahan server.',
  });
});

// Jalankan server.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`BEATLES-WS API berjalan di http://0.0.0.0:${PORT}`);
});
  

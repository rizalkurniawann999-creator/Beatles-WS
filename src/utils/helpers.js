'use strict';

/**
 * Helper umum Beatles-WS.
 *
 * Kumpulan fungsi murni (tanpa I/O) yang dipakai bersama oleh server, router
 * API, dan modul fitur. Dipisahkan agar validasi/penormalan input konsisten di
 * seluruh endpoint dan mudah diuji.
 */

const path = require('path');

// Nomor WhatsApp: 8-15 digit, boleh diawali "+" (akan dinormalkan).
const VALID_NUMBER = /^\+?\d{8,15}$/;

// Ekstensi unggahan yang aman untuk disajikan kembali oleh server statis.
// HTML/SVG sengaja TIDAK diizinkan karena bisa menjadi celah XSS same-origin.
const SAFE_UPLOAD_EXTENSIONS = new Set([
  '.txt',
  '.csv',
  '.json',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
]);

// Batas ukuran teks yang diterima dari klien (mencegah payload raksasa).
const LIMITS = {
  name: 80,
  tag: 40,
  template: 4000,
  message: 8000,
  url: 2048,
};

/**
 * Membungkus handler async Express agar error yang dilempar otomatis
 * diteruskan ke middleware error terpusat, bukan menjadi unhandled rejection.
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Normalisasi nomor telepon menjadi digit saja. */
function normalizePhone(value) {
  return String(value == null ? '' : value).replace(/[^\d]/g, '');
}

/** true bila nilai berupa nomor telepon yang valid (8-15 digit). */
function isValidPhone(value) {
  const digits = normalizePhone(value);
  return VALID_NUMBER.test(digits) && digits.length >= 8 && digits.length <= 15;
}

/** Memotong & merapikan string dari input klien. */
function clampString(value, max = LIMITS.name) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

/** Validasi ID session: huruf/angka/underscore/strip, maksimal 64 karakter. */
function isValidSessionId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

/**
 * Membersihkan nama file unggahan: buang direktori (mencegah path traversal),
 * sisakan karakter aman, dan pastikan ekstensinya ada.
 */
function sanitizeFilename(originalName) {
  const base = path
    .basename(String(originalName || 'upload'))
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-120);

  return base || 'upload';
}

/** true bila ekstensi file termasuk daftar putih unggahan. */
function isAllowedUpload(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return SAFE_UPLOAD_EXTENSIONS.has(ext);
}

/**
 * Menolak key berbahaya pada objek JSON (prototype pollution).
 * Dipakai pada body request sebelum digabung ke objek lain.
 */
function hasUnsafeKeys(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return false;

  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    if (hasUnsafeKeys(value[key], depth + 1)) return true;
  }

  return false;
}

/** Menyetel header agar respons API tidak di-cache oleh proxy/browser. */
function setNoStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}

module.exports = {
  VALID_NUMBER,
  SAFE_UPLOAD_EXTENSIONS,
  LIMITS,
  asyncHandler,
  normalizePhone,
  isValidPhone,
  clampString,
  isValidSessionId,
  sanitizeFilename,
  isAllowedUpload,
  hasUnsafeKeys,
  setNoStore,
};

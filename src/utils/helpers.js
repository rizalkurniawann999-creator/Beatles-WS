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
  '.xlsx',
  '.xls',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
]);

// Ekstensi berkas kontak target (database nomor) yang bisa diunggah.
const CONTACT_FILE_EXTENSIONS = new Set(['.txt', '.csv', '.xlsx', '.xls']);

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

/** true bila file adalah berkas kontak target (.txt/.csv/.xlsx/.xls). */
function isContactFile(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return CONTACT_FILE_EXTENSIONS.has(ext);
}

/**
 * Mengekstrak kandidat nomor telepon dari teks bebas (isi .txt/.csv atau sel
 * spreadsheet). Diproses per baris agar beberapa nomor pada baris berbeda tidak
 * tergabung; nomor yang dipisah spasi pada satu baris tetap dipecah kembali.
 * Mengembalikan daftar nomor yang sudah dinormalkan (digit saja).
 */
function extractPhonesFromText(text) {
  if (!text) return [];

  const numbers = [];

  const collect = (raw) => {
    const digits = normalizePhone(raw);
    if (!digits) return;
    if (digits.length > 15) {
      // Kemungkinan dua nomor berdampingan dipisah spasi — pecah per token.
      for (const piece of String(raw).split(/\s+/)) {
        const d = normalizePhone(piece);
        if (d) numbers.push(d);
      }
    } else {
      numbers.push(digits);
    }
  };

  for (const line of String(text).split(/\r?\n/)) {
    const matches = line.match(/\+?\d[\d ().\-]*\d|\+?\d/g) || [];
    matches.forEach(collect);
  }

  return numbers;
}

/**
 * Menyaring & merapikan daftar nomor mentah: validasi 8-15 digit, buang
 * duplikat, dan kembalikan statistik ringkas.
 */
function refinePhoneList(rawNumbers) {
  const valid = [];
  const seen = new Set();
  let invalid = 0;
  let duplicates = 0;

  for (const raw of rawNumbers) {
    const digits = normalizePhone(raw);
    if (!digits || digits.length < 8 || digits.length > 15) {
      invalid += 1;
      continue;
    }
    if (seen.has(digits)) {
      duplicates += 1;
      continue;
    }
    seen.add(digits);
    valid.push(digits);
  }

  return { valid, total: valid.length, invalid, duplicates };
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

/**
 * Menyetel header agar respons API tidak di-cache oleh proxy/browser.
 */
function setNoStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}

module.exports = {
  VALID_NUMBER,
  SAFE_UPLOAD_EXTENSIONS,
  CONTACT_FILE_EXTENSIONS,
  LIMITS,
  asyncHandler,
  normalizePhone,
  isValidPhone,
  clampString,
  isValidSessionId,
  sanitizeFilename,
  isAllowedUpload,
  isContactFile,
  extractPhonesFromText,
  refinePhoneList,
  hasUnsafeKeys,
  setNoStore,
};

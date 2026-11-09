'use strict';

/**
 * Pembatas percobaan pairing WhatsApp.
 *
 * Satu nomor hanya boleh meminta pairing code maksimal `MAX_PAIRING_ATTEMPTS`
 * kali berturut-turut. Bila batas tercapai tanpa pernah terhubung, nomor
 * dikunci sementara (cooldown) sebelum boleh dicoba lagi. Penghitung di-reset
 * begitu pairing berhasil. Modul ini murni (tanpa I/O) supaya mudah diuji.
 */

const MAX_PAIRING_ATTEMPTS = 4;
const PAIRING_COOLDOWN_MS = 10 * 60 * 1000;

// phone (digit saja) -> { count, blockedUntil }
const pairingAttempts = new Map();

function pairingCooldownError(retryAfterMs) {
  const error = new Error(
    `Batas ${MAX_PAIRING_ATTEMPTS} kali pairing berturut-turut untuk nomor ini tercapai. ` +
      `Coba lagi dalam ${Math.max(Math.ceil(retryAfterMs / 60000), 1)} menit.`
  );
  error.code = 'PAIRING_COOLDOWN';
  error.retryAfterMs = retryAfterMs;
  return error;
}

/**
 * Mengambil catatan percobaan sebuah nomor. Bila masa cooldown sudah lewat,
 * catatan dibersihkan agar jendela percobaan baru dibuka.
 */
function pairingQuota(number, now = Date.now()) {
  const entry = pairingAttempts.get(number);

  if (!entry) return { count: 0, blockedUntil: 0 };

  if (entry.blockedUntil && now >= entry.blockedUntil) {
    pairingAttempts.delete(number);
    return { count: 0, blockedUntil: 0 };
  }

  return entry;
}

/**
 * Memastikan sebuah nomor masih boleh meminta pairing code. Nomor dikunci
 * sementara setelah MAX_PAIRING_ATTEMPTS percobaan berturut-turut tercapai.
 */
function assertPairingAllowed(number, now = Date.now()) {
  const entry = pairingQuota(number, now);

  if (entry.blockedUntil && now < entry.blockedUntil) {
    throw pairingCooldownError(entry.blockedUntil - now);
  }

  if (entry.count >= MAX_PAIRING_ATTEMPTS) {
    const blockedUntil = now + PAIRING_COOLDOWN_MS;
    pairingAttempts.set(number, { count: entry.count, blockedUntil });
    throw pairingCooldownError(PAIRING_COOLDOWN_MS);
  }
}

/**
 * Mencatat satu percobaan pairing yang berhasil meminta kode.
 * Mengembalikan catatan terbaru (berisi jumlah percobaan).
 */
function registerPairingAttempt(number, now = Date.now()) {
  const entry = pairingQuota(number, now);
  entry.count += 1;
  entry.blockedUntil = 0;
  pairingAttempts.set(number, entry);
  return { ...entry };
}

/**
 * Menghapus riwayat percobaan sebuah nomor (dipanggil setelah pairing sukses).
 */
function resetPairingAttempts(number) {
  if (number) pairingAttempts.delete(number);
}

/**
 * Sisa kuota percobaan sebuah nomor (untuk ditampilkan di dashboard).
 */
function pairingRemaining(number, now = Date.now()) {
  const entry = pairingQuota(number, now);
  return Math.max(MAX_PAIRING_ATTEMPTS - entry.count, 0);
}

module.exports = {
  MAX_PAIRING_ATTEMPTS,
  PAIRING_COOLDOWN_MS,
  assertPairingAllowed,
  registerPairingAttempt,
  resetPairingAttempts,
  pairingRemaining,
};

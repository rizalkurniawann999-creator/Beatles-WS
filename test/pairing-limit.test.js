'use strict';

/**
 * Uji unit pembatas pairing (src/routes/whatsapp/pairing-limit.js).
 * Dijalankan dengan: node test/pairing-limit.test.js
 */

const assert = require('assert');
const {
  MAX_PAIRING_ATTEMPTS,
  PAIRING_COOLDOWN_MS,
  assertPairingAllowed,
  registerPairingAttempt,
  resetPairingAttempts,
  pairingRemaining,
} = require('../src/routes/whatsapp/pairing-limit');

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

const NUMBER = '628111222333';

test('nomor baru boleh pairing', () => {
  resetPairingAttempts(NUMBER);
  assert.doesNotThrow(() => assertPairingAllowed(NUMBER));
});

test('percobaan ke-1..4 berturut-turut diizinkan', () => {
  resetPairingAttempts(NUMBER);
  let now = 1_000_000;

  for (let i = 1; i <= MAX_PAIRING_ATTEMPTS; i += 1) {
    assert.doesNotThrow(() => assertPairingAllowed(NUMBER, now));
    const quota = registerPairingAttempt(NUMBER, now);
    assert.strictEqual(quota.count, i, `count harus ${i}`);
    assert.strictEqual(pairingRemaining(NUMBER, now), MAX_PAIRING_ATTEMPTS - i);
    now += 1000;
  }
});

test('percobaan ke-5 ditolak dengan kode PAIRING_COOLDOWN', () => {
  resetPairingAttempts(NUMBER);
  let now = 2_000_000;

  for (let i = 0; i < MAX_PAIRING_ATTEMPTS; i += 1) {
    assertPairingAllowed(NUMBER, now);
    registerPairingAttempt(NUMBER, now);
    now += 1000;
  }

  let error;
  try {
    assertPairingAllowed(NUMBER, now);
  } catch (e) {
    error = e;
  }

  assert.ok(error, 'harus melempar error');
  assert.strictEqual(error.code, 'PAIRING_COOLDOWN');
  assert.ok(error.retryAfterMs > 0, 'retryAfterMs harus positif');
});

test('setelah cooldown lewat, nomor boleh dicoba lagi', () => {
  resetPairingAttempts(NUMBER);
  let now = 3_000_000;

  for (let i = 0; i < MAX_PAIRING_ATTEMPTS; i += 1) {
    assertPairingAllowed(NUMBER, now);
    registerPairingAttempt(NUMBER, now);
    now += 1000;
  }

  // Percobaan ke-5 (lewat batas) memulai masa cooldown.
  assert.throws(() => assertPairingAllowed(NUMBER, now), { code: 'PAIRING_COOLDOWN' });

  const afterCooldown = now + PAIRING_COOLDOWN_MS + 1;
  assert.doesNotThrow(() => assertPairingAllowed(NUMBER, afterCooldown));
  assert.strictEqual(pairingRemaining(NUMBER, afterCooldown), MAX_PAIRING_ATTEMPTS);
});

test('resetPairingAttempts membersihkan riwayat (pairing sukses)', () => {
  resetPairingAttempts(NUMBER);
  let now = 4_000_000;

  for (let i = 0; i < 3; i += 1) {
    assertPairingAllowed(NUMBER, now);
    registerPairingAttempt(NUMBER, now);
    now += 1000;
  }

  assert.strictEqual(pairingRemaining(NUMBER, now), 1);
  resetPairingAttempts(NUMBER);
  assert.strictEqual(pairingRemaining(NUMBER, now), MAX_PAIRING_ATTEMPTS);
});

test('nomor berbeda punya kuota terpisah', () => {
  const a = '628999888777';
  const b = '628555444333';
  resetPairingAttempts(a);
  resetPairingAttempts(b);
  const now = 5_000_000;

  for (let i = 0; i < MAX_PAIRING_ATTEMPTS; i += 1) {
    assertPairingAllowed(a, now);
    registerPairingAttempt(a, now);
  }

  assert.throws(() => assertPairingAllowed(a, now), { code: 'PAIRING_COOLDOWN' });
  assert.doesNotThrow(() => assertPairingAllowed(b, now));
});

console.log(`\nRESULT: ${passed} passed`);

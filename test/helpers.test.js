'use strict';

/**
 * Unit test helper keamanan & util (kode nyata, tanpa mock).
 * Jalankan: node test/helpers.test.js
 */

const assert = require('assert');

const {
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
  asyncHandler,
} = require('../src/utils/helpers');

const { splitIntoChunks, isSupportedLang, LANGUAGES } = require('../src/utils/translate');

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`  FAIL ${label} -> ${error.message}`);
  }
}

console.log('== normalizePhone / isValidPhone ==');
check('buang non-digit', () => assert.strictEqual(normalizePhone('+62 812-345-678'), '62812345678'));
check('terima 8-15 digit', () => assert.ok(isValidPhone('6281234567890')));
check('tolak terlalu pendek', () => assert.ok(!isValidPhone('123')));
check('tolak terlalu panjang', () => assert.ok(!isValidPhone('1234567890123456789')));
check('tolak huruf', () => assert.ok(!isValidPhone('abcdefgh')));

console.log('== clampString ==');
check('potong sesuai batas', () => assert.strictEqual(clampString('  hello world  ', 5), 'hello'));
check('null aman', () => assert.strictEqual(clampString(null, 10), ''));

console.log('== isValidSessionId ==');
check('id valid', () => assert.ok(isValidSessionId('device-01')));
check('id dengan spasi ditolak', () => assert.ok(!isValidSessionId('device 01')));
check('id path traversal ditolak', () => assert.ok(!isValidSessionId('../etc')));

console.log('== sanitizeFilename / isAllowedUpload ==');
check('buang direktori (path traversal)', () => {
  const out = sanitizeFilename('../../etc/passwd');
  assert.ok(!out.includes('/'), `hasil masih mengandung "/": ${out}`);
  assert.ok(!out.includes('..'), `hasil masih mengandung "..": ${out}`);
});
check('hanya karakter aman', () => {
  const out = sanitizeFilename('na me(1).txt');
  assert.ok(/^[\w.\-]+$/.test(out), `hasil tidak aman: ${out}`);
});
check('ekstensi .txt diizinkan', () => assert.ok(isAllowedUpload('nomor.txt')));
check('ekstensi .html ditolak', () => assert.ok(!isAllowedUpload('jahat.html')));
check('ekstensi .svg ditolak', () => assert.ok(!isAllowedUpload('x.svg')));
check('ekstensi .png diizinkan', () => assert.ok(isAllowedUpload('foto.png')));

console.log('== hasUnsafeKeys (prototype pollution) ==');
check('deteksi __proto__', () => assert.ok(hasUnsafeKeys(JSON.parse('{"__proto__":{"x":1}}'))));
check('deteksi constructor bersarang', () =>
  assert.ok(hasUnsafeKeys({ a: { constructor: {} } })));
check('objek normal lolos', () => assert.ok(!hasUnsafeKeys({ name: 'a', nested: { ok: true } })));

console.log('== asyncHandler ==');
check('meneruskan error async ke next()', async () => {
  const wrapped = asyncHandler(async () => {
    throw new Error('boom');
  });
  let captured = null;
  wrapped({}, {}, (err) => {
    captured = err;
  });
  // next() dipanggil sinkron setelah microtask; tunggu satu tick.
  return new Promise((resolve) => {
    setImmediate(() => {
      assert.ok(captured instanceof Error, 'error tidak diteruskan');
      assert.strictEqual(captured.message, 'boom');
      resolve();
    });
  });
});

console.log('== translate util ==');
check('splitIntoChunks menjaga batas', () => {
  const text = 'kata '.repeat(1000);
  const chunks = splitIntoChunks(text, 100);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 100));
});
check('bahasa id/en didukung', () => {
  assert.ok(isSupportedLang('id'));
  assert.ok(isSupportedLang('en'));
  assert.ok(!isSupportedLang('zz'));
});
check('daftar bahasa berisi target utama', () => assert.ok(LANGUAGES.id && LANGUAGES.en));

console.log('== parser kontak (TXT/CSV) ==');
check('pisahkan nomor antar baris (tidak tergabung)', () => {
  const raw = extractPhonesFromText('081234567890\n628111222333\n+62 812-9999-0000');
  assert.deepStrictEqual(raw, ['081234567890', '628111222333', '6281299990000']);
});
check('pisahkan dua nomor dalam satu baris', () => {
  const raw = extractPhonesFromText('081234567890 628111222333');
  assert.deepStrictEqual(raw, ['081234567890', '628111222333']);
});
check('abaikan baris non-nomor', () => {
  assert.deepStrictEqual(extractPhonesFromText('Nama,Nomor\nA,081200000001'), ['081200000001']);
});
check('refinePhoneList buang duplikat & invalid', () => {
  const r = refinePhoneList(['081200000001', '081200000001', '123', 'abcdefgh']);
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.duplicates, 1);
  assert.strictEqual(r.invalid, 2);
});
check('isContactFile menerima xlsx, menolak exe', () => {
  assert.ok(isContactFile('kontak.xlsx'));
  assert.ok(isContactFile('nomor.txt'));
  assert.ok(!isContactFile('virus.exe'));
});

// Tampilkan ringkasan; tunggu asyncHandler selesai lewat setImmediate.
setTimeout(() => {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}, 50);

'use strict';

/**
 * Unit test resolver media pengiriman (src/routes/whatsapp/client.js).
 *
 * Memastikan URL absolut dikirim sebagai URL, berkas unggahan lokal dibaca
 * sebagai Buffer, dan nama berkas tidak bisa keluar dari folder uploads
 * (path traversal). Tanpa mock: berkas uji benar-benar dibuat di disk.
 *
 * Jalankan: node test/media-source.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { resolveMediaSource } = require('../src/routes/whatsapp/client');

let pass = 0;
let fail = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    pass += 1;
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    fail += 1;
  }
}

const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const sample = path.join(uploadsDir, 'unit-media-test.bin');
fs.writeFileSync(sample, 'isi-media');

console.log('== resolver media pengiriman ==');

check('URL absolut dikembalikan apa adanya', () => {
  const source = resolveMediaSource('https://contoh.com/gambar.jpg');
  assert.deepStrictEqual(source, { url: 'https://contoh.com/gambar.jpg' });
});

check('berkas /uploads/ dibaca sebagai Buffer', () => {
  const source = resolveMediaSource('/uploads/unit-media-test.bin');
  assert.ok(Buffer.isBuffer(source.buffer), 'harus Buffer');
  assert.strictEqual(source.buffer.toString(), 'isi-media');
});

check('path traversal tidak bisa keluar dari uploads', () => {
  const source = resolveMediaSource('/uploads/../data/store.json');
  assert.ok(!source.buffer, 'tidak boleh membaca berkas di luar uploads');
  assert.strictEqual(source.url, '/uploads/../data/store.json');
});

check('berkas uploads yang tidak ada jatuh ke url', () => {
  const source = resolveMediaSource('/uploads/tidak-ada.bin');
  assert.ok(!source.buffer);
});

check('nilai kosong -> null', () => {
  assert.strictEqual(resolveMediaSource(''), null);
  assert.strictEqual(resolveMediaSource(null), null);
});

fs.rmSync(sample, { force: true });

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

'use strict';

/**
 * Uji jaring pengaman proses (src/server.js).
 *
 * Membuktikan bahwa satu unhandled rejection TIDAK mematikan server. Tanpa
 * handler process-level, Node akan menghentikan proses dan klien melihat
 * "sesi berakhir" padahal token masih sah.
 *
 * Dijalankan dengan: node test/server-safety.test.js
 */

const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'src', 'server.js');
const PORT = 3210 + Math.floor(Math.random() * 500);

// Anak proses: muat server (mendaftarkan handler), lalu picu unhandled
// rejection. Bila jaring pengaman bekerja, proses mencapai penanda "AMAN".
const childScript = `
  process.env.PORT = ${PORT};
  require(${JSON.stringify(SERVER)});
  setTimeout(() => { Promise.reject(new Error('uji unhandled rejection')); }, 150);
  setTimeout(() => { console.log('AMAN'); process.exit(0); }, 900);
`;

function runChild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', childScript], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

(async () => {
  let passed = 0;
  const { code, stdout, stderr } = await runChild();

  try {
    assert.strictEqual(
      code,
      0,
      `server harus tetap hidup setelah unhandled rejection (exit=${code})\n${stderr}`
    );
    assert.ok(
      stdout.includes('AMAN'),
      `server harus mencapai penanda AMAN\nstdout=${stdout}\nstderr=${stderr}`
    );
    assert.ok(
      stderr.includes('Unhandled rejection'),
      'handler harus mencatat unhandled rejection ke stderr'
    );
    passed += 1;
    console.log('  ok   server bertahan dari unhandled rejection');
  } catch (error) {
    console.error(`  FAIL server bertahan dari unhandled rejection\n       ${error.message}`);
    process.exitCode = 1;
  }

  console.log(`\nRESULT: ${passed} passed`);
})();

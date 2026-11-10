'use strict';

/**
 * Beatles-WS — database handler.
 *
 * Menyimpan seluruh state aplikasi pada satu berkas JSON (data/store.json):
 * user, tarif, database nomor, kontak, template, penarikan, pesan, dan
 * broadcast. Modul ini juga menangani migrasi ringan agar koleksi yang hilang
 * selalu dibuat ulang, serta menyediakan util penomoran yang dipakai bersama.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const storePath = path.join(__dirname, '..', 'data', 'store.json');

// Hash kata sandi akun bawaan dihitung SEKALI saat modul dimuat. Sebelumnya
// hash dihitung ulang di setiap readStore() (bcrypt 10 rounds x2), yang mahal
// dan tidak perlu karena nilai hash-nya selalu sama.
const SEED_PASSWORDS = {
  admin: 'ws-admin770088',
  boss: 'ws-boss7002043',
};

let seedHashes = null;

function getSeedHashes() {
  if (!seedHashes) {
    seedHashes = {
      admin: bcrypt.hashSync(SEED_PASSWORDS.admin, 10),
      boss: bcrypt.hashSync(SEED_PASSWORDS.boss, 10),
    };
  }
  return seedHashes;
}

function defaultStore() {
  const hashes = getSeedHashes();

  return {
    users: [
      {
        username: 'ws-beatles-admin',
        passwordHash: hashes.admin,
        role: 'ADMIN',
        name: 'Beatles Admin',
        active: true,
        quota: 0,
        telegram: '',
        referral: '',
        pinHash: null,
      },
      {
        username: 'ws-beatles-boss',
        passwordHash: hashes.boss,
        role: 'BOS',
        name: 'Beatles Boss',
        active: true,
        quota: 0,
        telegram: '',
        referral: '',
        pinHash: null,
      },
    ],
    tariff: 150,
    settings: {
      maintenance: false,
      maxPairing: 4,
      blockIndo: false,
      blockShadowban: false,
      referralEnabled: true,
    },
    servers: [
      { id: 'srv_sg1', name: 'Server SG-1 (Primary)', host: '103.25.12.90', region: 'Singapore', role: 'primary', status: 'online', load: 42, createdAt: new Date().toISOString() },
      { id: 'srv_jkt2', name: 'Server JKT-2 (Backup)', host: '180.250.88.12', region: 'Jakarta', role: 'backup', status: 'online', load: 18, createdAt: new Date().toISOString() },
    ],
    announcements: [],
    databases: [
      {
        id: 'db_default',
        name: 'Promo Akhir Tahun',
        totalNumbers: 500,
        filePath: null,
        tariffPerMsg: 150,
        mediaType: 'text+photo',
        templateContent: 'Halo, nikmati promo spesial akhir tahun dari kami!',
        createdAt: new Date().toISOString(),
      },
    ],
    contacts: [],
    templates: [],
    withdrawals: [],
    messages: [],
    broadcasts: [],
  };
}

const COLLECTIONS = [
  'users',
  'databases',
  'contacts',
  'templates',
  'withdrawals',
  'messages',
  'broadcasts',
  'servers',
  'announcements',
];

function seedStore() {
  if (fs.existsSync(storePath)) return;
  saveStore(defaultStore());
}

function readStore() {
  seedStore();

  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));

  // Migrasi ringan: pastikan semua koleksi selalu ada.
  let changed = false;

  for (const key of COLLECTIONS) {
    if (!Array.isArray(store[key])) {
      store[key] = [];
      changed = true;
    }
  }

  if (typeof store.tariff !== 'number') {
    store.tariff = 150;
    changed = true;
  }

  if (!store.settings || typeof store.settings !== 'object') {
    store.settings = { maintenance: false, maxPairing: 4, blockIndo: false, blockShadowban: false, referralEnabled: true };
    changed = true;
  }

  // Lengkapi field user lama agar struktur tetap konsisten.
  for (const user of store.users) {
    if (user.active === undefined) { user.active = true; changed = true; }
    if (user.quota === undefined) { user.quota = 0; changed = true; }
    if (user.telegram === undefined) { user.telegram = ''; changed = true; }
    if (user.referral === undefined) { user.referral = ''; changed = true; }
  }

  if (changed) saveStore(store);

  return store;
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function publicUser(user) {
  return {
    username: user.username,
    role: user.role,
    name: user.name,
    active: user.active !== false,
    quota: Number(user.quota || 0),
    telegram: user.telegram || '',
    referral: user.referral || '',
    hasPin: Boolean(user.pinHash),
  };
}

function normalizeNumber(value) {
  return String(value == null ? '' : value).replace(/[^\d]/g, '');
}

module.exports = {
  storePath,
  defaultStore,
  seedStore,
  readStore,
  saveStore,
  publicUser,
  normalizeNumber,
};

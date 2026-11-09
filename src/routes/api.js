'use strict';

/**
 * Beatles-WS REST API.
 *
 * Menyediakan autentikasi JWT berbasis role (USER / ADMIN / BOS), manajemen
 * database nomor tujuan, template pesan, pengiriman pesan, broadcast massal
 * dengan jeda anti-ban, deteksi status nomor, serta endpoint WhatsApp
 * (QR / pairing code) yang terhubung ke gateway Baileys.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const multer = require('multer');

const {
  connectWhatsApp,
  createNewWhatsAppSession,
  startSession,
  requestPairingCode,
  sendMessage,
  checkNumber,
  getWhatsAppStatus,
  listWhatsAppSessions,
  disconnectWhatsApp,
  logoutWhatsApp,
} = require('./whatsapp/client');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const storePath = path.join(__dirname, '..', '..', 'data', 'store.json');

const jwtSecret = process.env.JWT_SECRET;

const VALID_NUMBER = /^\+?\d{8,15}$/;

// ---------- Persistence ----------

function defaultStore() {
  const accounts = [
    {
      username: 'ws-beatles-admin',
      passwordHash: bcrypt.hashSync('ws-admin770088', 10),
      role: 'ADMIN',
      name: 'Beatles Admin',
    },
    {
      username: 'ws-beatles-boss',
      passwordHash: bcrypt.hashSync('ws-boss7002043', 10),
      role: 'BOS',
      name: 'Beatles Boss',
    },
  ];

  return {
    users: accounts,
    tariff: 150,
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

function seedStore() {
  if (fs.existsSync(storePath)) return;
  saveStore(defaultStore());
}

function readStore() {
  seedStore();

  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));

  // Migrasi ringan: pastikan semua koleksi selalu ada.
  let changed = false;
  const defaults = defaultStore();

  for (const key of ['users', 'databases', 'contacts', 'templates', 'withdrawals', 'messages', 'broadcasts']) {
    if (!Array.isArray(store[key])) {
      store[key] = defaults[key];
      changed = true;
    }
  }

  if (typeof store.tariff !== 'number') {
    store.tariff = defaults.tariff;
    changed = true;
  }

  if (changed) saveStore(store);

  return store;
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function publicUser(user) {
  return { username: user.username, role: user.role, name: user.name };
}

function normalizeNumber(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

// ---------- Authentication & permissions ----------

function auth(req, res, next) {
  if (!jwtSecret || jwtSecret.length < 32) {
    return res.status(503).json({
      ok: false,
      error: 'JWT_SECRET belum disetel. Isi .env dengan secret acak minimal 32 karakter.',
    });
  }

  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ ok: false, error: 'Token autentikasi diperlukan.' });
  }

  try {
    req.user = jwt.verify(match[1], jwtSecret, { issuer: 'beatles-ws' });
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token tidak valid atau sesi berakhir.' });
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Akses ditolak untuk role ini.' });
    }
    return next();
  };
}

function handleError(res, error, fallback, status = 500) {
  console.error(`${fallback}:`, error.message);

  const code = error.code === 'NOT_CONNECTED' ? 409 : status;

  return res.status(code).json({ ok: false, error: error.message || fallback });
}

// ---------- Health ----------

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'BEATLES-WS API',
    mode: 'production',
    timestamp: new Date().toISOString(),
  });
});

// ---------- Login & Register ----------

router.post('/auth/login', (req, res) => {
  if (!jwtSecret || jwtSecret.length < 32) {
    return res.status(503).json({
      ok: false,
      error: 'Backend belum dikonfigurasi. Isi JWT_SECRET minimal 32 karakter.',
    });
  }

  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const store = readStore();
  const user = store.users.find((item) => item.username === username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Username atau password salah.' });
  }

  const token = jwt.sign(publicUser(user), jwtSecret, {
    expiresIn: '8h',
    issuer: 'beatles-ws',
  });

  return res.json({
    ok: true,
    token,
    user: publicUser(user),
    expiresIn: 28800,
  });
});

router.post('/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username dan password wajib diisi.' });
  }

  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({
      ok: false,
      error: 'Username 3-32 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password minimal 6 karakter.' });
  }

  const store = readStore();

  if (store.users.some((u) => u.username === username)) {
    return res.status(400).json({ ok: false, error: 'Username sudah digunakan.' });
  }

  store.users.push({
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'USER',
    name: name || username,
  });

  saveStore(store);

  return res.status(201).json({ ok: true, message: 'Registrasi berhasil. Silakan masuk.' });
});

router.get('/auth/me', auth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ---------- Dashboard ----------

router.get('/dashboard', auth, (req, res) => {
  const store = readStore();

  const withdrawals = store.withdrawals.filter(
    (item) => req.user.role !== 'USER' || item.username === req.user.username
  );

  const messages = (store.messages || []).filter(
    (item) => req.user.role !== 'USER' || item.username === req.user.username
  );

  res.json({
    ok: true,
    user: req.user,
    tariff: store.tariff,
    databasesCount: (store.databases || []).length,
    contactsCount: (store.contacts || []).length,
    templatesCount: (store.templates || []).length,
    withdrawalCount: withdrawals.length,
    pendingWithdrawals: withdrawals.filter((item) => item.status === 'PENDING').length,
    messagesSent: messages.filter((item) => item.status === 'sent').length,
    messagesFailed: messages.filter((item) => item.status && item.status !== 'sent').length,
  });
});

// ---------- Admin: Database & Template Management ----------

router.get('/admin/databases', auth, allow('ADMIN', 'BOS'), (_req, res) => {
  const store = readStore();
  res.json({ ok: true, databases: store.databases || [] });
});

router.post('/admin/databases', auth, allow('ADMIN'), upload.single('file'), (req, res) => {
  try {
    const name = String(req.body?.name || 'Kategori Baru').trim().slice(0, 80);
    const tariffPerMsg = Number(req.body?.tariffPerMsg || 150);
    const templateContent = String(req.body?.templateContent || '').trim().slice(0, 2000);
    const mediaType = String(req.body?.mediaType || 'text').trim();

    let totalNumbers = 0;
    let filePath = null;
    const extracted = [];

    if (req.file) {
      filePath = req.file.path;
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split(/\r?\n|,|\s+/);
      const validNumbers = lines.map((n) => n.trim()).filter((n) => VALID_NUMBER.test(n));

      for (const number of validNumbers) {
        if (!extracted.includes(number)) extracted.push(number);
      }

      totalNumbers = extracted.length;
    }

    const store = readStore();
    if (!store.databases) store.databases = [];

    const newDb = {
      id: `db_${Date.now()}`,
      name,
      totalNumbers,
      filePath,
      tariffPerMsg,
      mediaType,
      templateContent,
      createdAt: new Date().toISOString(),
    };

    store.databases.unshift(newDb);

    // Nomor yang diekstrak sekaligus dimasukkan ke database kontak.
    if (!store.contacts) store.contacts = [];

    const existing = new Set(store.contacts.map((c) => c.phone));

    for (const number of extracted) {
      const phone = normalizeNumber(number);
      if (existing.has(phone)) continue;
      existing.add(phone);
      store.contacts.push({
        id: `ct_${crypto.randomUUID()}`,
        phone,
        name: '',
        tag: name,
        source: 'database-upload',
        status: 'unknown',
        createdAt: new Date().toISOString(),
      });
    }

    saveStore(store);

    return res.status(201).json({
      ok: true,
      database: newDb,
      message: `Database dibuat dengan ${totalNumbers} nomor terekstrak dan ditambahkan ke kontak.`,
    });
  } catch (error) {
    return handleError(res, error, 'Gagal mengupload dan memproses database.');
  }
});

router.delete('/admin/databases/:id', auth, allow('ADMIN'), (req, res) => {
  const store = readStore();
  if (!store.databases) store.databases = [];

  const index = store.databases.findIndex((d) => d.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Database tidak ditemukan.' });
  }

  const removed = store.databases.splice(index, 1)[0];

  if (removed.filePath && fs.existsSync(removed.filePath)) {
    try {
      fs.unlinkSync(removed.filePath);
    } catch {
      // File mungkin sudah hilang.
    }
  }

  saveStore(store);
  return res.json({ ok: true, message: 'Database berhasil dihapus.' });
});

// ---------- Tariff ----------

router.get('/settings/tariff', auth, (_req, res) => {
  res.json({ ok: true, tariff: readStore().tariff });
});

router.put('/settings/tariff', auth, allow('ADMIN', 'BOS'), (req, res) => {
  const tariff = Number(req.body?.tariff);

  if (!Number.isInteger(tariff) || tariff < 0 || tariff > 1000000) {
    return res.status(400).json({
      ok: false,
      error: 'Tarif harus bilangan bulat 0 sampai 1.000.000.',
    });
  }

  const store = readStore();
  store.tariff = tariff;
  saveStore(store);

  return res.json({ ok: true, tariff });
});

// ---------- Templates ----------

router.get('/templates', auth, (req, res) => {
  const store = readStore();

  const templates = (store.templates || []).filter(
    (item) => req.user.role !== 'USER' || item.active
  );

  res.json({ ok: true, templates });
});

router.post('/templates', auth, allow('ADMIN', 'BOS'), (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const content = String(req.body?.content || '').trim().slice(0, 2000);

  if (!name || !content) {
    return res.status(400).json({ ok: false, error: 'Nama dan isi template wajib diisi.' });
  }

  const store = readStore();
  if (!store.templates) store.templates = [];

  const item = {
    id: `tpl_${Date.now()}`,
    name,
    content,
    owner: req.user.username,
    active: true,
    createdAt: new Date().toISOString(),
  };

  store.templates.unshift(item);
  saveStore(store);

  return res.status(201).json({ ok: true, template: item });
});

router.patch('/templates/:id', auth, allow('ADMIN', 'BOS'), (req, res) => {
  const store = readStore();
  const item = (store.templates || []).find((t) => t.id === req.params.id);

  if (!item) {
    return res.status(404).json({ ok: false, error: 'Template tidak ditemukan.' });
  }

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 80);
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Nama template tidak boleh kosong.' });
    }
    item.name = name;
  }

  if (req.body?.content !== undefined) {
    const content = String(req.body.content).trim().slice(0, 2000);
    if (!content) {
      return res.status(400).json({ ok: false, error: 'Isi template tidak boleh kosong.' });
    }
    item.content = content;
  }

  if (req.body?.active !== undefined) {
    item.active = Boolean(req.body.active);
  }

  item.updatedAt = new Date().toISOString();
  saveStore(store);

  return res.json({ ok: true, template: item });
});

router.delete('/templates/:id', auth, allow('ADMIN', 'BOS'), (req, res) => {
  const store = readStore();
  const list = store.templates || [];
  const index = list.findIndex((t) => t.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Template tidak ditemukan.' });
  }

  list.splice(index, 1);
  saveStore(store);

  return res.json({ ok: true, message: 'Template berhasil dihapus.' });
});

// ---------- Contacts (database nomor tujuan) ----------

function sanitizeContact(body) {
  const phone = normalizeNumber(body?.phone);

  if (!VALID_NUMBER.test(phone)) {
    return { error: 'Nomor tidak valid. Gunakan 8-15 digit angka.' };
  }

  return {
    phone,
    name: String(body?.name || '').trim().slice(0, 80),
    tag: String(body?.tag || '').trim().slice(0, 40),
  };
}

router.get('/contacts', auth, (req, res) => {
  const store = readStore();

  let contacts = store.contacts || [];

  const search = String(req.query.search || '').trim().toLowerCase();
  const tag = String(req.query.tag || '').trim().toLowerCase();

  if (search) {
    contacts = contacts.filter(
      (c) =>
        c.phone.includes(search) ||
        (c.name || '').toLowerCase().includes(search) ||
        (c.tag || '').toLowerCase().includes(search)
    );
  }

  if (tag) {
    contacts = contacts.filter((c) => (c.tag || '').toLowerCase() === tag);
  }

  const tags = Array.from(
    new Set((store.contacts || []).map((c) => c.tag).filter(Boolean))
  );

  res.json({ ok: true, contacts, total: contacts.length, tags });
});

router.post('/contacts', auth, allow('ADMIN', 'BOS', 'USER'), (req, res) => {
  const data = sanitizeContact(req.body);

  if (data.error) {
    return res.status(400).json({ ok: false, error: data.error });
  }

  const store = readStore();
  if (!store.contacts) store.contacts = [];

  if (store.contacts.some((c) => c.phone === data.phone)) {
    return res.status(400).json({ ok: false, error: 'Nomor sudah ada di database kontak.' });
  }

  const contact = {
    id: `ct_${crypto.randomUUID()}`,
    ...data,
    source: 'manual',
    status: 'unknown',
    createdAt: new Date().toISOString(),
  };

  store.contacts.unshift(contact);
  saveStore(store);

  return res.status(201).json({ ok: true, contact });
});

router.patch('/contacts/:id', auth, allow('ADMIN', 'BOS', 'USER'), (req, res) => {
  const store = readStore();
  const contact = (store.contacts || []).find((c) => c.id === req.params.id);

  if (!contact) {
    return res.status(404).json({ ok: false, error: 'Kontak tidak ditemukan.' });
  }

  if (req.body?.phone !== undefined) {
    const phone = normalizeNumber(req.body.phone);

    if (!VALID_NUMBER.test(phone)) {
      return res.status(400).json({ ok: false, error: 'Nomor tidak valid.' });
    }

    if (store.contacts.some((c) => c.phone === phone && c.id !== contact.id)) {
      return res.status(400).json({ ok: false, error: 'Nomor sudah dipakai kontak lain.' });
    }

    contact.phone = phone;
  }

  if (req.body?.name !== undefined) {
    contact.name = String(req.body.name).trim().slice(0, 80);
  }

  if (req.body?.tag !== undefined) {
    contact.tag = String(req.body.tag).trim().slice(0, 40);
  }

  contact.updatedAt = new Date().toISOString();
  saveStore(store);

  return res.json({ ok: true, contact });
});

router.delete('/contacts/:id', auth, allow('ADMIN', 'BOS', 'USER'), (req, res) => {
  const store = readStore();
  const list = store.contacts || [];
  const index = list.findIndex((c) => c.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Kontak tidak ditemukan.' });
  }

  list.splice(index, 1);
  saveStore(store);

  return res.json({ ok: true, message: 'Kontak berhasil dihapus.' });
});

router.post('/contacts/import', auth, allow('ADMIN', 'BOS'), (req, res) => {
  const raw = String(req.body?.numbers || '').trim();

  if (!raw) {
    return res.status(400).json({ ok: false, error: 'Tidak ada nomor untuk diimpor.' });
  }

  const tag = String(req.body?.tag || '').trim().slice(0, 40);
  const tokens = raw.split(/[\r\n,;]+/).map((n) => n.trim()).filter(Boolean);

  const store = readStore();
  if (!store.contacts) store.contacts = [];

  const existing = new Set(store.contacts.map((c) => c.phone));

  let added = 0;
  let skipped = 0;
  let invalid = 0;

  for (const token of tokens) {
    const phone = normalizeNumber(token);

    if (!VALID_NUMBER.test(phone)) {
      invalid += 1;
      continue;
    }

    if (existing.has(phone)) {
      skipped += 1;
      continue;
    }

    existing.add(phone);
    store.contacts.push({
      id: `ct_${crypto.randomUUID()}`,
      phone,
      name: '',
      tag,
      source: 'import',
      status: 'unknown',
      createdAt: new Date().toISOString(),
    });
    added += 1;
  }

  saveStore(store);

  return res.json({ ok: true, added, skipped, invalid, total: store.contacts.length });
});

// ---------- Number status / shadowban detection ----------

router.post('/contacts/check', auth, allow('ADMIN', 'BOS', 'USER'), async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || 'device-01').trim();

    const requested = Array.isArray(req.body?.phones)
      ? req.body.phones
      : String(req.body?.phones || req.body?.phone || '')
          .split(/[\r\n,;]+/)
          .filter(Boolean);

    if (!requested.length) {
      return res.status(400).json({ ok: false, error: 'Tidak ada nomor untuk diperiksa.' });
    }

    const store = readStore();
    const results = [];

    for (const raw of requested.slice(0, 50)) {
      const phone = normalizeNumber(raw);
      const result = await checkNumber(sessionId, phone);
      results.push(result);

      const contact = (store.contacts || []).find((c) => c.phone === phone);
      if (contact) {
        contact.status = result.status;
        contact.statusCheckedAt = new Date().toISOString();
      }
    }

    saveStore(store);

    return res.json({ ok: true, results });
  } catch (error) {
    return handleError(res, error, 'Gagal memeriksa status nomor.', 409);
  }
});

// ---------- Messaging ----------

function logMessage(store, entry) {
  if (!store.messages) store.messages = [];
  store.messages.unshift(entry);

  // Batasi riwayat agar file store tidak tumbuh tanpa batas.
  if (store.messages.length > 1000) {
    store.messages.length = 1000;
  }
}

router.get('/messages', auth, (req, res) => {
  const store = readStore();

  const messages = (store.messages || []).filter(
    (item) => req.user.role !== 'USER' || item.username === req.user.username
  );

  res.json({ ok: true, messages: messages.slice(0, 200) });
});

router.post('/send-message', auth, allow('ADMIN', 'BOS', 'USER'), async (req, res) => {
  const sessionId = String(req.body?.sessionId || 'device-01').trim();
  const phone = normalizeNumber(req.body?.phone || req.body?.to);
  const text = String(req.body?.message ?? req.body?.text ?? '').trim();

  if (!VALID_NUMBER.test(phone)) {
    return res.status(400).json({ ok: false, error: 'Nomor tujuan tidak valid.' });
  }

  if (!text) {
    return res.status(400).json({ ok: false, error: 'Isi pesan tidak boleh kosong.' });
  }

  try {
    const result = await sendMessage(sessionId, phone, text);

    const store = readStore();
    logMessage(store, {
      id: `msg_${crypto.randomUUID()}`,
      username: req.user.username,
      sessionId,
      phone,
      text,
      status: result.status,
      detail: result.detail,
      messageId: result.messageId || null,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);

    return res.json({ ok: result.success, ...result });
  } catch (error) {
    return handleError(res, error, 'Gagal mengirim pesan.', 409);
  }
});

// ---------- Broadcast (massal) dengan jeda anti-ban ----------

const broadcastJobs = new Map();

const DELAY_PRESETS = { safe: 30000, standard: 5000, brutal: 1000 };

function runBroadcast(job) {
  (async () => {
    const store = readStore();
    const numbers = job.phones;

    for (let i = 0; i < numbers.length; i += 1) {
      if (job.cancelled) {
        job.status = 'cancelled';
        break;
      }

      const phone = numbers[i];
      job.current = i + 1;

      try {
        const result = await sendMessage(job.sessionId, phone, job.message);
        job.sent += result.success ? 1 : 0;

        if (!result.success) {
          job.failed += 1;
          job.lastError = result.detail || result.reason;
        }

        const fresh = readStore();
        logMessage(fresh, {
          id: `msg_${crypto.randomUUID()}`,
          username: job.username,
          sessionId: job.sessionId,
          phone,
          text: job.message,
          status: result.status,
          detail: result.detail,
          broadcastId: job.id,
          createdAt: new Date().toISOString(),
        });
        saveStore(fresh);
      } catch (error) {
        job.failed += 1;
        job.lastError = error.message;
      }

      if (i < numbers.length - 1 && !job.cancelled) {
        await new Promise((resolve) => setTimeout(resolve, job.delayMs));
      }
    }

    if (!job.cancelled) {
      job.status = 'completed';
    }

    job.finishedAt = new Date().toISOString();

    const fresh = readStore();
    const stored = (fresh.broadcasts || []).find((b) => b.id === job.id);

    if (stored) {
      stored.status = job.status;
      stored.sent = job.sent;
      stored.failed = job.failed;
      stored.current = job.current;
      stored.finishedAt = job.finishedAt;
      saveStore(fresh);
    }

    setTimeout(() => broadcastJobs.delete(job.id), 10 * 60 * 1000);
  })().catch((error) => {
    job.status = 'failed';
    job.lastError = error.message;
  });
}

router.post('/broadcast', auth, allow('ADMIN', 'BOS', 'USER'), (req, res) => {
  const sessionId = String(req.body?.sessionId || 'device-01').trim();
  const text = String(req.body?.message ?? req.body?.text ?? '').trim();
  const speed = String(req.body?.speed || 'safe').toLowerCase();

  if (!text) {
    return res.status(400).json({ ok: false, error: 'Isi pesan tidak boleh kosong.' });
  }

  const delayMs = Number.isFinite(Number(req.body?.delayMs))
    ? Math.min(Math.max(Number(req.body.delayMs), 500), 120000)
    : DELAY_PRESETS[speed] || DELAY_PRESETS.safe;

  let phones = [];

  if (Array.isArray(req.body?.phones)) {
    phones = req.body.phones.map(normalizeNumber).filter((n) => VALID_NUMBER.test(n));
  }

  if (!phones.length && Array.isArray(req.body?.contactIds)) {
    const store = readStore();
    const wanted = new Set(req.body.contactIds);
    phones = (store.contacts || [])
      .filter((c) => wanted.has(c.id))
      .map((c) => c.phone);
  }

  // Kirim ke seluruh kontak hanya bila diminta eksplisit (source/tag "all"
  // atau tanpa penanda target sama sekali). Daftar nomor yang kosong tidak
  // boleh diam-diam berubah menjadi blast ke semua kontak.
  const explicitEmptyList =
    Array.isArray(req.body?.phones) || Array.isArray(req.body?.contactIds);

  if (!phones.length && !explicitEmptyList) {
    const store = readStore();
    const tag = String(req.body?.tag || '').trim().toLowerCase();
    phones = (store.contacts || [])
      .filter((c) => (tag ? (c.tag || '').toLowerCase() === tag : true))
      .map((c) => c.phone);
  }

  phones = Array.from(new Set(phones));

  if (!phones.length) {
    return res.status(400).json({ ok: false, error: 'Tidak ada nomor tujuan yang valid.' });
  }

  const job = {
    id: `bc_${crypto.randomUUID()}`,
    username: req.user.username,
    sessionId,
    message: text,
    phones,
    delayMs,
    total: phones.length,
    current: 0,
    sent: 0,
    failed: 0,
    status: 'running',
    lastError: null,
    cancelled: false,
    createdAt: new Date().toISOString(),
  };

  broadcastJobs.set(job.id, job);

  const store = readStore();
  if (!store.broadcasts) store.broadcasts = [];
  store.broadcasts.unshift({
    id: job.id,
    username: job.username,
    sessionId,
    total: job.total,
    delayMs,
    status: 'running',
    sent: 0,
    failed: 0,
    createdAt: job.createdAt,
  });
  saveStore(store);

  runBroadcast(job);

  return res.status(202).json({
    ok: true,
    broadcastId: job.id,
    total: job.total,
    delayMs,
    message: 'Broadcast dimulai. Pantau progres melalui endpoint status.',
  });
});

router.get('/broadcast/:id', auth, (req, res) => {
  const job = broadcastJobs.get(req.params.id);

  if (!job) {
    const store = readStore();
    const stored = (store.broadcasts || []).find((b) => b.id === req.params.id);

    if (!stored) {
      return res.status(404).json({ ok: false, error: 'Broadcast tidak ditemukan.' });
    }

    return res.json({ ok: true, broadcast: stored });
  }

  return res.json({
    ok: true,
    broadcast: {
      id: job.id,
      status: job.status,
      total: job.total,
      current: job.current,
      sent: job.sent,
      failed: job.failed,
      delayMs: job.delayMs,
      lastError: job.lastError,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt || null,
    },
  });
});

router.post('/broadcast/:id/cancel', auth, allow('ADMIN', 'BOS', 'USER'), (req, res) => {
  const job = broadcastJobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ ok: false, error: 'Broadcast tidak aktif.' });
  }

  job.cancelled = true;

  return res.json({ ok: true, message: 'Permintaan pembatalan dikirim.' });
});

// ---------- Withdrawals ----------

router.get('/withdrawals', auth, (req, res) => {
  const store = readStore();

  const withdrawals = store.withdrawals.filter(
    (item) => req.user.role !== 'USER' || item.username === req.user.username
  );

  res.json({ ok: true, withdrawals });
});

router.post('/withdrawals', auth, allow('USER'), (req, res) => {
  const amount = Number(req.body?.amount);
  const method = String(req.body?.method || '').trim().slice(0, 40);
  const destination = String(req.body?.destination || '').trim().slice(0, 160);

  if (
    !Number.isInteger(amount) ||
    amount < 1000 ||
    amount > 100000000 ||
    !method ||
    !destination
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Nominal minimal Rp1.000 dan metode/tujuan wajib diisi.',
    });
  }

  const store = readStore();

  const item = {
    id: `wd_${Date.now()}`,
    username: req.user.username,
    amount,
    method,
    destination,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  store.withdrawals.unshift(item);
  saveStore(store);

  return res.status(201).json({
    ok: true,
    withdrawal: item,
    note: 'Permintaan dicatat sebagai demo. Tidak ada uang yang dipindahkan.',
  });
});

router.patch('/withdrawals/:id/status', auth, allow('ADMIN'), (req, res) => {
  const status = String(req.body?.status || '').toUpperCase();

  if (!['PENDING', 'APPROVED', 'REJECTED', 'PAID'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Status tidak valid.' });
  }

  const store = readStore();
  const item = store.withdrawals.find((entry) => entry.id === req.params.id);

  if (!item) {
    return res.status(404).json({ ok: false, error: 'Permintaan tidak ditemukan.' });
  }

  item.status = status;
  item.updatedAt = new Date().toISOString();
  saveStore(store);

  return res.json({ ok: true, withdrawal: item });
});

// ---------- Users ----------

router.get('/users', auth, allow('ADMIN'), (_req, res) => {
  const store = readStore();
  res.json({ ok: true, users: store.users.map(publicUser) });
});

// ---------- WhatsApp: QR connection ----------

router.post('/whatsapp/connect', auth, allow('ADMIN', 'BOS'), async (req, res) => {
  try {
    const requestedSessionId = String(req.body?.sessionId || '').trim();

    const createNew =
      req.body?.newSession === true ||
      req.body?.mode === 'new' ||
      !requestedSessionId;

    let result;

    if (createNew) {
      result = await createNewWhatsAppSession('qr');
    } else {
      const current = getWhatsAppStatus(requestedSessionId);

      if (current.connected) {
        result = await createNewWhatsAppSession('qr');
      } else {
        result = await connectWhatsApp(requestedSessionId);
      }
    }

    return res.json({
      ok: true,
      ...result,
      sessionId: result.sessionId,
      message:
        'Permintaan koneksi diproses. Gunakan sessionId ini untuk memeriksa status dan QR.',
    });
  } catch (error) {
    return handleError(res, error, 'Gagal memulai sesi QR.', 400);
  }
});

// ---------- WhatsApp: pairing code ----------

router.post('/whatsapp/pairing-code', auth, allow('ADMIN', 'BOS'), async (req, res) => {
  try {
    const requestedSessionId = String(req.body?.sessionId || '').trim();
    const phoneNumber = String(req.body?.phoneNumber || '').trim();

    if (!phoneNumber) {
      return res.status(400).json({ ok: false, error: 'Nomor telepon wajib diisi.' });
    }

    let sessionId = requestedSessionId;

    if (!sessionId) {
      const created = await createNewWhatsAppSession('code');
      sessionId = created.sessionId;
    } else {
      const current = getWhatsAppStatus(sessionId);

      if (current.connected) {
        const created = await createNewWhatsAppSession('code');
        sessionId = created.sessionId;
      } else {
        await startSession(sessionId, 'code');
      }
    }

    const result = await requestPairingCode(sessionId, phoneNumber);

    return res.json({
      ok: true,
      ...result,
      sessionId,
      message:
        'Pairing code diminta. Masukkan kode di WhatsApp pada ponsel yang ingin ditautkan.',
    });
  } catch (error) {
    return handleError(res, error, 'Gagal meminta pairing code.', 400);
  }
});

// ---------- WhatsApp: session status ----------

router.get('/whatsapp/status', auth, allow('ADMIN', 'BOS'), async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || 'device-01').trim();
    const result = getWhatsAppStatus(sessionId);

    let qrImage = null;

    if (result.qr) {
      qrImage = await QRCode.toDataURL(result.qr);
    }

    return res.json({ ok: true, ...result, sessionId, qrImage });
  } catch (error) {
    return handleError(res, error, 'Gagal mengambil status sesi.', 400);
  }
});

// ---------- WhatsApp: list sessions ----------

router.get('/whatsapp/sessions', auth, allow('ADMIN', 'BOS'), (_req, res) => {
  return res.json({ ok: true, sessions: listWhatsAppSessions() });
});

// ---------- WhatsApp: disconnect / logout ----------

router.post('/whatsapp/disconnect', auth, allow('ADMIN', 'BOS'), async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'ID sesi wajib diisi.' });
    }

    const result = await disconnectWhatsApp(sessionId);

    return res.json({
      ok: true,
      ...result,
      sessionId,
      message: 'Socket sesi diputus. Kredensial tersimpan tidak dihapus.',
    });
  } catch (error) {
    return handleError(res, error, 'Gagal memutus sesi.', 400);
  }
});

router.post('/whatsapp/logout', auth, allow('ADMIN', 'BOS'), async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'ID sesi wajib diisi.' });
    }

    const result = await logoutWhatsApp(sessionId);

    return res.json({
      ok: true,
      ...result,
      sessionId,
      message: 'Sesi di-logout dan kredensial dihapus. Silakan hubungkan ulang.',
    });
  } catch (error) {
    return handleError(res, error, 'Gagal logout sesi.', 400);
  }
});

// ---------- Fallback ----------

router.use((req, res) => {
  res.status(404).json({ ok: false, error: `Endpoint tidak ditemukan: ${req.method} ${req.originalUrl}` });
});

module.exports = router;

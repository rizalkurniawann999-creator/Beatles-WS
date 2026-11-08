'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const multer = require('multer');

const {
  connectWhatsApp,
  createNewWhatsAppSession,
  startSession,
  requestPairingCode,
  getWhatsAppStatus,
  listWhatsAppSessions,
  disconnectWhatsApp,
} = require('./whatsapp/client');

const router = express.Router();

// Setup multer for .txt and media template uploads
const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const storePath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'store.json'
);

const jwtSecret = process.env.JWT_SECRET;

// ---------- Database seed with real-time credentials ----------

function seedStore() {
  if (fs.existsSync(storePath)) return;

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

  saveStore({
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
        createdAt: new Date().toISOString()
      }
    ],
    templates: [],
    withdrawals: [],
  });
}

function readStore() {
  seedStore();
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(storePath), {
    recursive: true,
  });

  fs.writeFileSync(
    storePath,
    JSON.stringify(store, null, 2)
  );
}

function publicUser(user) {
  return {
    username: user.username,
    role: user.role,
    name: user.name,
  };
}

// ---------- Authentication & permissions ----------

function auth(req, res, next) {
  if (!jwtSecret || jwtSecret.length < 32) {
    return res.status(503).json({
      ok: false,
      error:
        'JWT_SECRET belum disetel. Isi .env dengan secret acak minimal 32 karakter.',
    });
  }

  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      ok: false,
      error: 'Token autentikasi diperlukan.',
    });
  }

  try {
    req.user = jwt.verify(match[1], jwtSecret, {
      issuer: 'beatles-ws',
    });

    return next();

  } catch {
    return res.status(401).json({
      ok: false,
      error: 'Token tidak valid atau sesi berakhir.',
    });
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: 'Akses ditolak untuk role ini.',
      });
    }

    return next();
  };
}

function handleError(res, error, fallback, status = 500) {
  console.error(`${fallback}:`, error.message);

  return res.status(status).json({
    ok: false,
    error: error.message || fallback,
  });
}

// ---------- Health ----------

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'BEATLES-WS API',
    mode: 'testing',
    timestamp: new Date().toISOString(),
  });
});

// ---------- Login & Register ----------

router.post('/auth/login', (req, res) => {
  if (!jwtSecret || jwtSecret.length < 32) {
    return res.status(503).json({
      ok: false,
      error:
        'Backend belum dikonfigurasi. Isi JWT_SECRET minimal 32 karakter.',
    });
  }

  const username = String(
    req.body?.username || ''
  ).trim().toLowerCase();

  const password = String(req.body?.password || '');

  const store = readStore();

  const user = store.users.find(
    (item) => item.username === username
  );

  if (
    !user ||
    !bcrypt.compareSync(password, user.passwordHash)
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Username atau password salah.',
    });
  }

  const token = jwt.sign(
    publicUser(user),
    jwtSecret,
    {
      expiresIn: '8h',
      issuer: 'beatles-ws',
    }
  );

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
    return res.status(400).json({
      ok: false,
      error: 'Username dan password wajib diisi.',
    });
  }

  const store = readStore();
  if (store.users.some(u => u.username === username)) {
    return res.status(400).json({
      ok: false,
      error: 'Username sudah digunakan.',
    });
  }

  const newUser = {
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'USER',
    name: name || username,
  };

  store.users.push(newUser);
  saveStore(store);

  return res.status(201).json({
    ok: true,
    message: 'Registrasi berhasil. Silakan masuk.',
  });
});

router.get('/auth/me', auth, (req, res) => {
  res.json({
    ok: true,
    user: req.user,
  });
});

// ---------- Dashboard ----------

router.get('/dashboard', auth, (req, res) => {
  const store = readStore();

  const withdrawals = store.withdrawals.filter(
    (item) =>
      req.user.role !== 'USER' ||
      item.username === req.user.username
  );

  res.json({
    ok: true,
    user: req.user,
    tariff: store.tariff,
    databasesCount: (store.databases || []).length,
    withdrawalCount: withdrawals.length,
    pendingWithdrawals: withdrawals.filter(
      (item) => item.status === 'PENDING'
    ).length,
  });
});

// ---------- Admin: Database & Template Management ----------

router.get('/admin/databases', auth, allow('ADMIN', 'BOS'), (_req, res) => {
  const store = readStore();
  res.json({
    ok: true,
    databases: store.databases || [],
  });
});

router.post(
  '/admin/databases',
  auth,
  allow('ADMIN'),
  upload.single('file'),
  (req, res) => {
    try {
      const name = String(req.body?.name || 'Kategori Baru').trim();
      const tariffPerMsg = Number(req.body?.tariffPerMsg || 150);
      const templateContent = String(req.body?.templateContent || '').trim();
      const mediaType = String(req.body?.mediaType || 'text').trim();

      let totalNumbers = 0;
      let filePath = null;

      if (req.file) {
        filePath = req.file.path;
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split(/\r?\n|,|\s+/);
        const validNumbers = lines.map(n => n.trim()).filter(n => /^\+?\d{10,15}$/.test(n));
        totalNumbers = validNumbers.length;
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
        createdAt: new Date().toISOString()
      };

      store.databases.unshift(newDb);
      saveStore(store);

      return res.status(201).json({
        ok: true,
        database: newDb,
        message: `Database berhasil dibuat dengan ${totalNumbers} nomor terekstrak.`
      });
    } catch (error) {
      return handleError(res, error, 'Gagal mengupload dan memproses database.');
    }
  }
);

router.delete('/admin/databases/:id', auth, allow('ADMIN'), (req, res) => {
  const store = readStore();
  if (!store.databases) store.databases = [];

  const index = store.databases.findIndex(d => d.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Database tidak ditemukan.' });
  }

  const removed = store.databases.splice(index, 1)[0];
  if (removed.filePath && fs.existsSync(removed.filePath)) {
    try { fs.unlinkSync(removed.filePath); } catch {}
  }

  saveStore(store);
  return res.json({ ok: true, message: 'Database berhasil dihapus.' });
});

// ---------- Tariff ----------

router.get('/settings/tariff', auth, (_req, res) => {
  res.json({
    ok: true,
    tariff: readStore().tariff,
  });
});

router.put(
  '/settings/tariff',
  auth,
  allow('ADMIN', 'BOS'),
  (req, res) => {
    const tariff = Number(req.body?.tariff);

    if (
      !Number.isInteger(tariff) ||
      tariff < 0 ||
      tariff > 1000000
    ) {
      return res.status(400).json({
        ok: false,
        error:
          'Tarif harus bilangan bulat 0 sampai 1.000.000.',
      });
    }

    const store = readStore();

    store.tariff = tariff;
    saveStore(store);

    return res.json({
      ok: true,
      tariff,
    });
  }
);

// ---------- Templates ----------

router.get('/templates', auth, (req, res) => {
  const store = readStore();

  const templates = store.templates.filter(
    (item) =>
      req.user.role !== 'USER' || item.active
  );

  res.json({
    ok: true,
    templates,
  });
});

router.post(
  '/templates',
  auth,
  allow('ADMIN', 'BOS'),
  (req, res) => {
    const name = String(
      req.body?.name || ''
    ).trim().slice(0, 80);

    const content = String(
      req.body?.content || ''
    ).trim().slice(0, 2000);

    if (!name || !content) {
      return res.status(400).json({
        ok: false,
        error: 'Nama dan isi template wajib diisi.',
      });
    }

    const store = readStore();

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

    return res.status(201).json({
      ok: true,
      template: item,
    });
  }
);

// ---------- Withdrawals ----------

router.get('/withdrawals', auth, (req, res) => {
  const store = readStore();

  const withdrawals = store.withdrawals.filter(
    (item) =>
      req.user.role !== 'USER' ||
      item.username === req.user.username
  );

  res.json({
    ok: true,
    withdrawals,
  });
});

router.post(
  '/withdrawals',
  auth,
  allow('USER'),
  (req, res) => {
    const amount = Number(req.body?.amount);

    const method = String(
      req.body?.method || ''
    ).trim().slice(0, 40);

    const destination = String(
      req.body?.destination || ''
    ).trim().slice(0, 160);

    if (
      !Number.isInteger(amount) ||
      amount < 1000 ||
      amount > 100000000 ||
      !method ||
      !destination
    ) {
      return res.status(400).json({
        ok: false,
        error:
          'Nominal minimal Rp1.000 dan metode/tujuan wajib diisi.',
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
      note:
        'Permintaan dicatat sebagai demo. Tidak ada uang yang dipindahkan.',
    });
  }
);

router.patch(
  '/withdrawals/:id/status',
  auth,
  allow('ADMIN'),
  (req, res) => {
    const status = String(
      req.body?.status || ''
    ).toUpperCase();

    if (
      !['PENDING', 'APPROVED', 'REJECTED', 'PAID']
        .includes(status)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Status tidak valid.',
      });
    }

    const store = readStore();

    const item = store.withdrawals.find(
      (entry) => entry.id === req.params.id
    );

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: 'Permintaan tidak ditemukan.',
      });
    }

    item.status = status;
    item.updatedAt = new Date().toISOString();

    saveStore(store);

    return res.json({
      ok: true,
      withdrawal: item,
    });
  }
);

// ---------- Users ----------

router.get(
  '/users',
  auth,
  allow('ADMIN'),
  (_req, res) => {
    const store = readStore();

    res.json({
      ok: true,
      users: store.users.map(publicUser),
    });
  }
);

// ---------- WhatsApp: QR connection ----------

router.post(
  '/whatsapp/connect',
  auth,
  allow('ADMIN', 'BOS'),
  async (req, res) => {
    try {
      const requestedSessionId = String(
        req.body?.sessionId || ''
      ).trim();

      const createNew =
        req.body?.newSession === true ||
        req.body?.mode === 'new' ||
        !requestedSessionId;

      let result;

      if (createNew) {
        result = await createNewWhatsAppSession('qr');
      } else {
        const current = getWhatsAppStatus(
          requestedSessionId
        );

        if (current.connected) {
          result = await createNewWhatsAppSession('qr');
        } else {
          result = await connectWhatsApp(
            requestedSessionId
          );
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
      return handleError(
        res,
        error,
        'Gagal memulai sesi QR.',
        400
      );
    }
  }
);

// ---------- WhatsApp: pairing code ----------

router.post(
  '/whatsapp/pairing-code',
  auth,
  allow('ADMIN', 'BOS'),
  async (req, res) => {
    try {
      const requestedSessionId = String(
        req.body?.sessionId || ''
      ).trim();

      const phoneNumber = String(
        req.body?.phoneNumber || ''
      ).trim();

      if (!phoneNumber) {
        return res.status(400).json({
          ok: false,
          error: 'Nomor telepon wajib diisi.',
        });
      }

      let sessionId = requestedSessionId;

      if (!sessionId) {
        const created = await createNewWhatsAppSession(
          'code'
        );

        sessionId = created.sessionId;
      } else {
        const current = getWhatsAppStatus(sessionId);

        if (current.connected) {
          const created = await createNewWhatsAppSession(
            'code'
          );

          sessionId = created.sessionId;
        } else {
          await startSession(sessionId, 'code');
        }
      }

      const result = await requestPairingCode(
        sessionId,
        phoneNumber
      );

      return res.json({
        ok: true,
        ...result,
        sessionId,
        message:
          'Pairing code diminta. Masukkan kode di WhatsApp pada ponsel yang ingin ditautkan.',
      });
    } catch (error) {
      return handleError(
        res,
        error,
        'Gagal meminta pairing code.',
        400
      );
    }
  }
);

// ---------- WhatsApp: session status ----------

router.get(
  '/whatsapp/status',
  auth,
  allow('ADMIN', 'BOS'),
  async (req, res) => {
    try {
      const sessionId = String(
        req.query.sessionId || 'device-01'
      ).trim();

      const result = getWhatsAppStatus(sessionId);

      let qrImage = null;

      if (result.qr) {
        qrImage = await QRCode.toDataURL(result.qr);
      }

      return res.json({
        ok: true,
        ...result,
        sessionId,
        qrImage,
      });
    } catch (error) {
      return handleError(
        res,
        error,
        'Gagal mengambil status sesi.',
        400
      );
    }
  }
);

// ---------- WhatsApp: list sessions ----------

router.get(
  '/whatsapp/sessions',
  auth,
  allow('ADMIN', 'BOS'),
  (_req, res) => {
    return res.json({
      ok: true,
      sessions: listWhatsAppSessions(),
    });
  }
);

// ---------- WhatsApp: disconnect ----------

router.post(
  '/whatsapp/disconnect',
  auth,
  allow('ADMIN', 'BOS'),
  async (req, res) => {
    try {
      const sessionId = String(
        req.body?.sessionId || ''
      ).trim();

      if (!sessionId) {
        return res.status(400).json({
          ok: false,
          error: 'ID sesi wajib diisi.',
        });
      }

      const result = await disconnectWhatsApp(
        sessionId
      );

      return res.json({
        ok: true,
        ...result,
        sessionId,
        message:
          'Socket sesi diputus. Kredensial tersimpan tidak dihapus.',
      });
    } catch (error) {
      return handleError(
        res,
        error,
        'Gagal memutus sesi.',
        400
      );
    }
  }
);

module.exports = router;
  

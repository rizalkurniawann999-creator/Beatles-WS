'use strict';

/**
 * Beatles-WS WhatsApp gateway (Baileys).
 *
 * Mengelola banyak "session" (perangkat tertaut). Setiap session punya satu
 * socket Baileys. Modul ini menjaga lifecycle socket tetap bersih sehingga
 * scan QR / pairing code bisa diulang berkali-kali tanpa dobel event listener,
 * tanpa memory leak, dan tanpa memutus session lain yang sedang aktif.
 */

const fs = require('fs');
const path = require('path');

const {
  MAX_PAIRING_ATTEMPTS,
  assertPairingAllowed,
  registerPairingAttempt,
  resetPairingAttempts,
} = require('./pairing-limit');

const authRoot = path.join(process.cwd(), 'data', 'whatsapp-auth');
const sessions = new Map();

const MAX_ACTIVE_SESSIONS = 4;
const MAX_RECONNECT_ATTEMPTS = 8;
const RESTARTABLE_STATUS_CODES = [408, 428, 440, 500, 503, 515];

let baileysPromise;

/**
 * Memuat modul Baileys secara lazy (ESM) dan men-cache hasilnya.
 */
async function loadBaileys() {
  if (!baileysPromise) {
    baileysPromise = import('@whiskeysockets/baileys').catch((error) => {
      baileysPromise = null;
      throw error;
    });
  }

  const baileys = await baileysPromise;

  return {
    makeWASocket: baileys.default,
    Browsers: baileys.Browsers,
    useMultiFileAuthState: baileys.useMultiFileAuthState,
    fetchLatestBaileysVersion: baileys.fetchLatestBaileysVersion,
    isJidUser: baileys.isJidUser,
    DisconnectReason: baileys.DisconnectReason,
  };
}

function validateSessionId(sessionId) {
  if (
    typeof sessionId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)
  ) {
    throw new Error('ID session tidak valid.');
  }

  return sessionId;
}

function getSessionDir(sessionId) {
  return path.join(authRoot, validateSessionId(sessionId));
}

function getStatus(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) {
    return {
      sessionId,
      status: 'disconnected',
      connected: false,
      qr: null,
      pairingCode: null,
      error: null,
      mode: null,
      me: null,
      reconnectAttempts: 0,
    };
  }

  return {
    sessionId,
    status: session.status,
    connected: session.status === 'connected',
    qr: session.qr || null,
    pairingCode: session.pairingCode || null,
    pairingAttempt: session.pairingAttempt || 0,
    pairingMaxAttempts: MAX_PAIRING_ATTEMPTS,
    pairingRemaining: Math.max(
      MAX_PAIRING_ATTEMPTS - (session.pairingAttempt || 0),
      0
    ),
    error: session.error || null,
    mode: session.mode || null,
    me: session.me || null,
    reconnectAttempts: session.reconnectAttempts || 0,
  };
}

function clearReconnectTimer(session) {
  if (session?.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

/**
 * Melepas semua listener dari socket lama. Wajib dipanggil sebelum socket
 * dibuang supaya tidak ada listener "hantu" yang menahan referensi (leak).
 */
function detachListeners(socket) {
  if (!socket || !socket.ev) return;

  for (const event of ['connection.update', 'creds.update', 'messages.upsert']) {
    try {
      socket.ev.removeAllListeners(event);
    } catch {
      // Socket sudah tertutup, abaikan.
    }
  }
}

/**
 * Menghentikan socket milik sebuah session dengan bersih.
 * @param {object} session
 * @param {{ logout?: boolean }} [options]
 */
function stopSocket(session, options = {}) {
  if (!session) return;

  clearReconnectTimer(session);

  const socket = session.socket;
  session.socket = null;

  if (!socket) return;

  detachListeners(socket);

  try {
    if (options.logout && typeof socket.logout === 'function') {
      socket.logout().catch(() => {});
    } else {
      socket.end(new Error('Socket dihentikan untuk memulai ulang.'));
    }
  } catch {
    // Socket mungkin sudah tertutup.
  }
}

/**
 * Membuat (atau membuat ulang) socket Baileys untuk sebuah session.
 * Dilindungi oleh "generation" counter agar callback dari socket lama
 * diabaikan, sehingga reconnect berturut-turut tidak saling menimpa.
 */
async function createSocket(session) {
  if (session.stopped || sessions.get(session.id) !== session) {
    return;
  }

  if (session.creatingSocket) return;

  session.creatingSocket = true;

  const generation = (session.generation || 0) + 1;
  session.generation = generation;

  try {
    const {
      makeWASocket,
      Browsers,
      fetchLatestBaileysVersion,
    } = await loadBaileys();

    if (session.stopped || sessions.get(session.id) !== session) {
      return;
    }

    let version;

    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest?.version;
    } catch (error) {
      console.error(
        `[BEATLES-WS] Gagal mengambil versi WhatsApp Web: ${error.message}`
      );
    }

    if (session.stopped || sessions.get(session.id) !== session) {
      return;
    }

    // Bersihkan socket lama (bila ada) sebelum membuat yang baru.
    if (session.socket) {
      stopSocket(session);
    }

    const socketOptions = {
      auth: session.authState,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      syncFullHistory: false,
    };

    if (version) {
      socketOptions.version = version;
    }

    const socket = makeWASocket(socketOptions);

    session.socket = socket;
    session.status = 'connecting';
    session.error = null;

    const isCurrent = () =>
      !session.stopped &&
      sessions.get(session.id) === session &&
      session.generation === generation &&
      session.socket === socket;

    const onCredsUpdate = () => {
      if (!isCurrent()) return;

      Promise.resolve(session.saveCreds()).catch((error) => {
        console.error(
          `[BEATLES-WS] Gagal menyimpan kredensial ${session.id}: ${error.message}`
        );
      });
    };

    socket.ev.on('creds.update', onCredsUpdate);

    socket.ev.on('connection.update', async (update) => {
      if (!isCurrent()) return;

      const { connection, qr, lastDisconnect } = update;

      if (qr && session.mode === 'qr') {
        session.qr = qr;
        session.pairingCode = null;
        session.status = 'qr';
        session.error = null;

        console.log(`[BEATLES-WS] QR siap untuk session ${session.id}`);
      }

      if (connection === 'connecting') {
        if (!session.qr && session.status !== 'pairing_code') {
          session.status = 'connecting';
        }
      }

      if (connection === 'open') {
        clearReconnectTimer(session);
        session.status = 'connected';
        session.qr = null;
        session.pairingCode = null;
        session.error = null;
        session.reconnectAttempts = 0;

        // Pairing sukses: bersihkan riwayat percobaan untuk nomor ini.
        if (session.pendingPairingNumber) {
          resetPairingAttempts(session.pendingPairingNumber);
          session.pendingPairingNumber = null;
        }
        session.pairingAttempt = 0;

        session.me = socket.user
          ? {
              id: socket.user.id || null,
              name: socket.user.name || null,
            }
          : null;

        console.log(`[BEATLES-WS] WhatsApp terhubung: ${session.id}`);
      }

      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.data?.statusCode ??
          null;

        console.warn(
          `[BEATLES-WS] Koneksi ditutup: ${session.id}; kode=${statusCode ?? 'tidak diketahui'}`
        );

        // Jangan biarkan listener lama ikut memproses penutupan.
        detachListeners(socket);
        if (session.socket === socket) {
          session.socket = null;
        }
        session.qr = null;
        session.pairingCode = null;

        if (statusCode === 401) {
          session.status = 'logged_out';
          session.error =
            'Autentikasi ditolak WhatsApp. Tekan hubungkan lagi untuk memulai autentikasi baru.';

          console.warn(
            `[BEATLES-WS] Session ${session.id} perlu autentikasi ulang.`
          );

          return;
        }

        const shouldReconnect =
          !session.stopped &&
          sessions.get(session.id) === session &&
          (statusCode === null ||
            RESTARTABLE_STATUS_CODES.includes(statusCode));

        if (shouldReconnect) {
          if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            session.status = 'disconnected';
            session.error = 'Batas percobaan koneksi ulang tercapai.';
            return;
          }

          session.reconnectAttempts += 1;
          session.status = 'reconnecting';

          const delay = Math.min(session.reconnectAttempts * 2000, 15000);

          session.reconnectTimer = setTimeout(() => {
            session.reconnectTimer = null;
            createSocket(session).catch((error) => {
              session.status = 'disconnected';
              session.error = error.message;

              console.error(
                `[BEATLES-WS] Gagal reconnect ${session.id}:`,
                error.message
              );
            });
          }, delay);
        } else {
          session.status = 'disconnected';
          session.error = `Koneksi terputus${statusCode ? ` (${statusCode})` : ''}.`;
        }
      }
    });
  } catch (error) {
    session.status = 'disconnected';
    session.error = error.message;

    console.error(
      `[BEATLES-WS] Gagal membuat socket ${session.id}:`,
      error.message
    );

    throw error;
  } finally {
    session.creatingSocket = false;
  }
}

/**
 * Memulai (atau memulai ulang) sebuah session dengan mode qr/code.
 */
async function startSession(sessionId, mode = 'qr') {
  validateSessionId(sessionId);

  if (!['qr', 'code'].includes(mode)) {
    throw new Error('Mode koneksi harus qr atau code.');
  }

  const existing = sessions.get(sessionId);

  if (existing && existing.status === 'connected' && existing.mode === mode) {
    return getStatus(sessionId);
  }

  if (
    existing &&
    existing.mode === mode &&
    ['connecting', 'qr', 'pairing_code', 'reconnecting'].includes(
      existing.status
    )
  ) {
    return getStatus(sessionId);
  }

  if (existing) {
    existing.stopped = true;
    stopSocket(existing);
    sessions.delete(sessionId);
  }

  const sessionDir = getSessionDir(sessionId);
  fs.mkdirSync(authRoot, { recursive: true });

  if (existing?.status === 'logged_out') {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }

  fs.mkdirSync(sessionDir, { recursive: true });

  const { useMultiFileAuthState } = await loadBaileys();
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const session = {
    id: sessionId,
    mode,
    authState: state,
    saveCreds,
    socket: null,
    status: 'connecting',
    qr: null,
    pairingCode: null,
    error: null,
    me: null,
    stopped: false,
    creatingSocket: false,
    generation: 0,
    reconnectTimer: null,
    reconnectAttempts: 0,
    pendingPairingNumber: null,
    pairingAttempt: 0,
  };

  sessions.set(sessionId, session);

  await createSocket(session);

  return getStatus(sessionId);
}

/**
 * Membuat session baru dengan ID otomatis (device-01, device-02, ...).
 */
async function createNewWhatsAppSession(mode = 'qr') {
  if (!['qr', 'code'].includes(mode)) {
    throw new Error('Mode koneksi harus qr atau code.');
  }

  const activeStatuses = new Set([
    'connecting',
    'qr',
    'pairing_code',
    'reconnecting',
    'connected',
  ]);

  const activeCount = Array.from(sessions.values()).filter((session) =>
    activeStatuses.has(session.status)
  ).length;

  if (activeCount >= MAX_ACTIVE_SESSIONS) {
    throw new Error(
      `Sudah ada ${MAX_ACTIVE_SESSIONS} session aktif atau menunggu pairing. Putuskan session yang tidak dipakai atau periksa perangkat tertaut WhatsApp.`
    );
  }

  fs.mkdirSync(authRoot, { recursive: true });

  let index = 1;
  let sessionId;

  do {
    sessionId = `device-${String(index).padStart(2, '0')}`;
    index += 1;
  } while (
    sessions.has(sessionId) ||
    fs.existsSync(getSessionDir(sessionId))
  );

  const status = await startSession(sessionId, mode);

  return {
    ...status,
    sessionId,
    mode,
  };
}

async function connectWhatsApp(sessionId = 'device-01') {
  return startSession(sessionId, 'qr');
}

async function requestPairingCode(sessionId, phoneNumber) {
  validateSessionId(sessionId);

  const number = String(phoneNumber || '').replace(/\D/g, '');

  if (number.length < 8 || number.length > 15) {
    throw new Error(
      'Nomor telepon tidak valid. Gunakan kode negara tanpa tanda +.'
    );
  }

  // Cek kuota sebelum menyentuh socket: bila nomor sedang dikunci, tolak lebih
  // awal agar tidak memboroskan percobaan WhatsApp.
  assertPairingAllowed(number);

  let session = sessions.get(sessionId);

  if (!session || session.mode !== 'code') {
    await startSession(sessionId, 'code');
    session = sessions.get(sessionId);
  }

  if (!session || !session.socket) {
    throw new Error('Socket belum siap. Tunggu sebentar lalu coba lagi.');
  }

  if (session.status === 'connected') {
    throw new Error('WhatsApp sudah terhubung.');
  }

  if (session.authState.creds.registered) {
    throw new Error(
      'Session sudah terdaftar. Putuskan session ini sebelum pairing ulang.'
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (
    session.stopped ||
    sessions.get(sessionId) !== session ||
    !session.socket
  ) {
    throw new Error('Session berubah. Coba mulai koneksi lagi.');
  }

  const code = await session.socket.requestPairingCode(number);

  // Pairing code berhasil diminta: catat percobaan. Nomor dikunci sementara
  // setelah 4 percobaan berturut-turut (pengecekan dilakukan di awal).
  session.pendingPairingNumber = number;
  const quota = registerPairingAttempt(number);
  session.pairingAttempt = quota.count;

  session.pairingCode = code;
  session.qr = null;
  session.status = 'pairing_code';

  return {
    sessionId,
    status: session.status,
    pairingCode: code,
    attempt: quota.count,
    maxAttempts: MAX_PAIRING_ATTEMPTS,
    remaining: Math.max(MAX_PAIRING_ATTEMPTS - quota.count, 0),
  };
}

/**
 * Memetakan error pengiriman Baileys menjadi status yang mudah dibaca
 * dashboard (deteksi indikasi blokir / pembatasan / nomor tidak valid).
 */
function classifySendError(error) {
  const statusCode =
    error?.output?.statusCode ?? error?.data?.statusCode ?? null;
  const message = String(error?.message || '').toLowerCase();

  if (statusCode === 403 || message.includes('forbidden')) {
    return {
      status: 'likely_blocked',
      reason: 'blocked_or_forbidden',
      statusCode,
      detail:
        'Pesan ditolak (403). Nomor tujuan kemungkinan memblokir pengirim atau akun dibatasi.',
    };
  }

  if (
    statusCode === 401 ||
    message.includes('not-authorized') ||
    message.includes('unauthorized')
  ) {
    return {
      status: 'unauthorized',
      reason: 'unauthorized',
      statusCode,
      detail: 'Sesi tidak berwenang. Coba hubungkan ulang perangkat WhatsApp.',
    };
  }

  if (statusCode === 404 || message.includes('not found')) {
    return {
      status: 'not_registered',
      reason: 'not_registered',
      statusCode,
      detail: 'Nomor tujuan tidak ditemukan di WhatsApp.',
    };
  }

  if (statusCode === 429 || message.includes('rate')) {
    return {
      status: 'rate_limited',
      reason: 'rate_limited',
      statusCode,
      detail: 'Terlalu banyak permintaan. Perlambat jeda pengiriman.',
    };
  }

  return {
    status: 'failed',
    reason: 'send_failed',
    statusCode,
    detail: error?.message || 'Pengiriman gagal.',
  };
}

/**
 * Memeriksa validitas/status sebuah nomor WhatsApp (terdaftar atau tidak).
 * Berguna untuk mendeteksi nomor tidak valid atau terindikasi dibatasi.
 */
async function checkNumber(sessionId, phone) {
  validateSessionId(sessionId);

  const session = sessions.get(sessionId);

  if (!session || session.status !== 'connected' || !session.socket) {
    const error = new Error('Sesi WhatsApp belum terhubung.');
    error.code = 'NOT_CONNECTED';
    throw error;
  }

  const clean = String(phone || '').replace(/\D/g, '');

  if (clean.length < 8 || clean.length > 15) {
    return {
      phone: clean,
      valid: false,
      status: 'invalid_format',
      reason: 'Format nomor tidak valid.',
    };
  }

  const jid = `${clean}@s.whatsapp.net`;

  try {
    const [result] = await session.socket.onWhatsApp(jid);

    if (result && result.exists) {
      return {
        phone: clean,
        jid: result.jid || jid,
        valid: true,
        status: 'registered',
        reason: 'Nomor terdaftar di WhatsApp.',
      };
    }

    return {
      phone: clean,
      jid,
      valid: false,
      status: 'not_registered',
      reason:
        'Nomor tidak terdaftar di WhatsApp (kemungkinan salah, nonaktif, atau dibatasi).',
    };
  } catch (error) {
    return {
      phone: clean,
      jid,
      valid: false,
      status: 'unknown',
      reason: error.message || 'Gagal memeriksa nomor.',
    };
  }
}

/**
 * Mengirim satu pesan teks/media ke satu nomor.
 * Mengembalikan objek hasil yang kaya info untuk dashboard & log.
 */
async function sendMessage(sessionId = 'device-01', recipient, text, options = {}) {
  validateSessionId(sessionId);

  const session = sessions.get(sessionId);

  if (!session || session.status !== 'connected' || !session.socket) {
    const error = new Error('Sesi WhatsApp belum terhubung.');
    error.code = 'NOT_CONNECTED';
    throw error;
  }

  const cleanPhone = String(recipient || '').replace(/\D/g, '');

  if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
    return {
      success: false,
      status: 'invalid_format',
      reason: 'invalid_number',
      phone: cleanPhone,
      detail: 'Format nomor tidak valid.',
    };
  }

  const jid = `${cleanPhone}@s.whatsapp.net`;

  try {
    // Cegah shadowban / hit tidak valid: pastikan nomor terdaftar dulu.
    const [check] = await session.socket.onWhatsApp(jid);

    if (!check || !check.exists) {
      return {
        success: false,
        status: 'not_registered',
        reason: 'not_registered',
        phone: cleanPhone,
        detail: 'Nomor tidak terdaftar di WhatsApp.',
      };
    }

    let messagePayload = { text };

    if (options.mediaUrl && options.mediaType === 'image') {
      messagePayload = { image: { url: options.mediaUrl }, caption: text };
    } else if (options.mediaUrl && options.mediaType === 'video') {
      messagePayload = { video: { url: options.mediaUrl }, caption: text };
    }

    const sent = await session.socket.sendMessage(check.jid || jid, messagePayload);

    return {
      success: true,
      status: 'sent',
      reason: 'sent',
      phone: cleanPhone,
      jid: check.jid || jid,
      messageId: sent?.key?.id || null,
      detail: 'Pesan terkirim.',
    };
  } catch (error) {
    const classified = classifySendError(error);

    console.error(
      `[BEATLES-WS] Gagal kirim pesan ke ${recipient}:`,
      error.message
    );

    return {
      success: false,
      phone: cleanPhone,
      error: error.message,
      ...classified,
    };
  }
}

function getWhatsAppStatus(sessionId = 'device-01') {
  validateSessionId(sessionId);
  return getStatus(sessionId);
}

function listWhatsAppSessions() {
  return Array.from(sessions.keys()).map((id) => getStatus(id));
}

/**
 * Mencari sesi mode 'code' yang belum terdaftar dan masih hidup. Dipakai agar
 * permintaan pairing berulang memakai sesi yang sama, bukan menumpuk sesi baru
 * yang akhirnya menghabiskan kuota MAX_ACTIVE_SESSIONS.
 */
function findReusableCodeSession() {
  for (const session of sessions.values()) {
    if (
      session.mode === 'code' &&
      !session.stopped &&
      !session.authState.creds.registered &&
      session.status !== 'connected'
    ) {
      return session.id;
    }
  }

  return null;
}

/**
 * Memutus socket sebuah session TANPA menghapus kredensial,
 * sehingga bisa disambungkan kembali nanti tanpa scan ulang.
 */
async function disconnectWhatsApp(sessionId = 'device-01') {
  validateSessionId(sessionId);

  const session = sessions.get(sessionId);

  if (!session) {
    return getStatus(sessionId);
  }

  session.stopped = true;
  stopSocket(session);

  session.status = 'disconnected';
  session.qr = null;
  session.pairingCode = null;
  session.error = null;
  session.me = null;

  sessions.delete(sessionId);

  return getStatus(sessionId);
}

/**
 * Logout penuh: memutus socket, menghapus kredensial di disk, dan
 * menghapus session dari memori. Digunakan saat pengguna ingin menautkan
 * nomor yang benar-benar baru.
 */
async function logoutWhatsApp(sessionId = 'device-01') {
  validateSessionId(sessionId);

  const session = sessions.get(sessionId);

  if (session) {
    session.stopped = true;
    stopSocket(session, { logout: true });
    sessions.delete(sessionId);
  }

  try {
    fs.rmSync(getSessionDir(sessionId), { recursive: true, force: true });
  } catch {
    // Folder mungkin sudah tidak ada.
  }

  return getStatus(sessionId);
}

/**
 * Mematikan seluruh socket dengan rapi (dipakai saat server shutdown).
 */
function shutdownAllSessions() {
  for (const session of sessions.values()) {
    session.stopped = true;
    stopSocket(session);
  }

  sessions.clear();
}

module.exports = {
  connectWhatsApp,
  createNewWhatsAppSession,
  startSession,
  requestPairingCode,
  sendMessage,
  checkNumber,
  getWhatsAppStatus,
  listWhatsAppSessions,
  findReusableCodeSession,
  disconnectWhatsApp,
  logoutWhatsApp,
  shutdownAllSessions,
};

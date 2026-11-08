'use strict';

const fs = require('fs');
const path = require('path');

const authRoot = path.join(process.cwd(), 'data', 'whatsapp-auth');
const sessions = new Map();

let baileysPromise;

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
    };
  }

  return {
    sessionId,
    status: session.status,
    connected: session.status === 'connected',
    qr: session.qr || null,
    pairingCode: session.pairingCode || null,
    error: session.error || null,
  };
}

function clearReconnectTimer(session) {
  if (session?.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

function stopSocket(session) {
  if (!session) return;

  clearReconnectTimer(session);

  const socket = session.socket;
  session.socket = null;

  if (socket) {
    try {
      socket.end(new Error('Socket dihentikan untuk memulai ulang.'));
    } catch {
      // Socket mungkin sudah tertutup.
    }
  }
}

async function createSocket(session) {
  if (session.stopped || sessions.get(session.id) !== session) {
    return;
  }

  if (session.creatingSocket) return;

  session.creatingSocket = true;

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

    const socketOptions = {
      auth: session.authState,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
    };

    if (version) {
      socketOptions.version = version;
    }

    const socket = makeWASocket(socketOptions);

    session.socket = socket;
    session.status = 'connecting';
    session.error = null;

    socket.ev.on('creds.update', session.saveCreds);

    socket.ev.on('connection.update', async (update) => {
      if (
        session.stopped ||
        sessions.get(session.id) !== session ||
        session.socket !== socket
      ) {
        return;
      }

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

        console.log(`[BEATLES-WS] WhatsApp terhubung: ${session.id}`);
      }

      if (connection === 'close') {
        session.socket = null;
        session.qr = null;
        session.pairingCode = null;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.data?.statusCode ??
          null;

        console.warn(
          `[BEATLES-WS] Koneksi ditutup: ${session.id}; kode=${statusCode ?? 'tidak diketahui'}`
        );

        if (statusCode === 401) {
          session.status = 'logged_out';
          session.error =
            'Autentikasi ditolak WhatsApp. Tekan hubungkan lagi untuk memulai autentikasi baru.';

          console.warn(
            `[BEATLES-WS] Session ${session.id} perlu autentikasi ulang.`
          );

          return;
        }

        const restartableCodes = [408, 428, 440, 500, 503, 515];
        const shouldReconnect =
          !session.stopped &&
          sessions.get(session.id) === session &&
          (
            statusCode === null ||
            restartableCodes.includes(statusCode)
          );

        if (shouldReconnect) {
          if (session.reconnectAttempts >= 8) {
            session.status = 'disconnected';
            session.error = 'Batas percobaan koneksi ulang tercapai.';
            return;
          }

          session.reconnectAttempts += 1;
          session.status = 'reconnecting';

          const delay = Math.min(
            session.reconnectAttempts * 2000,
            15000
          );

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

async function startSession(sessionId, mode = 'qr') {
  validateSessionId(sessionId);

  if (!['qr', 'code'].includes(mode)) {
    throw new Error('Mode koneksi harus qr atau code.');
  }

  let existing = sessions.get(sessionId);

  if (existing && existing.status === 'connected') {
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
    stopped: false,
    creatingSocket: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
  };

  sessions.set(sessionId, session);

  await createSocket(session);

  return getStatus(sessionId);
}

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

  if (activeCount >= 4) {
    throw new Error(
      'Sudah ada 4 session aktif atau menunggu pairing. Putuskan session yang tidak dipakai atau periksa perangkat tertaut WhatsApp.'
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

  let session = sessions.get(sessionId);

  if (!session || session.mode !== 'code') {
    await startSession(sessionId, 'code');
    session = sessions.get(sessionId);
  }

  if (!session || !session.socket) {
    throw new Error(
      'Socket belum siap. Tunggu sebentar lalu coba lagi.'
    );
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

  session.pairingCode = code;
  session.qr = null;
  session.status = 'pairing_code';

  return {
    sessionId,
    status: session.status,
    pairingCode: code,
  };
}

// ---------- Real-time Message Sending & Anti-Shadowban Validation ----------

async function sendMessage(sessionId = 'device-01', recipient, text, options = {}) {
  validateSessionId(sessionId);
  const session = sessions.get(sessionId);

  if (!session || session.status !== 'connected' || !session.socket) {
    throw new Error('Sesi WhatsApp belum terhubung.');
  }

  const cleanPhone = String(recipient || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) {
    return { success: false, reason: 'invalid_number' };
  }

  const jid = cleanPhone.includes('@s.whatsapp.net') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

  try {
    // Check if number is registered on WhatsApp to prevent shadowban/invalid hits
    const [result] = await session.socket.onWhatsApp(jid);
    if (!result || !result.exists) {
      return { success: false, reason: 'not_registered' };
    }

    let messagePayload = { text };
    if (options.mediaUrl) {
      // Support media payload if provided
      if (options.mediaType === 'image') {
        messagePayload = { image: { url: options.mediaUrl }, caption: text };
      } else if (options.mediaType === 'video') {
        messagePayload = { video: { url: options.mediaUrl }, caption: text };
      }
    }

    await session.socket.sendMessage(result.jid, messagePayload);
    return { success: true, jid: result.jid };
  } catch (error) {
    console.error(`[BEATLES-WS] Gagal kirim pesan ke ${recipient}:`, error.message);
    return { success: false, reason: 'send_failed', error: error.message };
  }
}

function getWhatsAppStatus(sessionId = 'device-01') {
  validateSessionId(sessionId);
  return getStatus(sessionId);
}

function listWhatsAppSessions() {
  return Array.from(sessions.keys()).map((id) => getStatus(id));
}

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

  sessions.delete(sessionId);

  return getStatus(sessionId);
}

module.exports = {
  connectWhatsApp,
  createNewWhatsAppSession,
  startSession,
  requestPairingCode,
  sendMessage,
  getWhatsAppStatus,
  listWhatsAppSessions,
  disconnectWhatsApp,
};

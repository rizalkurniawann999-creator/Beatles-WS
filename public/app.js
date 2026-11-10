'use strict';

/**
 * Beatles-WS — lapisan integrasi frontend <-> backend (environment real).
 *
 * Skrip ini dimuat SETELAH skrip inline di index.html. Tugasnya menyambungkan
 * dashboard (yang dirender oleh index.html) ke REST API Beatles-WS:
 *   - login/register memakai JWT asli (bukan demo), dengan fallback demo bila
 *     backend tidak dapat dijangkau (mis. dibuka dari hosting statis saja);
 *   - mengisi variabel global yang dipakai index.html (databases, templates,
 *     stats) dari data server nyata sehingga tabel & grafik menampilkan data asli;
 *   - mengunggah berkas kontak (.txt/.csv/.xlsx) dan template media (foto/video)
 *     ke server, lalu memuat ulang daftar dari server;
 *   - menyegarkan tab Multi Server, User Management, Pengumuman, Withdrawal,
 *     dan Logs dari data server.
 *
 * Tidak ada markup index.html yang diubah dari sini — hanya nilai/data runtime.
 */

(function () {
  const META = document.querySelector('meta[name="beatles-api-base"]');
  const API_BASE = ((window.BEATLES_API_BASE || (META && META.content) || '') + '').replace(/\/+$/, '');
  const API = API_BASE + '/api';
  const TOKEN_KEY = 'beatles_token';
  const ROLE_MAP = { BOS: 'boss', ADMIN: 'admin', USER: 'user' };

  let online = false;

  // ---------- HTTP client ----------

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function apiFetch(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    const token = getToken();

    if (options.auth !== false && token) headers.Authorization = 'Bearer ' + token;

    let body = options.body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    try {
      const res = await fetch(API + path, { method: options.method || 'GET', headers, body });
      let data = null;
      try { data = await res.json(); } catch (_) { /* respons tanpa JSON */ }
      return { ok: res.ok, status: res.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: null, networkError: error };
    }
  }

  async function probeBackend() {
    const res = await apiFetch('/health', { auth: false });
    online = Boolean(res.ok && res.data && res.data.ok);
    window.__BEATLES_ONLINE__ = online;
    return online;
  }

  function humanError(res, fallback) {
    if (res && res.data && res.data.error) return res.data.error;
    if (res && res.networkError) return 'Backend tidak dapat dijangkau.';
    return fallback || 'Terjadi kesalahan.';
  }

  // ---------- Pemetaan data server -> variabel global index.html ----------

  // index.html merender tombol hapus sebagai deleteDatabase(<id>) TANPA tanda
  // kutip, jadi id harus numerik. Kita simpan id server (string) di peta dan
  // pakai nomor urut sebagai id tampilan.
  const idMap = { databases: new Map(), templates: new Map() };
  let idSeq = 1;

  function toNumericId(kind, serverId) {
    const numeric = idSeq++;
    idMap[kind].set(numeric, serverId);
    return numeric;
  }

  function applyDatabases(list) {
    idMap.databases.clear();
    databases = (list || []).map((db) => ({
      id: toNumericId('databases', db.id),
      name: db.name,
      count: Number(db.totalNumbers || 0),
      date: String(db.createdAt || '').slice(0, 10),
      filename: db.originalFile || (db.filePath ? db.filePath.split('/').pop() : '-'),
    }));
  }

  function applyTemplates(list) {
    idMap.templates.clear();
    templates = (list || []).map((tpl) => ({
      id: toNumericId('templates', tpl.id),
      name: tpl.name,
      text: tpl.content,
      url: tpl.url || '#',
      media: tpl.mediaUrl ? String(tpl.mediaUrl).split('/').pop() : 'tanpa_media',
      mediaType: tpl.mediaType || 'image',
      mediaUrl: tpl.mediaUrl || '',
      databaseId: tpl.databaseId || null,
    }));
  }

  function applyStats(data) {
    if (!data) return;
    stats = {
      totalSent: Number(data.totalSent || 0),
      monthlyDelivery: data.monthlyDelivery || {},
      countryStats: data.countryStats || {},
    };
    cache.kpis = {
      usersCount: Number(data.usersCount || 0),
      databasesCount: Number(data.databasesCount || 0),
      templatesCount: Number(data.templatesCount || 0),
    };
  }

  // Data mentah terakhir dari server (untuk tab yang butuh detail).
  const cache = { servers: [], users: [], announcements: [], withdrawals: [], messages: [], monitoring: null, kpis: null, me: null, wa: null, settings: null, dashboard: null, contacts: [], contactTags: [] };

  async function refreshAll() {
    const role = currentUser.role;

    const jobs = [
      apiFetch('/templates').then((r) => { if (r.ok) applyTemplates(r.data.templates); }),
      apiFetch('/announcements').then((r) => { if (r.ok) cache.announcements = r.data.announcements || []; }),
      apiFetch('/withdrawals').then((r) => { if (r.ok) cache.withdrawals = r.data.withdrawals || []; }),
      apiFetch('/messages').then((r) => { if (r.ok) cache.messages = r.data.messages || []; }),
      apiFetch('/contacts').then((r) => { if (r.ok) { cache.contacts = r.data.contacts || []; cache.contactTags = r.data.tags || []; } }),
      apiFetch('/auth/me').then((r) => { if (r.ok) cache.me = r.data.user || null; }),
      apiFetch('/dashboard').then((r) => { if (r.ok) cache.dashboard = r.data; }),
      apiFetch('/whatsapp/connected').then((r) => { if (r.ok) cache.wa = r.data; }),
    ];

    if (role === 'admin' || role === 'boss') {
      jobs.push(apiFetch('/admin/databases').then((r) => { if (r.ok) applyDatabases(r.data.databases); }));
      jobs.push(apiFetch('/servers').then((r) => { if (r.ok) cache.servers = r.data.servers || []; }));
      jobs.push(apiFetch('/statistics').then((r) => { if (r.ok) applyStats(r.data); }));
    }

    if (role === 'admin') {
      jobs.push(apiFetch('/users').then((r) => { if (r.ok) cache.users = r.data.users || []; }));
      jobs.push(apiFetch('/admin/monitoring').then((r) => { if (r.ok) cache.monitoring = r.data; }));
      jobs.push(apiFetch('/settings').then((r) => { if (r.ok) cache.settings = r.data.settings || {}; }));
    }

    if (role === 'boss') {
      jobs.push(apiFetch('/settings').then((r) => { if (r.ok) cache.settings = r.data.settings || {}; }));
    }

    await Promise.all(jobs);
  }

  // ---------- Patch render: tampilkan data server di tab terkait ----------

  const originalRenderContent = window.renderContent;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function patchContent() {
    if (!online) return;
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    if (currentTab === 'dashboard') {
      patchDashboard(container);
      return;
    }

    if (currentTab === 'settings' && currentUser.role === 'admin') {
      patchSettings(container);
      return;
    }

    if (currentTab === 'compose' && currentUser.role === 'user') {
      patchCompose(container);
      return;
    }

    if (currentTab === 'multiserver' && (currentUser.role === 'admin' || currentUser.role === 'boss')) {
      const rows = cache.servers.map((s) => `
        <div class="bg-slate-800/80 border border-slate-700 p-4 rounded-xl">
          <div class="flex justify-between items-center mb-2">
            <span class="font-semibold text-sm text-white">${escapeHtml(s.name)}</span>
            <span class="px-2 py-0.5 ${s.status === 'online' ? 'bg-beatles-emerald/20 text-beatles-emerald' : 'bg-rose-500/20 text-rose-300'} text-[10px] rounded-full">${escapeHtml(s.status)}</span>
          </div>
          <p class="text-xs text-slate-400">Host: ${escapeHtml(s.host)} | Region: ${escapeHtml(s.region || '-')} | Load: ${Number(s.load || 0)}%</p>
        </div>`).join('');
      container.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl space-y-4">
          <h4 class="text-base font-bold text-white"><i class="fas fa-server text-beatles-cyan mr-2"></i> Daftar Server Aktif (${cache.servers.length})</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${rows || '<p class="text-xs text-slate-400">Belum ada server.</p>'}</div>
        </div>`;
    } else if (currentTab === 'users' && currentUser.role === 'admin') {
      const rows = cache.users.map((u) => `
        <tr data-username="${escapeHtml(u.username)}">
          <td class="py-3 font-semibold text-white">${escapeHtml(u.name)}<div class="text-[10px] text-slate-500 font-mono">${escapeHtml(u.username)}</div></td>
          <td class="py-3"><span class="px-2 py-0.5 bg-beatles-cyan/20 text-beatles-cyan rounded-full text-[10px]">${escapeHtml(u.role)}</span></td>
          <td class="py-3 text-slate-300">${u.quota ? Number(u.quota).toLocaleString() : '-'}</td>
          <td class="py-3"><span class="${u.active ? 'text-beatles-emerald' : 'text-rose-400'} text-[10px] font-bold">${u.active ? 'AKTIF' : 'NONAKTIF'}</span></td>
          <td class="py-3 text-slate-400">${escapeHtml(u.telegram || '-')}</td>
          <td class="py-3 text-right"><button onclick="adminSetQuota('${escapeHtml(u.username)}', ${Number(u.quota || 0)})" class="text-beatles-cyan hover:text-cyan-300 p-1.5 rounded-lg hover:bg-cyan-500/10" title="Atur Kuota"><i class="fas fa-sliders"></i></button></td>
        </tr>`).join('');
      container.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl">
          <h4 class="text-base font-bold text-white mb-4"><i class="fas fa-users-gear text-beatles-cyan mr-2"></i> Kelola Data &amp; Kuota User</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="border-b border-slate-700 text-slate-400"><tr>
                <th class="pb-3">Nama</th><th class="pb-3">Role</th><th class="pb-3">Kuota</th><th class="pb-3">Status</th><th class="pb-3">Telegram</th><th class="pb-3 text-right">Aksi</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-800">${rows || '<tr><td class="py-3 text-slate-400" colspan="6">Belum ada user.</td></tr>'}</tbody>
            </table>
          </div>
        </div>`;
    } else if (currentTab === 'announcement' && currentUser.role === 'admin') {
      const rows = cache.announcements.map((a) => `
        <div class="bg-slate-800/80 border border-slate-700 p-3 rounded-xl">
          <p class="text-xs text-slate-200">${escapeHtml(a.message)}</p>
          <p class="text-[10px] text-slate-500 mt-1">${escapeHtml(a.author)} • ${String(a.createdAt || '').slice(0, 16).replace('T', ' ')}</p>
        </div>`).join('');
      container.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl space-y-4">
          <h4 class="text-base font-bold text-white"><i class="fas fa-bullhorn text-beatles-cyan mr-2"></i> Siarkan Pengumuman</h4>
          <textarea id="ann-text" class="w-full bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-beatles-cyan h-28" placeholder="Tulis pengumuman resmi..."></textarea>
          <button onclick="adminSendAnnouncement()" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 text-xs px-4 py-2 rounded-xl font-bold transition">Kirim Pengumuman</button>
          <div class="space-y-2 pt-2">${rows || '<p class="text-xs text-slate-400">Belum ada pengumuman.</p>'}</div>
        </div>`;
    } else if (currentTab === 'withdrawal' && currentUser.role === 'admin') {
      const rows = cache.withdrawals.filter((w) => w.status === 'PENDING').map((w) => `
        <div class="withdrawal-item bg-slate-800/80 border border-slate-700 p-4 rounded-xl flex justify-between items-center">
          <div>
            <p class="font-semibold text-xs text-white">${escapeHtml(w.username)}</p>
            <p class="text-xs text-slate-400">${escapeHtml(w.method)}: ${escapeHtml(w.destination)} — Rp ${Number(w.amount || 0).toLocaleString()}</p>
          </div>
          <div class="flex gap-2">
            <button onclick="adminDecideWithdrawal('${escapeHtml(w.id)}','APPROVED',this)" class="bg-beatles-emerald hover:bg-emerald-500 text-beatles-900 text-xs px-3 py-1.5 rounded-lg font-bold transition">ACC</button>
            <button onclick="adminDecideWithdrawal('${escapeHtml(w.id)}','REJECTED',this)" class="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition">Tolak</button>
          </div>
        </div>`).join('');
      container.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl">
          <h4 class="text-base font-bold text-white mb-4"><i class="fas fa-wallet text-beatles-cyan mr-2"></i> Daftar Penarikan Dana Pending</h4>
          <div class="space-y-3">${rows || '<p class="text-xs text-slate-400">Tidak ada permintaan pending.</p>'}</div>
        </div>`;
    } else if (currentTab === 'logs') {
      const rows = cache.messages.slice(0, 50).map((m) => `
        <tr>
          <td class="py-3 text-slate-400">${String(m.createdAt || '').slice(0, 16).replace('T', ' ')}</td>
          <td class="py-3 font-mono text-white">${escapeHtml(m.phone)}</td>
          <td class="py-3">${escapeHtml(m.tag || m.databaseId || '-')}</td>
          <td class="py-3">${escapeHtml(m.templateName || '-')}</td>
          <td class="py-3"><span class="px-2 py-0.5 ${m.status === 'sent' ? 'bg-beatles-emerald/20 text-beatles-emerald' : 'bg-rose-500/20 text-rose-300'} rounded-full">${escapeHtml(m.status || '-')}</span></td>
        </tr>`).join('');
      container.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl">
          <h4 class="text-base font-bold text-white mb-4"><i class="fas fa-history text-beatles-cyan mr-2"></i> Riwayat Pengiriman &amp; Log Sistem</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="border-b border-slate-700 text-slate-400"><tr>
                <th class="pb-3">Waktu</th><th class="pb-3">Nomor Target</th><th class="pb-3">Kategori DB</th><th class="pb-3">Template</th><th class="pb-3">Status</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-800">${rows || '<tr><td class="py-3 text-slate-400" colspan="5">Belum ada log pengiriman.</td></tr>'}</tbody>
            </table>
          </div>
        </div>`;
    }
  }

  function patchDashboard(container) {
    const antiBlast = `
      <div class="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center space-x-3 text-amber-300 text-xs shadow-lg">
        <i class="fas fa-triangle-exclamation text-xl text-amber-400"></i>
        <div><span class="font-bold">PERINGATAN KEAMANAN SISTEM:</span> Akun <b>${escapeHtml(currentUser.role.toUpperCase())}</b> strict DILARANG IKUT NGE-BLAST langsung demi menjaga stabilitas server pusat!</div>
      </div>`;

    if (currentUser.role === 'admin') {
      const kpis = cache.kpis || { usersCount: 0, databasesCount: 0, templatesCount: 0 };
      const countries = Object.entries(stats.countryStats || {});
      const pending = cache.withdrawals.filter((w) => w.status === 'PENDING');
      const pendingTotal = pending.reduce((sum, w) => sum + Number(w.amount || 0), 0);

      container.innerHTML = `
        ${antiBlast}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="glass-panel p-6 rounded-2xl">
            <p class="text-xs text-slate-400 uppercase font-semibold">Statistik Negara Tujuan</p>
            <div class="mt-4 space-y-2">
              ${countries.length ? countries.map(([c, count]) => `
                <div class="flex justify-between text-xs">
                  <span class="text-slate-300">${escapeHtml(c)}</span>
                  <span class="font-bold text-white">${Number(count).toLocaleString()}</span>
                </div>`).join('') : '<p class="text-xs text-slate-500">Belum ada data pengiriman.</p>'}
            </div>
          </div>
          <div class="glass-panel p-6 rounded-2xl">
            <p class="text-xs text-slate-400 uppercase font-semibold">Total User Terdaftar</p>
            <h4 class="text-3xl font-black text-white mt-2">${kpis.usersCount} User</h4>
            <span class="text-xs text-beatles-emerald mt-1 inline-block">${kpis.databasesCount} DB • ${kpis.templatesCount} Template</span>
          </div>
          <div class="glass-panel p-6 rounded-2xl">
            <p class="text-xs text-slate-400 uppercase font-semibold">Withdrawal Pending</p>
            <h4 class="text-3xl font-black text-white mt-2">Rp ${pendingTotal.toLocaleString()}</h4>
            <span class="text-xs text-amber-400 mt-1 inline-block">${pending.length} permintaan menunggu</span>
          </div>
        </div>`;
      return;
    }

    if (currentUser.role === 'boss') {
      const maxMonth = Math.max(1, ...Object.values(stats.monthlyDelivery || {}));
      container.innerHTML = `
        ${antiBlast}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="glass-panel p-6 rounded-2xl">
            <p class="text-xs text-slate-400 uppercase font-semibold">Total Pengiriman Pesan</p>
            <h4 class="text-3xl font-black text-white mt-2">${Number(stats.totalSent || 0).toLocaleString()}</h4>
            <span class="text-xs text-beatles-emerald mt-1 inline-block">Data langsung dari server</span>
          </div>
          <div class="glass-panel p-6 rounded-2xl">
            <p class="text-xs text-slate-400 uppercase font-semibold">Kategori Multi-DB Aktif</p>
            <h4 class="text-3xl font-black text-white mt-2">${databases.length} Kategori</h4>
            <span class="text-xs text-beatles-cyan mt-1 inline-block">Tersinkronisasi dengan Admin</span>
          </div>
          <div class="glass-panel p-6 rounded-2xl">
            <p class="text-xs text-slate-400 uppercase font-semibold">Template &amp; Media</p>
            <h4 class="text-3xl font-black text-white mt-2">${templates.length} Template</h4>
            <span class="text-xs text-beatles-bronze mt-1 inline-block">Mendukung Foto &amp; Video</span>
          </div>
        </div>
        <div class="glass-panel p-6 rounded-2xl">
          <h4 class="text-base font-bold text-white mb-4"><i class="fas fa-chart-bar text-beatles-cyan mr-2"></i> Statistik Pengiriman Bulanan</h4>
          <div class="grid grid-cols-6 md:grid-cols-12 gap-2 items-end h-52 pt-6">
            ${Object.entries(stats.monthlyDelivery || {}).map(([mon, val]) => `
              <div class="flex flex-col items-center gap-2">
                <div style="height: ${Math.round((Number(val) / maxMonth) * 100)}%" class="w-full bg-beatles-cyan/80 rounded-t-lg hover:bg-cyan-400 transition relative group min-h-[2px]">
                  <span class="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">${val}</span>
                </div>
                <span class="text-[10px] text-slate-400">${mon}</span>
              </div>`).join('')}
          </div>
        </div>`;
      return;
    }

    // USER
    const me = cache.me || {};
    const summary = cache.dashboard || {};
    const waConnected = cache.wa && (cache.wa.connected === true || cache.wa.status === 'connected');
    const sent = Number(summary.messagesSent || 0);
    const quota = Number(me.quota || 0);
    const remaining = quota > 0 ? Math.max(quota - sent, 0) : 0;

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div class="glass-panel p-6 rounded-2xl space-y-3">
          <p class="text-xs text-slate-400 uppercase font-semibold">Status Koneksi WhatsApp</p>
          <h4 class="text-xl font-bold ${waConnected ? 'text-emerald-400' : 'text-slate-300'} flex items-center gap-2">
            <span class="w-3 h-3 rounded-full ${waConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}"></span>
            ${waConnected ? 'Terhubung (Sesi Aktif)' : 'Belum Terhubung'}
          </h4>
          <p class="text-xs text-slate-400">${waConnected ? 'Perangkat siap mengirimkan pesan otomatis berdasarkan database dan template yang ditentukan Admin/Boss.' : 'Buka menu Pairing WhatsApp untuk menghubungkan perangkat Anda.'}</p>
        </div>
        <div class="glass-panel p-6 rounded-2xl space-y-3">
          <p class="text-xs text-slate-400 uppercase font-semibold">Kuota Blasting</p>
          <h4 class="text-3xl font-black text-white">${remaining.toLocaleString()} <span class="text-xs text-slate-400 font-normal">Pesan tersisa</span></h4>
          <p class="text-xs text-beatles-cyan">${quota > 0 ? `Kuota total ${quota.toLocaleString()} • terkirim ${sent.toLocaleString()}` : 'Belum ada kuota dari Admin — hubungi admin untuk pengisian.'}</p>
        </div>
      </div>`;
  }

  function patchSettings(container) {
    const s = cache.settings || {};
    container.innerHTML = `
      <div class="glass-panel p-6 rounded-2xl space-y-4">
        <h4 class="text-base font-bold text-white"><i class="fas fa-gear text-beatles-cyan mr-2"></i> Pengaturan Global Sistem</h4>
        <div class="flex items-center justify-between py-2 border-b border-slate-700">
          <span class="text-xs">Mode Maintenance Sistem</span>
          <input type="checkbox" id="set-maintenance" class="accent-beatles-cyan" ${s.maintenance ? 'checked' : ''}>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-slate-700">
          <span class="text-xs">Blokir Nomor Indonesia</span>
          <input type="checkbox" id="set-blockindo" class="accent-beatles-cyan" ${s.blockIndo ? 'checked' : ''}>
        </div>
        <div class="flex items-center justify-between py-2 border-b border-slate-700">
          <span class="text-xs">Blokir Deteksi Shadowban</span>
          <input type="checkbox" id="set-blockshadow" class="accent-beatles-cyan" ${s.blockShadowban ? 'checked' : ''}>
        </div>
        <div class="flex items-center justify-between py-2">
          <span class="text-xs">Batasan Max Pairing WhatsApp</span>
          <input type="number" id="set-maxpairing" value="${Number(s.maxPairing || 4)}" min="1" max="20" class="bg-slate-800 border border-slate-700 text-xs px-3 py-1.5 rounded-lg w-20 text-center text-white">
        </div>
        <button onclick="adminSaveSettings()" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 text-xs px-5 py-2.5 rounded-xl font-bold transition">Simpan Pengaturan</button>
      </div>`;
  }

  function patchCompose(container) {
    const tplOptions = templates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    // Kategori target blast = tag kontak nyata di server (bukan data demo).
    const tagOptions = cache.contactTags
      .map((tag) => {
        const count = cache.contacts.filter((c) => c.tag === tag).length;
        return `<option value="${escapeHtml(tag)}">${escapeHtml(tag)} (${count} nomor)</option>`;
      })
      .join('');

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="glass-panel p-6 rounded-2xl space-y-4">
          <h4 class="text-base font-bold text-white"><i class="fas fa-paper-plane text-beatles-cyan mr-2"></i> Kirim Pesan Tunggal</h4>
          <p class="text-xs text-slate-400">Kirim ke satu nomor target melalui sesi WhatsApp yang aktif.</p>
          <div>
            <label class="block text-[10px] text-slate-400 mb-1">Nomor Tujuan (format 62…)</label>
            <input type="text" id="send-phone" placeholder="628123456789" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-beatles-cyan">
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 mb-1">Isi Pesan</label>
            <textarea id="send-text" placeholder="Tulis pesan..." class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-beatles-cyan h-24"></textarea>
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 mb-1">URL Media (opsional — foto/video)</label>
            <input type="text" id="send-media" placeholder="https://.../gambar.jpg" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-beatles-cyan">
          </div>
          <button onclick="userSendMessage()" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 text-xs px-5 py-2.5 rounded-xl font-bold transition"><i class="fas fa-paper-plane mr-1.5"></i> Kirim Sekarang</button>
        </div>

        <div class="glass-panel p-6 rounded-2xl space-y-4">
          <h4 class="text-base font-bold text-white"><i class="fas fa-bolt text-beatles-emerald mr-2"></i> Blast Massal (Anti-Ban)</h4>
          <p class="text-xs text-slate-400">Kirim ke seluruh nomor dalam kategori database dengan jeda aman.</p>
          <div>
            <label class="block text-[10px] text-slate-400 mb-1">Kategori Database Target</label>
            <select id="blast-tag" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-beatles-cyan">${tagOptions || '<option value="">(belum ada database)</option>'}</select>
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 mb-1">Ambil dari Template (opsional)</label>
            <select id="blast-template" onchange="userApplyTemplate()" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-beatles-cyan">
              <option value="">— pilih template —</option>${tplOptions}
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 mb-1">Isi Pesan Blast</label>
            <textarea id="blast-text" placeholder="Tulis pesan blast..." class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-beatles-cyan h-24"></textarea>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-[10px] text-slate-400">Kecepatan:</label>
            <select id="blast-speed" class="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-slate-200">
              <option value="safe">Aman (30 dtk)</option>
              <option value="standard">Standar (5 dtk)</option>
              <option value="brutal">Cepat (1 dtk)</option>
            </select>
          </div>
          <button onclick="userStartBlast()" class="bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 text-xs px-5 py-2.5 rounded-xl font-bold transition"><i class="fas fa-bolt mr-1.5"></i> Mulai Blast</button>
          <div id="blast-status" class="text-xs text-slate-400"></div>
        </div>
      </div>`;
  }

  window.userApplyTemplate = function () {
    const id = document.getElementById('blast-template').value;
    if (!id) return;
    const tpl = templates.find((t) => String(t.id) === String(id));
    if (!tpl) return;
    document.getElementById('blast-text').value = tpl.text || '';
    window.__blastMedia = tpl.mediaUrl || '';
  };

  window.userSendMessage = async function () {
    const phone = document.getElementById('send-phone').value.trim();
    const text = document.getElementById('send-text').value.trim();
    const mediaUrl = document.getElementById('send-media').value.trim();

    if (!phone) return showToast('Nomor tujuan wajib diisi.', 'error');
    if (!text && !mediaUrl) return showToast('Isi pesan atau media wajib diisi.', 'error');

    const body = { phone, message: text };
    if (mediaUrl) {
      body.mediaUrl = mediaUrl;
      body.mediaType = /\.(mp4|mov|webm)$/i.test(mediaUrl) ? 'video' : 'image';
    }

    const res = await apiFetch('/send-message', { method: 'POST', body });
    if (!res.ok) return showToast(humanError(res, 'Gagal mengirim pesan.'), 'error');
    showToast('Pesan berhasil dikirim!');
    document.getElementById('send-text').value = '';
    await refreshAll();
  };

  window.userStartBlast = async function () {
    const tag = document.getElementById('blast-tag').value;
    const text = document.getElementById('blast-text').value.trim();
    const speed = document.getElementById('blast-speed').value;
    const mediaUrl = window.__blastMedia || '';

    if (!text && !mediaUrl) return showToast('Isi pesan blast wajib diisi.', 'error');
    if (!tag) return showToast('Pilih kategori database target.', 'error');

    const body = { tag, message: text, speed };
    if (mediaUrl) {
      body.mediaUrl = mediaUrl;
      body.mediaType = /\.(mp4|mov|webm)$/i.test(mediaUrl) ? 'video' : 'image';
    }

    const res = await apiFetch('/broadcast', { method: 'POST', body });
    if (!res.ok) return showToast(humanError(res, 'Gagal memulai blast.'), 'error');

    const statusEl = document.getElementById('blast-status');
    showToast(`Blast dimulai untuk ${res.data.total} nomor.`);
    const poll = async () => {
      const st = await apiFetch('/broadcast/' + encodeURIComponent(res.data.broadcastId));
      if (!st.ok) return;
      const b = st.data.broadcast;
      if (statusEl) statusEl.textContent = `Status: ${b.status} — ${b.sent}/${b.total} terkirim, ${b.failed} gagal.`;
      if (b.status === 'running') setTimeout(poll, 3000);
      else { await refreshAll(); showToast('Blast selesai.', 'info'); }
    };
    setTimeout(poll, 1500);
  };

  window.renderContent = function () {
    originalRenderContent();
    try { patchContent(); } catch (error) { console.error('patchContent:', error); }
  };

  // index.html tidak punya entri nav untuk kirim/blast. Tambahkan tombolnya dari
  // JS (tanpa mengubah markup HTML) agar fitur ini bisa diakses role USER.
  const originalRenderSidebar = window.renderSidebar;

  window.renderSidebar = function () {
    originalRenderSidebar();
    if (currentUser.role !== 'user') return;

    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;

    const btn = document.createElement('button');
    btn.className =
      'w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-semibold transition ' +
      (currentTab === 'compose' ? 'nav-active' : 'text-slate-400 hover:text-white hover:bg-slate-800/40');
    btn.innerHTML = '<i class="fas fa-paper-plane w-5"></i><span>Kirim Pesan / Blast</span>';
    btn.onclick = () => changeTab('compose');
    nav.appendChild(btn);
  };

  // ---------- Aksi admin (dipanggil dari tombol hasil patch) ----------

  window.adminSetQuota = async function (username, current) {
    const input = window.prompt(`Kuota blast baru untuk ${username}:`, current);
    if (input === null) return;
    const quota = Number(input);
    if (!Number.isFinite(quota) || quota < 0) return showToast('Kuota harus angka >= 0.', 'error');
    const res = await apiFetch('/users/' + encodeURIComponent(username), { method: 'PATCH', body: { quota } });
    if (!res.ok) return showToast(humanError(res, 'Gagal menyimpan kuota.'), 'error');
    showToast('Kuota diperbarui.');
    await refreshAll();
    window.renderContent();
  };

  window.adminSendAnnouncement = async function () {
    const el = document.getElementById('ann-text');
    const message = el ? el.value.trim() : '';
    if (!message) return showToast('Isi pengumuman wajib diisi!', 'error');
    const res = await apiFetch('/announcements', { method: 'POST', body: { message } });
    if (!res.ok) return showToast(humanError(res, 'Gagal mengirim pengumuman.'), 'error');
    showToast('Pengumuman berhasil disiarkan!');
    await refreshAll();
    window.renderContent();
  };

  window.adminDecideWithdrawal = async function (id, status, btn) {
    const res = await apiFetch('/withdrawals/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: { status } });
    if (!res.ok) return showToast(humanError(res, 'Gagal memperbarui withdrawal.'), 'error');
    showToast(status === 'APPROVED' ? 'Withdrawal disetujui!' : 'Withdrawal ditolak.', status === 'APPROVED' ? 'success' : 'info');
    const row = btn && btn.closest('.withdrawal-item');
    if (row) row.remove();
  };

  window.adminSaveSettings = async function () {
    const body = {
      maintenance: document.getElementById('set-maintenance').checked,
      blockIndo: document.getElementById('set-blockindo').checked,
      blockShadowban: document.getElementById('set-blockshadow').checked,
      maxPairing: Number(document.getElementById('set-maxpairing').value || 4),
    };
    const res = await apiFetch('/settings', { method: 'PUT', body });
    if (!res.ok) return showToast(humanError(res, 'Gagal menyimpan pengaturan.'), 'error');
    cache.settings = res.data.settings || {};
    showToast('Pengaturan global berhasil disimpan!');
  };

  // ---------- Override aksi unggah/kelola ----------

  window.handleUploadDB = async function () {
    const nameInput = document.getElementById('db-input-name');
    const fileInput = document.getElementById('db-file-upload');
    if (!nameInput.value || fileInput.files.length === 0) {
      return showToast('Mohon isi nama kategori database dan pilih file (.txt/.xlsx)!', 'error');
    }
    if (!online) return showToast('Backend offline — fitur unggah tidak tersedia.', 'error');
    if (currentUser.role === 'user') return showToast('Unggah database kategori hanya untuk Admin/Boss.', 'error');

    const form = new FormData();
    form.append('name', nameInput.value);
    form.append('file', fileInput.files[0]);

    const res = await apiFetch('/admin/databases', { method: 'POST', body: form });
    if (!res.ok) return showToast(humanError(res, 'Gagal mengunggah database.'), 'error');

    showToast(res.data.message || `Terdeteksi ${res.data.database.totalNumbers} nomor valid.`);
    nameInput.value = '';
    fileInput.value = '';
    await refreshAll();
    window.renderContent();
  };

  window.handleAddTemplate = async function () {
    const name = document.getElementById('tpl-name').value;
    const text = document.getElementById('tpl-text').value;
    const url = document.getElementById('tpl-url').value;
    const mediaInput = document.getElementById('tpl-media');

    if (!name || !text) return showToast('Nama template dan teks pesan wajib diisi!', 'error');
    if (!online) return showToast('Backend offline — fitur template tidak tersedia.', 'error');
    if (currentUser.role === 'user') return showToast('Kelola template hanya untuk Admin/Boss.', 'error');

    const form = new FormData();
    form.append('name', name);
    form.append('content', text);
    form.append('url', url || '');
    if (mediaInput.files.length > 0) {
      const file = mediaInput.files[0];
      form.append('media', file);
      form.append('mediaType', /\.mp4$/i.test(file.name) ? 'video' : 'image');
    }

    const res = await apiFetch('/templates', { method: 'POST', body: form });
    if (!res.ok) return showToast(humanError(res, 'Gagal menyimpan template.'), 'error');

    showToast('Template pesan berhasil disimpan!');
    document.getElementById('tpl-name').value = '';
    document.getElementById('tpl-text').value = '';
    document.getElementById('tpl-url').value = '';
    mediaInput.value = '';
    await refreshAll();
    window.renderContent();
  };

  window.deleteDatabase = async function (id) {
    const serverId = idMap.databases.get(Number(id));
    if (online && serverId && (currentUser.role === 'admin' || currentUser.role === 'boss')) {
      const res = await apiFetch('/admin/databases/' + encodeURIComponent(serverId), { method: 'DELETE' });
      if (!res.ok) return showToast(humanError(res, 'Gagal menghapus database.'), 'error');
      showToast('Database kontak berhasil dihapus', 'info');
      await refreshAll();
      return window.renderContent();
    }
    databases = databases.filter((d) => d.id !== Number(id));
    showToast('Database kontak berhasil dihapus', 'info');
    window.renderContent();
  };

  window.deleteTemplate = async function (id) {
    const serverId = idMap.templates.get(Number(id));
    if (online && serverId && (currentUser.role === 'admin' || currentUser.role === 'boss')) {
      const res = await apiFetch('/templates/' + encodeURIComponent(serverId), { method: 'DELETE' });
      if (!res.ok) return showToast(humanError(res, 'Gagal menghapus template.'), 'error');
      showToast('Template berhasil dihapus', 'info');
      await refreshAll();
      return window.renderContent();
    }
    templates = templates.filter((t) => t.id !== Number(id));
    showToast('Template berhasil dihapus', 'info');
    window.renderContent();
  };

  // ---------- Override autentikasi ----------

  const originalSubmitLogin = window.submitLogin;

  window.submitLogin = async function () {
    const user = document.getElementById('login-username').value.trim().toLowerCase();
    const pass = document.getElementById('login-password').value.trim();
    const errBox = document.getElementById('auth-error');

    if (!user || !pass) {
      errBox.innerText = 'Username dan kata sandi wajib diisi!';
      errBox.classList.remove('hidden');
      return;
    }

    if (online) {
      const res = await apiFetch('/auth/login', { method: 'POST', auth: false, body: { username: user, password: pass } });
      if (!res.ok) {
        errBox.innerText = humanError(res, 'Username atau password salah.');
        errBox.classList.remove('hidden');
        return;
      }
      setToken(res.data.token);
      const apiUser = res.data.user || {};
      currentUser = {
        username: apiUser.username || user,
        role: ROLE_MAP[apiUser.role] || 'user',
        name: apiUser.name || user,
      };
      localStorage.setItem('beatles_user', JSON.stringify(currentUser));
      errBox.classList.add('hidden');
      showToast(`Berhasil masuk sebagai ${currentUser.role.toUpperCase()}`);
      await refreshAll();
      startDashboard();
      return;
    }

    return originalSubmitLogin();
  };

  const originalSubmitRegister = window.submitRegister;

  window.submitRegister = async function () {
    const name = document.getElementById('reg-name').value.trim();
    const user = document.getElementById('reg-user').value.trim();
    const pass = document.getElementById('reg-pass').value.trim();

    if (!name || !user || !pass) return showToast('Semua kolom registrasi wajib diisi!', 'error');

    if (online) {
      const res = await apiFetch('/auth/register', { method: 'POST', auth: false, body: { name, username: user, password: pass } });
      if (!res.ok) return showToast(humanError(res, 'Registrasi gagal.'), 'error');
      showToast('Registrasi berhasil! Silakan masuk.');
      toggleAuth('login');
      return;
    }

    return originalSubmitRegister();
  };

  const originalLogout = window.logout;

  window.logout = function () {
    setToken('');
    cache.servers = []; cache.users = []; cache.announcements = []; cache.withdrawals = []; cache.messages = [];
    return originalLogout();
  };

  // startDashboard() dari index.html tidak me-reset tab aktif. Setelah logout lalu
  // login dengan role berbeda tanpa reload, currentTab lama (mis. 'stokdb' milik
  // Admin) tetap terpakai oleh role baru sehingga konten dashboard kosong. Paksa
  // kembali ke 'dashboard' setiap kali dashboard dibuka.
  const originalStartDashboard = window.startDashboard;

  window.startDashboard = function () {
    currentTab = 'dashboard';
    return originalStartDashboard();
  };

  window.checkSession = async function () {
    await probeBackend();

    const saved = localStorage.getItem('beatles_user');
    if (!saved) return;

    try {
      currentUser = JSON.parse(saved);
    } catch (_) {
      return;
    }

    // Bila backend online, verifikasi token masih berlaku sebelum masuk.
    if (online) {
      if (!getToken()) {
        // Backend aktif tapi tidak ada token (mis. setelah logout): tampilkan
        // halaman login, bukan dashboard kosong.
        return;
      }

      const me = await apiFetch('/auth/me');
      if (!me.ok) {
        setToken('');
        return; // sesi kedaluwarsa — tampilkan halaman console/login
      }
      const apiUser = me.data.user || {};
      currentUser = {
        username: apiUser.username || currentUser.username,
        role: ROLE_MAP[apiUser.role] || currentUser.role,
        name: apiUser.name || currentUser.name,
      };
      await refreshAll();
      return startDashboard();
    }

    return startDashboard();
  };

  // Probe backend lebih awal supaya status online tersedia untuk checkSession.
  probeBackend();
})();

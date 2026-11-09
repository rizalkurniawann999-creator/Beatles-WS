'use strict';

/* =========================================================================
 * Beatles-WS — dashboard frontend logic
 * Terhubung langsung ke REST API di /api (JWT bearer).
 * ========================================================================= */

const API_BASE = '/api';

let authToken = localStorage.getItem('beatles_token') || '';
let currentUser = JSON.parse(localStorage.getItem('beatles_user') || 'null');
let currentPage = 'dashboard';
let waPollTimer = null;
let waPillTimer = null;

/* ------------------------------ Utilities ------------------------------ */

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;

    const palette = {
        success: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-300', icon: 'fa-circle-check' },
        error: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-300', icon: 'fa-circle-exclamation' },
        info: { border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', text: 'text-cyan-300', icon: 'fa-circle-info' },
        warn: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', text: 'text-yellow-300', icon: 'fa-triangle-exclamation' }
    };

    const p = palette[type] || palette.info;

    const el = document.createElement('div');
    el.className = `toast glass-panel ${p.border} ${p.bg} ${p.text} rounded-xl px-4 py-3 flex items-start gap-3 shadow-2xl`;
    el.innerHTML = `<i class="fas ${p.icon} mt-0.5"></i><div class="text-sm leading-snug flex-1">${escapeHtml(message)}</div>`;

    stack.appendChild(el);

    setTimeout(() => {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(24px)';
        setTimeout(() => el.remove(), 300);
    }, 4200);
}

function openModal(html) {
    const root = document.getElementById('modal-root');
    document.getElementById('modal-card').innerHTML = html;
    root.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-root').classList.add('hidden');
    document.getElementById('modal-card').innerHTML = '';
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
});

function setBusy(button, busy, labelWhenBusy = 'Memproses...') {
    if (!button) return;
    if (busy) {
        button.dataset.original = button.innerHTML;
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
        button.innerHTML = `<span class="spinner mr-2 align-middle"></span> ${escapeHtml(labelWhenBusy)}`;
    } else {
        button.disabled = false;
        button.classList.remove('opacity-70', 'cursor-not-allowed');
        if (button.dataset.original) button.innerHTML = button.dataset.original;
    }
}

async function api(path, options = {}) {
    const headers = Object.assign(
        { 'Content-Type': 'application/json' },
        options.headers || {}
    );

    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    let res;

    try {
        res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
    } catch (error) {
        throw new Error('Tidak dapat menghubungi server.');
    }

    let data = {};

    try {
        data = await res.json();
    } catch {
        data = {};
    }

    if (res.status === 401) {
        handleUnauthorized();
        throw new Error(data.error || 'Sesi berakhir. Silakan masuk lagi.');
    }

    if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Permintaan gagal (${res.status}).`);
    }

    return data;
}

function handleUnauthorized() {
    stopPolling();
    authToken = '';
    currentUser = null;
    localStorage.removeItem('beatles_token');
    localStorage.removeItem('beatles_user');
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-console').classList.remove('hidden');
    toast('Sesi berakhir. Silakan masuk kembali.', 'warn');
}

/* ------------------------------- Auth view ------------------------------ */

function setAuthError(message, targetId = 'auth-error') {
    const box = document.getElementById(targetId);
    if (!box) return;

    if (message) {
        box.innerText = message;
        box.classList.remove('hidden');
    } else {
        box.innerText = '';
        box.classList.add('hidden');
    }
}

function showAuth() {
    document.getElementById('view-console').classList.add('hidden');
    document.getElementById('view-auth').classList.remove('hidden');
    setAuthError('');
}

function toggleAuth(type) {
    setAuthError('');
    setAuthError('', 'register-error');

    if (type === 'register') {
        document.getElementById('form-login').classList.add('hidden');
        document.getElementById('form-register').classList.remove('hidden');
    } else {
        document.getElementById('form-register').classList.add('hidden');
        document.getElementById('form-login').classList.remove('hidden');
    }
}

async function submitLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const button = document.getElementById('login-btn');

    if (!username || !password) {
        setAuthError('Username dan kata sandi wajib diisi.');
        return;
    }

    setAuthError('');
    setBusy(button, true, 'Masuk...');

    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('beatles_token', authToken);
        localStorage.setItem('beatles_user', JSON.stringify(currentUser));

        toast(`Selamat datang, ${data.user.name || data.user.username}!`, 'success');
        enterDashboard(data.user);
    } catch (error) {
        setAuthError(error.message);
    } finally {
        setBusy(button, false);
    }
}

async function submitRegister() {
    const name = document.getElementById('register-name').value.trim();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const button = document.getElementById('register-btn');

    if (!username || !password) {
        setAuthError('Username dan kata sandi wajib diisi.', 'register-error');
        return;
    }

    setAuthError('', 'register-error');
    setBusy(button, true, 'Mendaftar...');

    try {
        await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, username, password })
        });

        document.getElementById('login-username').value = username;
        document.getElementById('login-password').value = '';
        document.getElementById('register-name').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';

        toggleAuth('login');
        setAuthError('Registrasi berhasil. Silakan masuk.');
        toast('Akun berhasil dibuat.', 'success');
    } catch (error) {
        setAuthError(error.message, 'register-error');
    } finally {
        setBusy(button, false);
    }
}

function logout() {
    stopPolling();
    authToken = '';
    currentUser = null;
    localStorage.removeItem('beatles_token');
    localStorage.removeItem('beatles_user');

    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-console').classList.remove('hidden');
    document.getElementById('login-password').value = '';
    setAuthError('');
    toast('Anda telah keluar.', 'info');
}

/* ------------------------------- Dashboard ------------------------------ */

function toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (open) {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
    }
}

function navItemsFor(role) {
    const shared = [
        { id: 'wa-connect', icon: 'fa-qrcode', label: 'WhatsApp Gateway' },
        { id: 'kontak', icon: 'fa-address-book', label: 'Database Nomor' },
        { id: 'template', icon: 'fa-file-lines', label: 'Template Pesan' },
        { id: 'kirim', icon: 'fa-paper-plane', label: 'Kirim Pesan' },
        { id: 'broadcast', icon: 'fa-tower-broadcast', label: 'Kendali Massal' }
    ];

    if (role === 'admin') {
        return [
            { id: 'dashboard', icon: 'fa-server', label: 'Monitoring Server' },
            ...shared,
            { id: 'manajemen-user', icon: 'fa-user-cog', label: 'Manajemen User' },
            { id: 'persetujuan', icon: 'fa-check-circle', label: 'Persetujuan Withdraw' },
            { id: 'pengaturan', icon: 'fa-sliders', label: 'Pengaturan Tarif' }
        ];
    }

    if (role === 'bos') {
        return [
            { id: 'dashboard', icon: 'fa-chart-line', label: 'Executive Analytics' },
            ...shared,
            { id: 'pengaturan', icon: 'fa-sliders', label: 'Pengaturan Tarif' }
        ];
    }

    return [
        { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
        ...shared,
        { id: 'tarik', icon: 'fa-wallet', label: 'Tarik Saldo' }
    ];
}

function buildSidebar(role) {
    const nav = document.getElementById('sidebar-nav');
    const items = navItemsFor(role);

    nav.innerHTML = items.map((item) => `
        <button data-nav="${item.id}" onclick="loadContent('${item.id}')" class="nav-btn w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/80 hover:text-beatles-cyan transition-all text-left">
            <i class="fas ${item.icon} w-5 text-center text-lg"></i>
            <span class="font-medium tracking-wide">${escapeHtml(item.label)}</span>
        </button>
    `).join('');
}

function markActiveNav(page) {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.classList.toggle('nav-active', btn.dataset.nav === page);
    });
}

function enterDashboard(user) {
    currentUser = user;
    const role = String(user.role || 'USER').toLowerCase();

    document.getElementById('view-console').classList.add('hidden');
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');
    document.getElementById('user-role-display').innerText = `Akses: ${role}`;
    document.getElementById('top-username').innerText = (user.name || user.username || '').toUpperCase();
    document.getElementById('top-role').innerText = `Role: ${role.toUpperCase()}`;

    buildSidebar(role);
    loadContent('dashboard');
    startPolling();
}

function pageTitle(page) {
    const map = {
        dashboard: 'Dashboard',
        'wa-connect': 'WhatsApp Gateway',
        kontak: 'Database Nomor Tujuan',
        template: 'Template Pesan',
        kirim: 'Kirim Pesan',
        broadcast: 'Kendali Massal (Broadcast)',
        'manajemen-user': 'Manajemen User',
        persetujuan: 'Persetujuan Withdraw',
        pengaturan: 'Pengaturan Tarif',
        tarik: 'Tarik Saldo'
    };

    return map[page] || 'Dashboard';
}

async function loadContent(page) {
    currentPage = page;
    document.getElementById('page-title').innerText = pageTitle(page);
    markActiveNav(page);

    const content = document.getElementById('dashboard-content');
    content.innerHTML = `<div class="flex items-center justify-center py-24 text-slate-500"><span class="spinner mr-3"></span> Memuat ${escapeHtml(pageTitle(page))}...</div>`;

    try {
        if (page === 'dashboard') return await renderDashboard(content);
        if (page === 'wa-connect') return await renderWaConnect(content);
        if (page === 'kontak') return await renderContacts(content);
        if (page === 'template') return await renderTemplates(content);
        if (page === 'kirim') return await renderSendMessage(content);
        if (page === 'broadcast') return await renderBroadcast(content);
        if (page === 'manajemen-user') return await renderUsers(content);
        if (page === 'persetujuan') return await renderWithdrawals(content);
        if (page === 'pengaturan') return await renderSettings(content);
        if (page === 'tarik') return await renderWithdraw(content);
        content.innerHTML = `<p class="text-slate-500">Halaman tidak dikenal.</p>`;
    } catch (error) {
        content.innerHTML = `
            <div class="glass-panel border border-red-500/30 rounded-2xl p-8 text-center">
                <i class="fas fa-triangle-exclamation text-4xl text-red-400 mb-3"></i>
                <p class="text-red-300">${escapeHtml(error.message)}</p>
            </div>`;
    }
}

/* ------------------------------- Dashboard ------------------------------ */

function statCard(label, value, icon, color) {
    return `
        <div class="glass-panel p-6 rounded-2xl border-t-2 border-t-${color} shadow-lg relative overflow-hidden">
            <i class="fas ${icon} absolute -right-4 -bottom-4 text-7xl text-slate-800/60"></i>
            <h4 class="text-xs font-semibold text-slate-400 mb-2 tracking-widest uppercase">${escapeHtml(label)}</h4>
            <p class="text-3xl font-black text-white drop-shadow-md">${escapeHtml(value)}</p>
        </div>`;
}

async function renderDashboard(content) {
    const [dash, messages] = await Promise.all([
        api('/dashboard'),
        api('/messages').catch(() => ({ messages: [] }))
    ]);

    const recent = (messages.messages || []).slice(0, 8);

    const statusMeta = {
        sent: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Terkirim' },
        not_registered: { cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', label: 'Tidak terdaftar' },
        likely_blocked: { cls: 'bg-red-500/15 text-red-300 border-red-500/30', label: 'Terindikasi blokir' },
        invalid_format: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', label: 'Format salah' },
        rate_limited: { cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30', label: 'Rate limit' },
        failed: { cls: 'bg-red-500/15 text-red-300 border-red-500/30', label: 'Gagal' }
    };

    const rows = recent.length
        ? recent.map((m) => {
              const meta = statusMeta[m.status] || { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', label: m.status || '-' };
              return `
                <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="p-3 font-mono text-xs text-slate-300">${escapeHtml(m.phone)}</td>
                    <td class="p-3 text-slate-400 text-xs max-w-[220px] truncate" title="${escapeHtml(m.text)}">${escapeHtml((m.text || '').slice(0, 60))}</td>
                    <td class="p-3"><span class="text-[10px] px-2 py-1 rounded border ${meta.cls}">${escapeHtml(meta.label)}</span></td>
                    <td class="p-3 text-slate-500 text-xs">${escapeHtml(new Date(m.createdAt).toLocaleString('id-ID'))}</td>
                </tr>`;
          }).join('')
        : `<tr><td colspan="4" class="p-6 text-center text-slate-500 text-sm">Belum ada riwayat pesan.</td></tr>`;

    content.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
            ${statCard('Total Kontak', dash.contactsCount ?? 0, 'fa-address-book', 'beatles-cyan')}
            ${statCard('Template Pesan', dash.templatesCount ?? 0, 'fa-file-lines', 'blue-500')}
            ${statCard('Pesan Terkirim', dash.messagesSent ?? 0, 'fa-paper-plane', 'beatles-emerald')}
            ${statCard('Pesan Gagal', dash.messagesFailed ?? 0, 'fa-triangle-exclamation', 'red-500')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-lg font-bold text-white mb-4 flex items-center"><i class="fas fa-clock-rotate-left text-beatles-cyan mr-2"></i> Riwayat Pesan Terbaru</h4>
                <div class="overflow-x-auto rounded-xl border border-slate-700">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-800/80 text-beatles-cyan text-xs uppercase tracking-wider">
                            <tr><th class="p-3">Nomor</th><th class="p-3">Pesan</th><th class="p-3">Status</th><th class="p-3">Waktu</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700/50">${rows}</tbody>
                    </table>
                </div>
            </div>

            <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-lg font-bold text-white mb-4 flex items-center"><i class="fas fa-circle-info text-beatles-cyan mr-2"></i> Ringkasan Akun</h4>
                <ul class="space-y-3 text-sm">
                    <li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Pengguna</span><span class="text-white font-semibold">${escapeHtml(currentUser?.username || '-')}</span></li>
                    <li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Role</span><span class="text-beatles-emerald font-semibold uppercase">${escapeHtml(currentUser?.role || '-')}</span></li>
                    <li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Tarif / pesan</span><span class="text-yellow-400 font-mono">Rp ${escapeHtml(dash.tariff)}</span></li>
                    <li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Database</span><span class="text-white font-semibold">${escapeHtml(dash.databasesCount ?? 0)}</span></li>
                    <li class="flex justify-between"><span class="text-slate-400">Withdraw pending</span><span class="text-white font-semibold">${escapeHtml(dash.pendingWithdrawals ?? 0)}</span></li>
                </ul>
                <div class="mt-5 bg-yellow-500/10 border-l-4 border-yellow-500 p-3 rounded-r-lg text-yellow-200 text-xs">
                    <span class="font-bold">Perhatian!</span> Jangan mengirim konten spam. Sistem memberi jeda otomatis untuk menjaga reputasi nomor.
                </div>
            </div>
        </div>`;
}

/* --------------------------- WhatsApp Gateway --------------------------- */

let activeWaSessionId = '';

function waStatusBadge(status) {
    const map = {
        connected: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400', label: 'Connected' },
        qr: { cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', dot: 'bg-cyan-400', label: 'Menunggu Scan QR' },
        pairing_code: { cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30', dot: 'bg-blue-400', label: 'Pairing Code' },
        connecting: { cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', dot: 'bg-yellow-400', label: 'Connecting' },
        reconnecting: { cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30', dot: 'bg-orange-400', label: 'Reconnecting' },
        logged_out: { cls: 'bg-red-500/15 text-red-300 border-red-500/30', dot: 'bg-red-400', label: 'Logged Out' },
        disconnected: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', dot: 'bg-slate-400', label: 'Disconnected' }
    };

    return map[status] || map.disconnected;
}

async function renderWaConnect(content) {
    const sessionsData = await api('/whatsapp/sessions').catch(() => ({ sessions: [] }));
    const sessions = sessionsData.sessions || [];

    if (!activeWaSessionId && sessions.length) {
        activeWaSessionId = sessions[0].sessionId;
    }

    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                    <h4 class="text-lg font-black text-white mb-1"><i class="fas fa-plug text-beatles-cyan mr-2"></i> Hubungkan Perangkat</h4>
                    <p class="text-sm text-slate-400 mb-5">Tautkan nomor WhatsApp Anda ke server inti Beatles-WS.</p>

                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nomor (untuk Pairing Code)</label>
                    <input id="pairing-phone" type="tel" placeholder="6281234567890" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white mb-4 focus:border-beatles-cyan focus:outline-none">

                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="connectQr(this)" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 font-bold py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                            <i class="fas fa-qrcode mr-1"></i> Scan QR
                        </button>
                        <button onclick="requestPairing(this)" class="bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 font-bold py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                            <i class="fas fa-hashtag mr-1"></i> Pairing Code
                        </button>
                    </div>
                </div>

                <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                    <h4 class="text-lg font-bold text-white mb-4 flex items-center justify-between">
                        <span><i class="fas fa-mobile-screen text-beatles-cyan mr-2"></i> Sesi Perangkat</span>
                        <button onclick="renderWaConnect(document.getElementById('dashboard-content'))" class="text-xs text-slate-400 hover:text-beatles-cyan"><i class="fas fa-rotate"></i></button>
                    </h4>
                    <div class="space-y-3" id="wa-session-list">
                        ${sessions.length ? sessions.map((s) => {
                            const badge = waStatusBadge(s.status);
                            return `
                            <div class="bg-slate-800/70 border border-slate-700 rounded-xl p-4 flex justify-between items-center hover:border-beatles-cyan/40 transition">
                                <div>
                                    <p class="text-white font-bold">${escapeHtml(s.sessionId)}</p>
                                    <p class="text-xs mt-1 flex items-center gap-2">
                                        <span class="status-dot ${badge.dot}"></span>
                                        <span class="text-slate-400">${escapeHtml(badge.label)}</span>
                                    </p>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="inspectSession('${escapeHtml(s.sessionId)}')" class="text-slate-400 hover:text-beatles-cyan bg-slate-900 p-2 rounded-lg transition" title="Lihat status"><i class="fas fa-eye"></i></button>
                                    <button onclick="disconnectSession('${escapeHtml(s.sessionId)}')" class="text-slate-400 hover:text-orange-400 bg-slate-900 p-2 rounded-lg transition" title="Putus sementara"><i class="fas fa-plug-circle-xmark"></i></button>
                                    <button onclick="logoutSession('${escapeHtml(s.sessionId)}')" class="text-slate-400 hover:text-red-500 bg-slate-900 p-2 rounded-lg transition" title="Logout & hapus kredensial"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>`;
                        }).join('') : `<p class="text-sm text-slate-500 text-center py-6">Belum ada sesi perangkat.</p>`}
                    </div>
                </div>
            </div>

            <div class="lg:col-span-3 glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-lg font-black text-white mb-5 flex items-center justify-between">
                    <span><i class="fas fa-satellite-dish text-beatles-cyan mr-2"></i> Panel Koneksi</span>
                    <span id="wa-panel-badge" class="text-xs px-3 py-1 rounded-full border bg-slate-500/15 text-slate-300 border-slate-500/30">Tidak ada sesi</span>
                </h4>
                <div id="wa-panel" class="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30 text-slate-500 p-8 min-h-[360px] text-center">
                    <i class="fas fa-qrcode text-5xl mb-4 opacity-30"></i>
                    <p class="text-sm">Tekan <strong class="text-white">Scan QR</strong> atau minta <strong class="text-white">Pairing Code</strong> untuk menautkan perangkat.</p>
                </div>
            </div>
        </div>`;

    if (activeWaSessionId) {
        refreshWaPanel(activeWaSessionId);
    }
}

async function refreshWaPanel(sessionId) {
    const panel = document.getElementById('wa-panel');
    const badge = document.getElementById('wa-panel-badge');
    if (!panel) return;

    try {
        const data = await api(`/whatsapp/status?sessionId=${encodeURIComponent(sessionId)}`);
        const badgeMeta = waStatusBadge(data.status);
        if (badge) {
            badge.className = `text-xs px-3 py-1 rounded-full border ${badgeMeta.cls}`;
            badge.innerText = `${sessionId}: ${badgeMeta.label}`;
        }

        updateGlobalWaPill(data);

        if (data.status === 'connected') {
            panel.innerHTML = `
                <div class="flex flex-col items-center">
                    <div class="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mb-4 animate-pulseGlow">
                        <i class="fab fa-whatsapp text-4xl text-emerald-400"></i>
                    </div>
                    <h5 class="text-xl font-bold text-white mb-1">Terhubung</h5>
                    <p class="text-sm text-slate-400 mb-1">Sesi: <span class="font-mono text-beatles-cyan">${escapeHtml(sessionId)}</span></p>
                    ${data.me && data.me.id ? `<p class="text-sm text-slate-400">Nomor: <span class="font-mono text-emerald-300">${escapeHtml(String(data.me.id).split(':')[0])}</span></p>` : ''}
                    <p class="text-xs text-emerald-300 mt-4"><i class="fas fa-circle-check mr-1"></i> Siap mengirim pesan.</p>
                </div>`;
            return;
        }

        if (data.status === 'qr' && data.qrImage) {
            panel.innerHTML = `
                <div class="flex flex-col items-center">
                    <p class="text-sm text-slate-300 mb-3">Pindai QR ini di WhatsApp &rarr; Perangkat Tertaut &rarr; Tautkan perangkat.</p>
                    <div class="bg-white p-3 rounded-2xl shadow-2xl glow-ring">
                        <img src="${data.qrImage}" alt="QR WhatsApp" class="w-64 h-64">
                    </div>
                    <p class="text-xs text-slate-500 mt-3"><i class="fas fa-rotate mr-1"></i> QR menyegarkan otomatis.</p>
                </div>`;
            return;
        }

        if (data.status === 'pairing_code' && data.pairingCode) {
            panel.innerHTML = `
                <div class="flex flex-col items-center">
                    <i class="fas fa-hashtag text-3xl text-beatles-cyan mb-3"></i>
                    <p class="text-sm text-slate-300 mb-2">Masukkan kode ini di WhatsApp &rarr; Perangkat Tertaut &rarr; Tautkan dengan nomor telepon.</p>
                    <div class="text-4xl md:text-5xl font-black tracking-[0.3em] text-beatles-cyan neon-text py-4 px-6 bg-slate-900 rounded-2xl border border-beatles-cyan/40">${escapeHtml(data.pairingCode)}</div>
                    <p class="text-xs text-slate-500 mt-3">Sesi: <span class="font-mono">${escapeHtml(sessionId)}</span></p>
                </div>`;
            return;
        }

        const badgeMeta2 = waStatusBadge(data.status);
        panel.innerHTML = `
            <div class="flex flex-col items-center">
                <span class="spinner mb-4" style="width:2rem;height:2rem"></span>
                <h5 class="text-lg font-bold text-white mb-1">${escapeHtml(badgeMeta2.label)}</h5>
                <p class="text-xs text-slate-500 mt-2">Sesi: <span class="font-mono">${escapeHtml(sessionId)}</span></p>
                ${data.error ? `<p class="text-xs text-red-300 mt-3 max-w-sm">${escapeHtml(data.error)}</p>` : ''}
            </div>`;
    } catch (error) {
        panel.innerHTML = `<p class="text-sm text-red-300">${escapeHtml(error.message)}</p>`;
    }
}

async function connectQr(button) {
    setBusy(button, true, 'Memulai...');
    try {
        const data = await api('/whatsapp/connect', { method: 'POST', body: JSON.stringify({ newSession: true }) });
        activeWaSessionId = data.sessionId;
        toast(`Sesi ${data.sessionId} dibuat. Menunggu QR...`, 'success');
        await renderWaConnect(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

async function requestPairing(button) {
    const phone = (document.getElementById('pairing-phone') || {}).value || '';

    if (!phone.trim()) {
        toast('Isi nomor telepon (kode negara, tanpa +) terlebih dahulu.', 'warn');
        return;
    }

    setBusy(button, true, 'Meminta kode...');
    try {
        const data = await api('/whatsapp/pairing-code', { method: 'POST', body: JSON.stringify({ phoneNumber: phone.trim() }) });
        activeWaSessionId = data.sessionId;
        toast('Pairing code dibuat. Masukkan di WhatsApp Anda.', 'success');
        await renderWaConnect(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

async function inspectSession(sessionId) {
    activeWaSessionId = sessionId;
    const data = await api(`/whatsapp/status?sessionId=${encodeURIComponent(sessionId)}`).catch((e) => ({ error: e.message }));
    const badge = waStatusBadge(data.status || 'disconnected');
    openModal(`
        <div class="p-6">
            <h4 class="text-xl font-bold text-white mb-4"><i class="fas fa-eye text-beatles-cyan mr-2"></i> Status Sesi ${escapeHtml(sessionId)}</h4>
            <ul class="space-y-2 text-sm">
                <li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Status</span><span class="px-2 py-0.5 rounded border ${badge.cls}">${escapeHtml(badge.label)}</span></li>
                <li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Mode</span><span class="text-white">${escapeHtml(data.mode || '-')}</span></li>
                <li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Reconnect attempts</span><span class="text-white">${escapeHtml(data.reconnectAttempts ?? 0)}</span></li>
                ${data.me && data.me.id ? `<li class="flex justify-between border-b border-slate-700/50 pb-2"><span class="text-slate-400">Nomor</span><span class="text-emerald-300 font-mono">${escapeHtml(String(data.me.id).split(':')[0])}</span></li>` : ''}
                ${data.error ? `<li class="pt-2 text-red-300 text-xs">${escapeHtml(data.error)}</li>` : ''}
            </ul>
            <div class="flex justify-end mt-6"><button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2 rounded-lg font-semibold">Tutup</button></div>
        </div>`);
}

async function disconnectSession(sessionId) {
    try {
        await api('/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({ sessionId }) });
        toast(`Sesi ${sessionId} diputus (kredensial disimpan).`, 'success');
        await renderWaConnect(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function logoutSession(sessionId) {
    if (!confirm(`Logout sesi ${sessionId} dan hapus kredensialnya? Perangkat akan perlu ditautkan ulang.`)) return;
    try {
        await api('/whatsapp/logout', { method: 'POST', body: JSON.stringify({ sessionId }) });
        if (activeWaSessionId === sessionId) activeWaSessionId = '';
        toast(`Sesi ${sessionId} di-logout.`, 'success');
        await renderWaConnect(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ------------------------------- Polling -------------------------------- */

function updateGlobalWaPill(data) {
    const dot = document.getElementById('wa-status-dot');
    const text = document.getElementById('wa-status-text');
    const pill = document.getElementById('wa-status-pill');
    if (!dot || !text || !pill) return;

    pill.classList.remove('hidden');
    pill.classList.add('flex');

    const meta = waStatusBadge(data.status);
    dot.className = `status-dot ${meta.dot}`;
    text.innerText = meta.label;
    text.className = `text-xs font-semibold ${data.status === 'connected' ? 'text-emerald-300' : 'text-slate-300'}`;
}

function startPolling() {
    stopPolling();

    const tick = async () => {
        try {
            const sessionsData = await api('/whatsapp/sessions');

            if (sessionsData.sessions && sessionsData.sessions.length) {
                const preferred = sessionsData.sessions.find((s) => s.sessionId === activeWaSessionId) || sessionsData.sessions[0];
                updateGlobalWaPill(preferred);

                if (currentPage === 'wa-connect') {
                    await refreshWaPanel(activeWaSessionId || preferred.sessionId);
                }
            } else {
                const dot = document.getElementById('wa-status-dot');
                const text = document.getElementById('wa-status-text');
                if (dot) dot.className = 'status-dot bg-slate-500';
                if (text) text.innerText = 'Belum terhubung';
            }
        } catch {
            // Diamkan bila sesi berakhir; api() sudah menangani 401.
        }
    };

    tick();
    waPollTimer = setInterval(tick, 4000);
}

function stopPolling() {
    if (waPollTimer) {
        clearInterval(waPollTimer);
        waPollTimer = null;
    }
}

/* --------------------------- Database Nomor ----------------------------- */

const CONTACT_STATUS_META = {
    registered: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Terdaftar' },
    not_registered: { cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', label: 'Tidak terdaftar' },
    likely_blocked: { cls: 'bg-red-500/15 text-red-300 border-red-500/30', label: 'Terindikasi blokir' },
    invalid_format: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', label: 'Format salah' },
    unknown: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', label: 'Belum diperiksa' }
};

function contactStatusBadge(status) {
    const meta = CONTACT_STATUS_META[status] || CONTACT_STATUS_META.unknown;
    return `<span class="text-[10px] px-2 py-1 rounded border ${meta.cls}">${escapeHtml(meta.label)}</span>`;
}

async function renderContacts(content, search = '') {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const data = await api(`/contacts${query}`);
    const contacts = data.contacts || [];

    content.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg mb-6">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h4 class="text-xl font-black text-white">Database Nomor Tujuan</h4>
                    <p class="text-sm text-slate-400">Kelola daftar nomor untuk pengiriman pesan. Total: <span class="text-beatles-cyan font-bold">${data.total ?? contacts.length}</span></p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button onclick="openContactForm()" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 px-4 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)]"><i class="fas fa-plus mr-1"></i> Tambah Nomor</button>
                    <button onclick="openImportModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg font-semibold transition-all"><i class="fas fa-file-import mr-1"></i> Impor Massal</button>
                    <button onclick="checkAllContacts(this)" class="bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 px-4 py-2.5 rounded-lg font-bold transition-all"><i class="fas fa-magnifying-glass-chart mr-1"></i> Cek Status Nomor</button>
                </div>
            </div>

            <div class="mt-5 relative">
                <i class="fas fa-search absolute left-3 top-3 text-slate-500"></i>
                <input id="contact-search" value="${escapeHtml(search)}" onkeydown="if(event.key==='Enter'){renderContacts(document.getElementById('dashboard-content'), this.value)}" placeholder="Cari nomor, nama, atau tag..." class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-beatles-cyan focus:outline-none">
            </div>
        </div>

        <div class="glass-panel rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-800/80 text-beatles-cyan text-xs uppercase tracking-wider">
                        <tr>
                            <th class="p-4">Nomor</th>
                            <th class="p-4">Nama</th>
                            <th class="p-4">Tag</th>
                            <th class="p-4">Status Nomor</th>
                            <th class="p-4 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-700/50">
                        ${contacts.length ? contacts.map((c) => `
                            <tr class="hover:bg-slate-800/40 transition-colors">
                                <td class="p-4 font-mono text-slate-200">${escapeHtml(c.phone)}</td>
                                <td class="p-4 text-slate-300">${escapeHtml(c.name || '-')}</td>
                                <td class="p-4">${c.tag ? `<span class="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">${escapeHtml(c.tag)}</span>` : '-'}</td>
                                <td class="p-4">${contactStatusBadge(c.status)}</td>
                                <td class="p-4">
                                    <div class="flex justify-center gap-2">
                                        <button onclick="checkContact('${escapeHtml(c.id)}', this)" class="text-slate-400 hover:text-beatles-emerald bg-slate-800 p-2 rounded-lg transition" title="Cek status"><i class="fas fa-shield-halved"></i></button>
                                        <button onclick='openContactForm(${JSON.stringify(c)})' class="text-slate-400 hover:text-beatles-cyan bg-slate-800 p-2 rounded-lg transition" title="Edit"><i class="fas fa-pen"></i></button>
                                        <button onclick="deleteContact('${escapeHtml(c.id)}')" class="text-slate-400 hover:text-red-500 bg-slate-800 p-2 rounded-lg transition" title="Hapus"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>`).join('') : `<tr><td colspan="5" class="p-8 text-center text-slate-500">Belum ada nomor. Tambahkan manual atau impor massal.</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function openContactForm(contact) {
    const editing = Boolean(contact && contact.id);
    openModal(`
        <div class="p-6">
            <h4 class="text-xl font-bold text-white mb-5"><i class="fas fa-address-book text-beatles-cyan mr-2"></i> ${editing ? 'Edit' : 'Tambah'} Nomor</h4>
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nomor WhatsApp</label>
                    <input id="contact-phone" type="tel" value="${editing ? escapeHtml(contact.phone) : ''}" placeholder="6281234567890" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nama (opsional)</label>
                    <input id="contact-name" type="text" value="${editing ? escapeHtml(contact.name || '') : ''}" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Tag (opsional)</label>
                    <input id="contact-tag" type="text" value="${editing ? escapeHtml(contact.tag || '') : ''}" placeholder="promo, vip, ..." class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6">
                <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-lg font-semibold">Batal</button>
                <button id="contact-save" onclick="saveContact(${editing ? `'${escapeHtml(contact.id)}'` : 'null'}, this)" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 px-5 py-2.5 rounded-lg font-bold">${editing ? 'Simpan' : 'Tambah'}</button>
            </div>
        </div>`);
}

async function saveContact(id, button) {
    const phone = document.getElementById('contact-phone').value.trim();
    const name = document.getElementById('contact-name').value.trim();
    const tag = document.getElementById('contact-tag').value.trim();

    setBusy(button, true, 'Menyimpan...');

    try {
        if (id) {
            await api(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ phone, name, tag }) });
            toast('Kontak diperbarui.', 'success');
        } else {
            await api('/contacts', { method: 'POST', body: JSON.stringify({ phone, name, tag }) });
            toast('Kontak ditambahkan.', 'success');
        }
        closeModal();
        await renderContacts(document.getElementById('dashboard-content'), document.getElementById('contact-search')?.value || '');
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

async function deleteContact(id) {
    if (!confirm('Hapus nomor ini dari database?')) return;
    try {
        await api(`/contacts/${id}`, { method: 'DELETE' });
        toast('Kontak dihapus.', 'success');
        await renderContacts(document.getElementById('dashboard-content'), document.getElementById('contact-search')?.value || '');
    } catch (error) {
        toast(error.message, 'error');
    }
}

function openImportModal() {
    openModal(`
        <div class="p-6">
            <h4 class="text-xl font-bold text-white mb-2"><i class="fas fa-file-import text-beatles-cyan mr-2"></i> Impor Nomor Massal</h4>
            <p class="text-sm text-slate-400 mb-4">Tempel nomor, satu per baris (atau pisahkan dengan koma/titik koma).</p>
            <textarea id="import-numbers" rows="8" placeholder="628111111111&#10;628222222222" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-3 px-4 text-white font-mono text-sm focus:border-beatles-cyan focus:outline-none"></textarea>
            <input id="import-tag" type="text" placeholder="Tag untuk semua nomor ini (opsional)" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white mt-3 focus:border-beatles-cyan focus:outline-none">
            <div class="flex justify-end gap-3 mt-6">
                <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-lg font-semibold">Batal</button>
                <button id="import-save" onclick="submitImport(this)" class="bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 px-5 py-2.5 rounded-lg font-bold">Impor</button>
            </div>
        </div>`);
}

async function submitImport(button) {
    const numbers = document.getElementById('import-numbers').value;
    const tag = document.getElementById('import-tag').value.trim();

    if (!numbers.trim()) {
        toast('Tempel minimal satu nomor.', 'warn');
        return;
    }

    setBusy(button, true, 'Mengimpor...');

    try {
        const data = await api('/contacts/import', { method: 'POST', body: JSON.stringify({ numbers, tag }) });
        toast(`Impor selesai: ${data.added} ditambah, ${data.skipped} dilewati, ${data.invalid} tidak valid.`, 'success');
        closeModal();
        await renderContacts(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

async function checkContact(id, button) {
    setBusy(button, true, '');
    try {
        const data = await api('/contacts/check', { method: 'POST', body: JSON.stringify({ phones: [document.querySelector(`#contact-row-${id}`)?.dataset.phone || ''] }) });
        const result = (data.results || [])[0];
        if (result) toast(`${result.phone}: ${result.reason || result.status}`, result.valid ? 'success' : 'warn');
        await renderContacts(document.getElementById('dashboard-content'), document.getElementById('contact-search')?.value || '');
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

async function checkAllContacts(button) {
    setBusy(button, true, 'Memeriksa...');

    try {
        const data = await api('/contacts');
        const phones = (data.contacts || []).map((c) => c.phone).slice(0, 50);

        if (!phones.length) {
            toast('Belum ada nomor untuk diperiksa.', 'warn');
            return;
        }

        const result = await api('/contacts/check', { method: 'POST', body: JSON.stringify({ phones }) });
        const results = result.results || [];
        const ok = results.filter((r) => r.valid).length;
        toast(`Pemeriksaan selesai: ${ok} terdaftar dari ${results.length} nomor.`, 'success');
        await renderContacts(document.getElementById('dashboard-content'), document.getElementById('contact-search')?.value || '');
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

/* ----------------------------- Template Pesan --------------------------- */

async function renderTemplates(content) {
    const data = await api('/templates');
    const templates = data.templates || [];
    const canEdit = ['admin', 'bos'].includes(String(currentUser?.role || '').toLowerCase());

    content.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h4 class="text-xl font-black text-white">Template Pesan</h4>
                <p class="text-sm text-slate-400">Simpan pesan siap pakai agar tidak perlu mengetik ulang. Total: <span class="text-beatles-cyan font-bold">${templates.length}</span></p>
            </div>
            ${canEdit ? `<button onclick="openTemplateForm()" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 px-4 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)]"><i class="fas fa-plus mr-1"></i> Template Baru</button>` : ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            ${templates.length ? templates.map((t) => `
                <div class="glass-panel p-5 rounded-2xl border border-slate-700 shadow-lg hover:border-beatles-cyan/40 transition flex flex-col">
                    <div class="flex items-start justify-between mb-3">
                        <h5 class="text-white font-bold text-lg">${escapeHtml(t.name)}</h5>
                        ${t.active === false ? '<span class="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-400">nonaktif</span>' : '<span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">aktif</span>'}
                    </div>
                    <p class="text-sm text-slate-300 whitespace-pre-wrap flex-1 mb-4">${escapeHtml(t.content)}</p>
                    <div class="flex justify-between items-center border-t border-slate-700/50 pt-3">
                        <span class="text-[10px] text-slate-500">${escapeHtml(new Date(t.createdAt || Date.now()).toLocaleDateString('id-ID'))}</span>
                        <div class="flex gap-2">
                            <button onclick='useTemplate(${JSON.stringify(t.content)})' class="text-slate-400 hover:text-beatles-emerald bg-slate-800 p-2 rounded-lg transition" title="Gunakan untuk kirim"><i class="fas fa-paper-plane"></i></button>
                            ${canEdit ? `<button onclick='openTemplateForm(${JSON.stringify(t)})' class="text-slate-400 hover:text-beatles-cyan bg-slate-800 p-2 rounded-lg transition" title="Edit"><i class="fas fa-pen"></i></button>
                            <button onclick="deleteTemplate('${escapeHtml(t.id)}')" class="text-slate-400 hover:text-red-500 bg-slate-800 p-2 rounded-lg transition" title="Hapus"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    </div>
                </div>`).join('') : `<div class="md:col-span-2 xl:col-span-3 glass-panel p-10 rounded-2xl border border-slate-700 text-center text-slate-500"><i class="fas fa-file-lines text-4xl mb-3 opacity-30"></i><p>Belum ada template pesan.</p></div>`}
        </div>`;
}

function openTemplateForm(template) {
    const editing = Boolean(template && template.id);
    openModal(`
        <div class="p-6">
            <h4 class="text-xl font-bold text-white mb-5"><i class="fas fa-file-lines text-beatles-cyan mr-2"></i> ${editing ? 'Edit' : 'Template Baru'}</h4>
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nama Template</label>
                    <input id="template-name" type="text" value="${editing ? escapeHtml(template.name) : ''}" placeholder="Promo Ramadhan" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Isi Pesan</label>
                    <textarea id="template-content" rows="7" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-3 px-4 text-white focus:border-beatles-cyan focus:outline-none">${editing ? escapeHtml(template.content) : ''}</textarea>
                </div>
                ${editing ? `<label class="flex items-center gap-2 text-sm text-slate-300"><input id="template-active" type="checkbox" ${template.active !== false ? 'checked' : ''} class="accent-cyan-400"> Aktif</label>` : ''}
            </div>
            <div class="flex justify-end gap-3 mt-6">
                <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-lg font-semibold">Batal</button>
                <button id="template-save" onclick="saveTemplate(${editing ? `'${escapeHtml(template.id)}'` : 'null'}, this)" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 px-5 py-2.5 rounded-lg font-bold">${editing ? 'Simpan' : 'Buat'}</button>
            </div>
        </div>`);
}

async function saveTemplate(id, button) {
    const name = document.getElementById('template-name').value.trim();
    const contentValue = document.getElementById('template-content').value.trim();
    const activeEl = document.getElementById('template-active');

    if (!name || !contentValue) {
        toast('Nama dan isi template wajib diisi.', 'warn');
        return;
    }

    const payload = { name, content: contentValue };
    if (activeEl) payload.active = activeEl.checked;

    setBusy(button, true, 'Menyimpan...');

    try {
        if (id) {
            await api(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
            toast('Template diperbarui.', 'success');
        } else {
            await api('/templates', { method: 'POST', body: JSON.stringify(payload) });
            toast('Template dibuat.', 'success');
        }
        closeModal();
        await renderTemplates(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

async function deleteTemplate(id) {
    if (!confirm('Hapus template ini?')) return;
    try {
        await api(`/templates/${id}`, { method: 'DELETE' });
        toast('Template dihapus.', 'success');
        await renderTemplates(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    }
}

function useTemplate(content) {
    sessionStorage.setItem('beatles_pending_message', content);
    loadContent('kirim');
    toast('Template dimuat ke halaman Kirim Pesan.', 'info');
}

/* ------------------------------ Kirim Pesan ----------------------------- */

async function renderSendMessage(content) {
    const sessionsData = await api('/whatsapp/sessions').catch(() => ({ sessions: [] }));
    const sessions = sessionsData.sessions || [];
    const connected = sessions.filter((s) => s.status === 'connected');
    const templates = (await api('/templates').catch(() => ({ templates: [] }))).templates || [];

    const pending = sessionStorage.getItem('beatles_pending_message') || '';
    sessionStorage.removeItem('beatles_pending_message');

    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-xl font-black text-white mb-5"><i class="fas fa-paper-plane text-beatles-cyan mr-2"></i> Kirim Pesan Tunggal</h4>

                ${connected.length ? '' : `<div class="mb-4 bg-yellow-500/10 border-l-4 border-yellow-500 p-3 rounded-r-lg text-yellow-200 text-sm"><i class="fas fa-triangle-exclamation mr-1"></i> Belum ada sesi WhatsApp yang terhubung. Buka menu <strong>WhatsApp Gateway</strong> untuk menautkan perangkat.</div>`}

                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Sesi Pengirim</label>
                        <select id="send-session" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                            ${sessions.length ? sessions.map((s) => `<option value="${escapeHtml(s.sessionId)}" ${s.status === 'connected' ? '' : 'disabled'}>${escapeHtml(s.sessionId)} — ${escapeHtml(s.status)}</option>`).join('') : '<option value="">Tidak ada sesi</option>'}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nomor Tujuan</label>
                        <input id="send-phone" type="tel" placeholder="6281234567890" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-semibold text-beatles-cyan uppercase tracking-wider">Isi Pesan</label>
                            ${templates.length ? `<select onchange="if(this.value){document.getElementById('send-message').value=this.value; this.selectedIndex=0;}" class="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300"><option value="">Pilih template...</option>${templates.map((t) => `<option value="${escapeHtml(t.content)}">${escapeHtml(t.name)}</option>`).join('')}</select>` : ''}
                        </div>
                        <textarea id="send-message" rows="6" placeholder="Tulis pesan Anda..." class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-3 px-4 text-white focus:border-beatles-cyan focus:outline-none">${escapeHtml(pending)}</textarea>
                    </div>
                    <button id="send-btn" onclick="sendSingle(this)" class="w-full bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 font-black py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"><i class="fas fa-paper-plane mr-2"></i> Kirim Sekarang</button>
                </div>
            </div>

            <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-lg font-bold text-white mb-4"><i class="fas fa-circle-info text-beatles-cyan mr-2"></i> Status Pengiriman</h4>
                <div id="send-result" class="text-sm text-slate-500 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30 p-6 text-center min-h-[200px] flex items-center justify-center">
                    Hasil pengiriman akan muncul di sini.
                </div>
            </div>
        </div>`;
}

function sendStatusBadge(result) {
    const map = {
        sent: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: 'fa-circle-check', label: 'Terkirim' },
        not_registered: { cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', icon: 'fa-triangle-exclamation', label: 'Nomor tidak terdaftar' },
        likely_blocked: { cls: 'bg-red-500/15 text-red-300 border-red-500/30', icon: 'fa-ban', label: 'Terindikasi blokir/dibatasi' },
        rate_limited: { cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30', icon: 'fa-gauge-high', label: 'Rate limit' },
        invalid_format: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', icon: 'fa-circle-exclamation', label: 'Format nomor salah' },
        failed: { cls: 'bg-red-500/15 text-red-300 border-red-500/30', icon: 'fa-circle-xmark', label: 'Gagal' }
    };

    const meta = map[result.status] || map.failed;

    return `
        <div class="flex flex-col items-center text-center">
            <i class="fas ${meta.icon} text-3xl mb-3"></i>
            <span class="text-[11px] px-3 py-1 rounded-full border ${meta.cls} mb-3">${escapeHtml(meta.label)}</span>
            <p class="text-xs text-slate-400 max-w-xs">${escapeHtml(result.detail || result.reason || '')}</p>
            ${result.messageId ? `<p class="text-[10px] text-slate-500 mt-2 font-mono break-all">ID: ${escapeHtml(result.messageId)}</p>` : ''}
        </div>`;
}

async function sendSingle(button) {
    const sessionId = document.getElementById('send-session').value;
    const phone = document.getElementById('send-phone').value.trim();
    const message = document.getElementById('send-message').value.trim();
    const box = document.getElementById('send-result');

    if (!sessionId) {
        toast('Tidak ada sesi WhatsApp yang bisa dipakai.', 'warn');
        return;
    }
    if (!phone || !message) {
        toast('Nomor tujuan dan isi pesan wajib diisi.', 'warn');
        return;
    }

    setBusy(button, true, 'Mengirim...');
    box.innerHTML = '<span class="spinner"></span>';

    try {
        const data = await api('/send-message', { method: 'POST', body: JSON.stringify({ sessionId, phone, message }) });
        box.innerHTML = sendStatusBadge(data);
        if (data.ok) {
            toast('Pesan terkirim.', 'success');
        } else {
            toast(`Pengiriman gagal: ${data.detail || data.reason}`, 'error');
        }
    } catch (error) {
        box.innerHTML = `<p class="text-red-300 text-sm">${escapeHtml(error.message)}</p>`;
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

/* ---------------------------- Kendali Massal ---------------------------- */

let broadcastPollTimer = null;

async function renderBroadcast(content) {
    const sessionsData = await api('/whatsapp/sessions').catch(() => ({ sessions: [] }));
    const sessions = sessionsData.sessions || [];
    const contacts = (await api('/contacts').catch(() => ({ contacts: [] }))).contacts || [];
    const tags = Array.from(new Set(contacts.map((c) => c.tag).filter(Boolean)));
    const templates = (await api('/templates').catch(() => ({ templates: [] }))).templates || [];

    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div class="lg:col-span-3 glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-xl font-black text-white mb-5"><i class="fas fa-tower-broadcast text-beatles-cyan mr-2"></i> Kendali Massal</h4>
                <div class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Sesi Pengirim</label>
                            <select id="bc-session" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                                ${sessions.length ? sessions.map((s) => `<option value="${escapeHtml(s.sessionId)}" ${s.status === 'connected' ? '' : 'disabled'}>${escapeHtml(s.sessionId)} — ${escapeHtml(s.status)}</option>`).join('') : '<option value="">Tidak ada sesi</option>'}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Sumber Target</label>
                            <select id="bc-source" onchange="onBroadcastSourceChange()" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                                <option value="all">Semua Kontak (${contacts.length})</option>
                                <option value="tag">Berdasarkan Tag</option>
                                <option value="manual">Nomor Manual</option>
                            </select>
                        </div>
                    </div>
                    <div id="bc-tag-wrap" class="hidden">
                        <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Pilih Tag</label>
                        <select id="bc-tag" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                            ${tags.length ? tags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('') : '<option value="">(tidak ada tag)</option>'}
                        </select>
                    </div>
                    <div id="bc-manual-wrap" class="hidden">
                        <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nomor Manual</label>
                        <textarea id="bc-manual" rows="4" placeholder="628111111111, 628222222222" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-3 px-4 text-white font-mono text-sm focus:border-beatles-cyan focus:outline-none"></textarea>
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-semibold text-beatles-cyan uppercase tracking-wider">Isi Pesan</label>
                            ${templates.length ? `<select onchange="if(this.value){document.getElementById('bc-message').value=this.value; this.selectedIndex=0;}" class="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300"><option value="">Pilih template...</option>${templates.map((t) => `<option value="${escapeHtml(t.content)}">${escapeHtml(t.name)}</option>`).join('')}</select>` : ''}
                        </div>
                        <textarea id="bc-message" rows="5" placeholder="Tulis pesan broadcast..." class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-3 px-4 text-white focus:border-beatles-cyan focus:outline-none"></textarea>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-beatles-cyan mb-2 uppercase tracking-wider">Kecepatan (jeda antar pesan)</label>
                        <div class="grid grid-cols-3 gap-3">
                            <label class="cursor-pointer"><input type="radio" name="bc-speed" value="safe" class="peer sr-only" checked><div class="text-center py-2.5 px-3 border border-slate-700 rounded-lg text-slate-400 peer-checked:bg-emerald-500/20 peer-checked:border-emerald-500 peer-checked:text-emerald-300 transition-all"><div class="font-bold">30s</div><div class="text-[10px]">Aman</div></div></label>
                            <label class="cursor-pointer"><input type="radio" name="bc-speed" value="standard" class="peer sr-only"><div class="text-center py-2.5 px-3 border border-slate-700 rounded-lg text-slate-400 peer-checked:bg-yellow-500/20 peer-checked:border-yellow-500 peer-checked:text-yellow-300 transition-all"><div class="font-bold">5s</div><div class="text-[10px]">Standar</div></div></label>
                            <label class="cursor-pointer"><input type="radio" name="bc-speed" value="brutal" class="peer sr-only"><div class="text-center py-2.5 px-3 border border-slate-700 rounded-lg text-slate-400 peer-checked:bg-red-500/20 peer-checked:border-red-500 peer-checked:text-red-300 transition-all"><div class="font-bold">1s</div><div class="text-[10px]">Brutal (Berisiko)</div></div></label>
                        </div>
                    </div>
                    <button id="bc-btn" onclick="startBroadcast(this)" class="w-full bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] text-lg"><i class="fas fa-rocket mr-2"></i> EKSEKUSI SEKARANG</button>
                </div>
            </div>
            <div class="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg flex flex-col">
                <h4 class="text-lg font-black text-white mb-5"><i class="fas fa-satellite-dish text-beatles-cyan mr-2"></i> Status Eksekusi</h4>
                <div id="bc-status" class="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30 text-slate-500 p-6 text-center">
                    <i class="fas fa-rocket text-4xl mb-3 opacity-30"></i>
                    <p class="text-sm">Mesin bersiaga.<br>Pilih target dan tekan tombol eksekusi.</p>
                </div>
            </div>
        </div>`;
}

function onBroadcastSourceChange() {
    const source = document.getElementById('bc-source').value;
    document.getElementById('bc-tag-wrap').classList.toggle('hidden', source !== 'tag');
    document.getElementById('bc-manual-wrap').classList.toggle('hidden', source !== 'manual');
}

async function startBroadcast(button) {
    const sessionId = document.getElementById('bc-session').value;
    const source = document.getElementById('bc-source').value;
    const message = document.getElementById('bc-message').value.trim();
    const speedEl = document.querySelector('input[name="bc-speed"]:checked');
    const speed = speedEl ? speedEl.value : 'safe';

    if (!sessionId) {
        toast('Tidak ada sesi WhatsApp yang bisa dipakai.', 'warn');
        return;
    }
    if (!message) {
        toast('Isi pesan broadcast wajib diisi.', 'warn');
        return;
    }

    const payload = { sessionId, message, speed };

    if (source === 'tag') {
        payload.tag = document.getElementById('bc-tag').value;
        if (!payload.tag) {
            toast('Tidak ada tag yang dipilih.', 'warn');
            return;
        }
    }

    if (source === 'manual') {
        payload.phones = document.getElementById('bc-manual').value.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
        if (!payload.phones.length) {
            toast('Masukkan minimal satu nomor manual.', 'warn');
            return;
        }
    }

    setBusy(button, true, 'Menjalankan...');

    try {
        const data = await api('/broadcast', { method: 'POST', body: JSON.stringify(payload) });
        toast(`Broadcast dimulai untuk ${data.total} nomor.`, 'success');
        pollBroadcast(data.broadcastId);
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

function pollBroadcast(broadcastId) {
    if (broadcastPollTimer) clearInterval(broadcastPollTimer);

    const render = async () => {
        const box = document.getElementById('bc-status');
        if (!box) {
            clearInterval(broadcastPollTimer);
            return;
        }

        try {
            const data = await api(`/broadcast/${broadcastId}`);
            const b = data.broadcast;
            const pct = b.total ? Math.round(((b.current || 0) / b.total) * 100) : 0;
            const done = ['completed', 'cancelled', 'failed'].includes(b.status);

            box.innerHTML = `
                <div class="w-full">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-white font-bold">${escapeHtml(b.status.toUpperCase())}</span>
                        <span class="text-slate-400">${b.current || 0}/${b.total}</span>
                    </div>
                    <div class="w-full bg-slate-700 rounded-full h-3 mb-4 overflow-hidden">
                        <div class="h-3 rounded-full ${b.status === 'completed' ? 'bg-emerald-500' : b.status === 'failed' ? 'bg-red-500' : 'bg-beatles-cyan'} transition-all" style="width:${pct}%"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 text-center">
                        <div class="bg-slate-800/70 rounded-lg p-3"><p class="text-2xl font-black text-emerald-400">${b.sent}</p><p class="text-[10px] text-slate-400 uppercase">Terkirim</p></div>
                        <div class="bg-slate-800/70 rounded-lg p-3"><p class="text-2xl font-black text-red-400">${b.failed}</p><p class="text-[10px] text-slate-400 uppercase">Gagal</p></div>
                    </div>
                    ${b.lastError ? `<p class="text-[10px] text-yellow-300 mt-3">Terakhir: ${escapeHtml(b.lastError)}</p>` : ''}
                    ${done ? '' : `<button onclick="cancelBroadcast('${escapeHtml(broadcastId)}')" class="mt-4 w-full bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 py-2 rounded-lg font-semibold"><i class="fas fa-stop mr-1"></i> Batalkan</button>`}
                </div>`;

            if (done) {
                clearInterval(broadcastPollTimer);
                broadcastPollTimer = null;
                if (b.status === 'completed') toast('Broadcast selesai.', 'success');
            }
        } catch (error) {
            clearInterval(broadcastPollTimer);
            box.innerHTML = `<p class="text-red-300 text-sm">${escapeHtml(error.message)}</p>`;
        }
    };

    render();
    broadcastPollTimer = setInterval(render, 2500);
}

async function cancelBroadcast(broadcastId) {
    try {
        await api(`/broadcast/${broadcastId}/cancel`, { method: 'POST' });
        toast('Permintaan pembatalan dikirim.', 'info');
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* --------------------------- Manajemen User ----------------------------- */

async function renderUsers(content) {
    const data = await api('/users');
    const users = data.users || [];

    content.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
            <h4 class="text-xl font-black text-white mb-5"><i class="fas fa-user-cog text-beatles-cyan mr-2"></i> Manajemen User</h4>
            <div class="overflow-x-auto rounded-xl border border-slate-700">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-800/80 text-beatles-cyan text-xs uppercase tracking-wider">
                        <tr><th class="p-4">Nama</th><th class="p-4">Username</th><th class="p-4">Role</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-700/50">
                        ${users.map((u) => `
                            <tr class="hover:bg-slate-800/40 transition-colors">
                                <td class="p-4 text-white font-semibold">${escapeHtml(u.name || '-')}</td>
                                <td class="p-4 font-mono text-slate-300">${escapeHtml(u.username)}</td>
                                <td class="p-4"><span class="text-[10px] px-2 py-1 rounded border bg-slate-700 text-slate-200 border-slate-600 uppercase">${escapeHtml(u.role)}</span></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

/* -------------------------- Persetujuan Withdraw ------------------------ */

async function renderWithdrawals(content) {
    const data = await api('/withdrawals');
    const items = data.withdrawals || [];

    const statusMeta = {
        PENDING: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
        APPROVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
        PAID: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    };

    content.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
            <h4 class="text-xl font-black text-white mb-5"><i class="fas fa-check-circle text-beatles-cyan mr-2"></i> Persetujuan Withdraw</h4>
            <div class="overflow-x-auto rounded-xl border border-slate-700">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-800/80 text-beatles-cyan text-xs uppercase tracking-wider">
                        <tr><th class="p-4">User</th><th class="p-4">Nominal</th><th class="p-4">Metode</th><th class="p-4">Status</th><th class="p-4 text-center">Aksi</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-700/50">
                        ${items.length ? items.map((w) => `
                            <tr class="hover:bg-slate-800/40 transition-colors">
                                <td class="p-4 text-white">${escapeHtml(w.username)}</td>
                                <td class="p-4 font-mono text-yellow-400">Rp ${escapeHtml(w.amount)}</td>
                                <td class="p-4 text-slate-300">${escapeHtml(w.method)}<br><span class="text-[10px] text-slate-500">${escapeHtml(w.destination)}</span></td>
                                <td class="p-4"><span class="text-[10px] px-2 py-1 rounded border ${statusMeta[w.status] || statusMeta.PENDING}">${escapeHtml(w.status)}</span></td>
                                <td class="p-4">
                                    <div class="flex justify-center gap-2">
                                        <button onclick="updateWithdrawal('${escapeHtml(w.id)}','APPROVED')" class="text-slate-400 hover:text-beatles-emerald bg-slate-800 p-2 rounded-lg transition" title="Setujui"><i class="fas fa-check"></i></button>
                                        <button onclick="updateWithdrawal('${escapeHtml(w.id)}','REJECTED')" class="text-slate-400 hover:text-red-500 bg-slate-800 p-2 rounded-lg transition" title="Tolak"><i class="fas fa-xmark"></i></button>
                                    </div>
                                </td>
                            </tr>`).join('') : `<tr><td colspan="5" class="p-8 text-center text-slate-500">Belum ada permintaan withdraw.</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>`;
}

async function updateWithdrawal(id, status) {
    try {
        await api(`/withdrawals/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        toast(`Status diubah menjadi ${status}.`, 'success');
        await renderWithdrawals(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ----------------------------- Pengaturan ------------------------------- */

async function renderSettings(content) {
    const data = await api('/settings/tariff');

    content.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg max-w-lg">
            <h4 class="text-xl font-black text-white mb-5"><i class="fas fa-sliders text-beatles-cyan mr-2"></i> Pengaturan Tarif</h4>
            <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Tarif per Pesan (Rp)</label>
            <input id="tariff-input" type="number" min="0" value="${escapeHtml(data.tariff)}" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white mb-4 focus:border-beatles-cyan focus:outline-none">
            <button id="tariff-save" onclick="saveTariff(this)" class="bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 px-5 py-2.5 rounded-lg font-bold transition-all">Simpan Tarif</button>
        </div>`;
}

async function saveTariff(button) {
    const tariff = Number(document.getElementById('tariff-input').value);
    setBusy(button, true, 'Menyimpan...');
    try {
        await api('/settings/tariff', { method: 'PUT', body: JSON.stringify({ tariff }) });
        toast('Tarif diperbarui.', 'success');
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

/* ------------------------------ Tarik Saldo ----------------------------- */

async function renderWithdraw(content) {
    const data = await api('/withdrawals');
    const items = (data.withdrawals || []).filter((w) => w.username === currentUser?.username);

    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-xl font-black text-white mb-5"><i class="fas fa-wallet text-beatles-cyan mr-2"></i> Ajukan Penarikan</h4>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nominal (Rp)</label>
                        <input id="wd-amount" type="number" min="1000" placeholder="50000" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Metode</label>
                        <input id="wd-method" type="text" placeholder="DANA / OVO / Bank" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase tracking-wider">Nomor / Rekening Tujuan</label>
                        <input id="wd-destination" type="text" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none">
                    </div>
                    <button id="wd-btn" onclick="submitWithdraw(this)" class="w-full bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 font-bold py-3 rounded-lg transition-all"><i class="fas fa-money-bill-transfer mr-1"></i> Ajukan</button>
                    <p class="text-[10px] text-slate-500">Catatan: ini modul demo. Tidak ada uang yang benar-benar dipindahkan.</p>
                </div>
            </div>
            <div class="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-700 shadow-lg">
                <h4 class="text-lg font-bold text-white mb-4"><i class="fas fa-clock-rotate-left text-beatles-cyan mr-2"></i> Riwayat Penarikan</h4>
                <div class="overflow-x-auto rounded-xl border border-slate-700">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-800/80 text-beatles-cyan text-xs uppercase tracking-wider"><tr><th class="p-3">Nominal</th><th class="p-3">Metode</th><th class="p-3">Status</th></tr></thead>
                        <tbody class="divide-y divide-slate-700/50">
                            ${items.length ? items.map((w) => `<tr><td class="p-3 font-mono text-yellow-400">Rp ${escapeHtml(w.amount)}</td><td class="p-3 text-slate-300">${escapeHtml(w.method)}</td><td class="p-3 text-slate-300">${escapeHtml(w.status)}</td></tr>`).join('') : `<tr><td colspan="3" class="p-6 text-center text-slate-500">Belum ada penarikan.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

async function submitWithdraw(button) {
    const amount = Number(document.getElementById('wd-amount').value);
    const method = document.getElementById('wd-method').value.trim();
    const destination = document.getElementById('wd-destination').value.trim();

    if (!amount || !method || !destination) {
        toast('Lengkapi nominal, metode, dan tujuan.', 'warn');
        return;
    }

    setBusy(button, true, 'Mengirim...');
    try {
        await api('/withdrawals', { method: 'POST', body: JSON.stringify({ amount, method, destination }) });
        toast('Permintaan penarikan dicatat.', 'success');
        await renderWithdraw(document.getElementById('dashboard-content'));
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        setBusy(button, false);
    }
}

/* ------------------------------ Bootstrap ------------------------------- */

async function restoreSession() {
    if (!authToken) return;

    try {
        const data = await api('/auth/me');
        enterDashboard(data.user);
    } catch {
        authToken = '';
        localStorage.removeItem('beatles_token');
        localStorage.removeItem('beatles_user');
    }
}

document.getElementById('login-password')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitLogin();
});

restoreSession();

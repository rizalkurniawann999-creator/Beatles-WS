// Global State & Translations
let currentLang = localStorage.getItem('beatles_lang') || 'id';

const translations = {
    id: {
        subtitle: "Global Platform Solutions",
        desc: "Kelola automasi dan pesan WhatsApp Anda dengan mudah, aman, dan profesional.",
        enterBtn: "Masuk ke Dashboard",
        loginTitle: "Selamat Datang!",
        loginSub: "Sistem Terenkripsi & Aman",
        lblUser: "Username",
        lblPass: "Kata Sandi",
        loginAction: "Masuk Sekarang",
        noAcc: "Belum punya akun?",
        regLink: "Daftar di sini",
        regTitle: "Buat Akun Baru",
        regSub: "Bergabung dengan ekosistem Beatles-WS",
        lblName: "Nama Lengkap",
        regAction: "Daftar & Lanjut Login",
        hasAcc: "Sudah punya akun?",
        loginLink: "Masuk",
        logout: "Keluar",
        dashboard: "Dashboard",
        whatsapp: "Gateway WhatsApp",
        devices: "Manajemen Perangkat",
        stokDb: "Stok DB",
        users: "Manajemen Pengguna",
        settings: "Pengaturan Sistem"
    },
    en: {
        subtitle: "Global Platform Solutions",
        desc: "Manage your WhatsApp automation and messaging easily, securely, and professionally.",
        enterBtn: "Enter Dashboard",
        loginTitle: "Welcome Back!",
        loginSub: "Encrypted & Secure System",
        lblUser: "Username",
        lblPass: "Password",
        loginAction: "Sign In Now",
        noAcc: "Don't have an account?",
        regLink: "Register here",
        regTitle: "Create New Account",
        regSub: "Join the Beatles-WS ecosystem",
        lblName: "Full Name",
        regAction: "Register & Sign In",
        hasAcc: "Already have an account?",
        loginLink: "Sign In",
        logout: "Logout",
        dashboard: "Dashboard",
        whatsapp: "WhatsApp Gateway",
        devices: "Device Management",
        stokDb: "Stok DB",
        users: "User Management",
        settings: "System Settings"
    }
};

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('beatles_lang', lang);
    applyTranslations();
}

function applyTranslations() {
    const t = translations[currentLang];
    if (!t) return;
    
    setIfExists('t-subtitle', t.subtitle);
    setIfExists('t-desc', t.desc);
    setIfExists('t-enter-btn', t.enterBtn);
    setIfExists('t-login-title', t.loginTitle);
    setIfExists('t-login-sub', t.loginSub);
    setIfExists('t-lbl-user', t.lblUser);
    setIfExists('t-lbl-pass', t.lblPass);
    setIfExists('t-login-action', t.loginAction);
    setIfExists('t-no-acc', t.noAcc);
    setIfExists('t-reg-link', t.regLink);
    setIfExists('t-reg-title', t.regTitle);
    setIfExists('t-reg-sub', t.regSub);
    setIfExists('t-lbl-name', t.lblName);
    setIfExists('t-lbl-reg-user', t.lblUser);
    setIfExists('t-lbl-reg-pass', t.lblPass);
    setIfExists('t-reg-action', t.regAction);
    setIfExists('t-has-acc', t.hasAcc);
    setIfExists('t-login-link', t.loginLink);
    setIfExists('t-logout', t.logout);

    const sel = document.getElementById('lang-selector');
    if (sel) sel.value = currentLang;
}

function setIfExists(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

let currentUser = JSON.parse(localStorage.getItem('beatles_user') || 'null');
let pairingAttempts = parseInt(localStorage.getItem('beatles_pairing_attempts') || '0');
let messageTemplates = JSON.parse(localStorage.getItem('beatles_templates') || '[]');
let dbNumbers = [];

window.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
    if (currentUser) {
        showDashboard();
    } else {
        showConsole();
    }
});

function showToast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    const bgColors = {
        success: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
        error: 'bg-red-500/20 border-red-500/40 text-red-300',
        info: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
    };
    toast.className = `toast border px-4 py-3 rounded-xl shadow-lg backdrop-blur-md flex items-center space-x-3 text-sm ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `<i class="fas fa-info-circle"></i><span>${message}</span>`;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function showAuth() {
    document.getElementById('view-console').classList.add('hidden');
    document.getElementById('view-auth').classList.remove('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
    toggleAuth('login');
}

function showConsole() {
    document.getElementById('view-console').classList.remove('hidden');
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
}

function toggleAuth(mode) {
    const loginDiv = document.getElementById('form-login');
    const regDiv = document.getElementById('form-register');
    if (mode === 'register') {
        loginDiv.classList.add('hidden');
        regDiv.classList.remove('hidden');
    } else {
        regDiv.classList.add('hidden');
        loginDiv.classList.remove('hidden');
    }
}

function submitLogin() {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const errBox = document.getElementById('auth-error');

    if (!user || !pass) {
        errBox.innerText = "Username dan kata sandi wajib diisi!";
        errBox.classList.remove('hidden');
        return;
    }

    currentUser = { username: user, role: user.toLowerCase() === 'admin' ? 'ADMIN' : 'USER', name: user };
    localStorage.setItem('beatles_user', JSON.stringify(currentUser));
    errBox.classList.add('hidden');
    showToast("Login berhasil! Mengalihkan ke dashboard...", "success");
    setTimeout(showDashboard, 600);
}

function submitRegister() {
    const name = document.getElementById('register-name').value.trim();
    const user = document.getElementById('register-username').value.trim();
    const pass = document.getElementById('register-password').value.trim();
    const errBox = document.getElementById('register-error');

    if (!name || !user || !pass) {
        errBox.innerText = "Semua kolom wajib diisi!";
        errBox.classList.remove('hidden');
        return;
    }

    currentUser = { username: user, role: 'USER', name: name };
    localStorage.setItem('beatles_user', JSON.stringify(currentUser));
    errBox.classList.add('hidden');
    showToast("Pendaftaran berhasil! Selamat datang.", "success");
    setTimeout(showDashboard, 600);
}

function logout() {
    localStorage.removeItem('beatles_user');
    currentUser = null;
    showConsole();
    showToast("Berhasil keluar sesi.", "info");
}

function showDashboard() {
    document.getElementById('view-console').classList.add('hidden');
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');

    document.getElementById('top-username').innerText = currentUser.name || currentUser.username;
    document.getElementById('top-role').innerText = currentUser.role;
    document.getElementById('user-role-display').innerText = `Role: ${currentUser.role}`;

    buildSidebar();
    loadPage('home');
}

function toggleSidebar(show) {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebar-backdrop');
    if (show) {
        sb.classList.remove('-translate-x-full');
        bd.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-full');
        bd.classList.add('hidden');
    }
}

function buildSidebar() {
    const t = translations[currentLang];
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = `
        <button onclick="loadPage('home')" id="nav-home" class="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-slate-300 hover:text-white hover:bg-slate-800">
            <i class="fas fa-chart-pie w-5 text-beatles-cyan"></i><span>${t.dashboard}</span>
        </button>
        <button onclick="loadPage('whatsapp')" id="nav-whatsapp" class="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-slate-300 hover:text-white hover:bg-slate-800">
            <i class="fab fa-whatsapp w-5 text-beatles-emerald"></i><span>${t.whatsapp}</span>
        </button>
        <button onclick="loadPage('devices')" id="nav-devices" class="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-slate-300 hover:text-white hover:bg-slate-800">
            <i class="fas fa-server w-5 text-beatles-bronze"></i><span>${t.devices}</span>
        </button>
        ${currentUser.role === 'ADMIN' ? `
        <button onclick="loadPage('stok-db')" id="nav-stok-db" class="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-slate-300 hover:text-white hover:bg-slate-800">
            <i class="fas fa-database w-5 text-beatles-bronze"></i><span>${t.stokDb}</span>
        </button>
        <button onclick="loadPage('users')" id="nav-users" class="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-slate-300 hover:text-white hover:bg-slate-800">
            <i class="fas fa-users-cog w-5 text-purple-400"></i><span>${t.users}</span>
        </button>` : ''}
    `;
}

function loadPage(page) {
    document.querySelectorAll('#sidebar-nav button').forEach(b => b.classList.remove('nav-active'));
    const activeBtn = document.getElementById(`nav-${page}`);
    if (activeBtn) activeBtn.classList.add('nav-active');

    const titleEl = document.getElementById('page-title');
    const contentEl = document.getElementById('dashboard-content');
    toggleSidebar(false);

    if (page === 'home') {
        titleEl.innerText = "Console Overview";
        contentEl.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="glass-panel gradient-border p-6 rounded-2xl">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-xs text-slate-400 uppercase font-semibold">Status Gateway</h4>
                        <i class="fas fa-signal text-beatles-cyan"></i>
                    </div>
                    <p class="text-2xl font-bold text-white">Connected</p>
                    <span class="text-xs text-emerald-400 mt-2 inline-block"><i class="fas fa-check-circle"></i> Baileys Stable</span>
                </div>
                <div class="glass-panel gradient-border p-6 rounded-2xl">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-xs text-slate-400 uppercase font-semibold">Total Nomor DB</h4>
                        <i class="fas fa-database text-beatles-emerald"></i>
                    </div>
                    <p class="text-2xl font-bold text-white">${dbNumbers.length}</p>
                    <span class="text-xs text-beatles-cyan mt-2 inline-block">Nomor Target Valid</span>
                </div>
                <div class="glass-panel gradient-border p-6 rounded-2xl">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-xs text-slate-400 uppercase font-semibold">Sesi Aktif Pairing</h4>
                        <i class="fas fa-shield-alt text-beatles-bronze"></i>
                    </div>
                    <p class="text-2xl font-bold text-white">${pairingAttempts} / 4</p>
                    <span class="text-xs text-slate-400 mt-2 inline-block">Maksimal 4x percobaan</span>
                </div>
            </div>
        `;
    } else if (page === 'whatsapp') {
        titleEl.innerText = "WhatsApp Gateway & Pairing";
        contentEl.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="glass-panel gradient-border p-6 rounded-2xl">
                    <h3 class="text-lg font-bold text-white mb-2">Pairing Perangkat WhatsApp</h3>
                    <p class="text-xs text-slate-400 mb-6">Hubungkan nomor WhatsApp menggunakan kode pairing (Maksimal 4x percobaan berturut-turut).</p>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase">Nomor WhatsApp</label>
                            <input type="text" id="pairing-phone" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none" placeholder="62812xxxxxx">
                        </div>
                        <button onclick="requestPairingCode()" class="w-full bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 font-bold py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                            Dapatkan Kode Pairing
                        </button>
                        <div id="pairing-code-box" class="hidden p-4 bg-slate-950 border border-beatles-cyan/40 rounded-xl text-center">
                            <p class="text-xs text-slate-400 mb-1">Kode Pairing Anda:</p>
                            <p id="pairing-code-display" class="text-2xl font-mono font-black text-beatles-cyan tracking-widest">-</p>
                            <p id="pairing-limit-info" class="text-[11px] text-slate-400 mt-2"></p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (page === 'stok-db' && currentUser.role === 'ADMIN') {
        titleEl.innerText = "Stok DB & Template Pesan";
        contentEl.innerHTML = `
            <div class="glass-panel gradient-border p-6 rounded-2xl mb-6">
                <div class="flex space-x-3 border-b border-slate-700 pb-4 mb-6">
                    <button id="btn-sub-db" onclick="switchStokDbTab('db')" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-beatles-cyan text-beatles-900 shadow-md transition-all">
                        <i class="fas fa-database mr-1"></i> Database (DB) Nomor
                    </button>
                    <button id="btn-sub-template" onclick="switchStokDbTab('template')" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white transition-all">
                        <i class="fas fa-file-alt mr-1"></i> Template Pesan
                    </button>
                </div>

                <!-- SUB-TAB: DB NOMOR -->
                <div id="subtab-db" class="space-y-6">
                    <div>
                        <h4 class="text-md font-bold text-white mb-2">Upload Database Nomor Target (.txt / Excel)</h4>
                        <p class="text-xs text-slate-400 mb-4">Pilih file teks (.txt) berisi daftar nomor, sistem akan otomatis mendeteksi dan menyaring nomor valid.</p>
                        <div class="flex items-center space-x-4">
                            <input type="file" id="db-file-input" accept=".txt,.csv" class="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-beatles-cyan file:text-beatles-900 hover:file:bg-cyan-400 cursor-pointer">
                            <button onclick="processDbFile()" class="bg-beatles-emerald hover:bg-emerald-400 text-beatles-900 font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition-all">
                                Proses & Deteksi
                            </button>
                        </div>
                    </div>
                    <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-semibold text-beatles-cyan">Total Nomor Terdeteksi (Valid):</span>
                            <span id="db-count-display" class="text-sm font-bold text-white bg-slate-800 px-3 py-1 rounded-lg">0 Nomor</span>
                        </div>
                        <div id="db-list-preview" class="max-h-40 overflow-y-auto text-xs font-mono text-slate-400 space-y-1 mt-3">
                            <p class="italic text-slate-500">Belum ada nomor yang diunggah.</p>
                        </div>
                    </div>
                </div>

                <!-- SUB-TAB: TEMPLATE PESAN -->
                <div id="subtab-template" class="hidden space-y-6">
                    <div>
                        <h4 class="text-md font-bold text-white mb-2">Buat Template Pesan Baru</h4>
                        <p class="text-xs text-slate-400 mb-4">Format: Nama Template | Teks Pesan | URL/Link Web | Foto</p>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase">Nama Template</label>
                                <input type="text" id="tpl-name" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none" placeholder="Contoh: Promo Lebaran">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase">Teks Pesan</label>
                                <textarea id="tpl-text" rows="3" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none" placeholder="Halo Kak, ada penawaran spesial..."></textarea>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase">URL / Link Web</label>
                                    <input type="text" id="tpl-url" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none" placeholder="https://example.com">
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-beatles-cyan mb-1 uppercase">Foto (URL / Nama File)</label>
                                    <input type="text" id="tpl-photo" class="glow-focus w-full bg-slate-800/80 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:border-beatles-cyan focus:outline-none" placeholder="assets/promo.jpg">
                                </div>
                            </div>
                            <button onclick="saveTemplate()" class="w-full bg-beatles-cyan hover:bg-cyan-400 text-beatles-900 font-bold py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                                Simpan Template Pesan
                            </button>
                        </div>
                    </div>
                    <div class="border-t border-slate-700 pt-6">
                        <h4 class="text-md font-bold text-white mb-4">Daftar Template Tersimpan</h4>
                        <div id="template-list-container" class="space-y-3">
                            <p class="text-xs text-slate-500 italic">Belum ada template tersimpan.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        renderTemplateList();
    } else if (page === 'devices') {
        titleEl.innerText = "Manajemen Perangkat Baileys";
        contentEl.innerHTML = `
            <div class="glass-panel gradient-border p-6 rounded-2xl">
                <h3 class="text-lg font-bold text-white">Sesi Perangkat Aktif</h3>
                <p class="text-xs text-slate-400 mt-2">Baileys socket stabil dan siap digunakan.</p>
            </div>
        `;
    } else if (page === 'users' && currentUser.role === 'ADMIN') {
        titleEl.innerText = "Manajemen Pengguna (Admin Only)";
        contentEl.innerHTML = `
            <div class="glass-panel gradient-border p-6 rounded-2xl">
                <h3 class="text-lg font-bold text-white">Daftar Pengguna Sistem</h3>
                <p class="text-xs text-slate-400 mt-1">Total user terdaftar: 2 Akun</p>
            </div>
        `;
    }
}

// Handler Tab Stok DB (db | template)
function switchStokDbTab(tab) {
    const dbSec = document.getElementById('subtab-db');
    const tplSec = document.getElementById('subtab-template');
    const btnDb = document.getElementById('btn-sub-db');
    const btnTpl = document.getElementById('btn-sub-template');

    if (tab === 'db') {
        dbSec.classList.remove('hidden');
        tplSec.classList.add('hidden');
        btnDb.className = "px-5 py-2.5 rounded-xl text-xs font-bold bg-beatles-cyan text-beatles-900 shadow-md transition-all";
        btnTpl.className = "px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white transition-all";
    } else {
        dbSec.classList.add('hidden');
        tplSec.classList.remove('hidden');
        btnTpl.className = "px-5 py-2.5 rounded-xl text-xs font-bold bg-beatles-cyan text-beatles-900 shadow-md transition-all";
        btnDb.className = "px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white transition-all";
    }
}

// Proses Upload & Deteksi Nomor DB
function processDbFile() {
    const fileInput = document.getElementById('db-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast("Pilih file .txt atau .csv terlebih dahulu!", "error");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/);
        dbNumbers = lines.map(l => l.trim()).filter(l => l.length > 5 && !isNaN(l));

        document.getElementById('db-count-display').innerText = `${dbNumbers.length} Nomor`;
        const preview = document.getElementById('db-list-preview');
        
        if (dbNumbers.length > 0) {
            preview.innerHTML = dbNumbers.slice(0, 10).map(n => `<p>✓ ${n}</p>`).join('') + (dbNumbers.length > 10 ? `<p class="italic text-slate-500">...dan ${dbNumbers.length - 10} nomor lainnya.</p>` : '');
            showToast(`Berhasil mendeteksi ${dbNumbers.length} nomor valid!`, "success");
        } else {
            preview.innerHTML = `<p class="text-red-400">Tidak ada nomor valid yang terdeteksi di dalam file.</p>`;
            showToast("Format file tidak valid atau kosong.", "error");
        }
    };

    reader.readAsText(file);
}

// Simpan Template Pesan
function saveTemplate() {
    const name = document.getElementById('tpl-name').value.trim();
    const text = document.getElementById('tpl-text').value.trim();
    const url = document.getElementById('tpl-url').value.trim();
    const photo = document.getElementById('tpl-photo').value.trim();

    if (!name || !text) {
        showToast("Nama Template dan Teks Pesan wajib diisi!", "error");
        return;
    }

    const newTpl = { id: Date.now(), name, text, url: url || '-', photo: photo || '-' };
    messageTemplates.push(newTpl);
    localStorage.setItem('beatles_templates', JSON.stringify(messageTemplates));

    document.getElementById('tpl-name').value = '';
    document.getElementById('tpl-text').value = '';
    document.getElementById('tpl-url').value = '';
    document.getElementById('tpl-photo').value = '';

    renderTemplateList();
    showToast("Template pesan berhasil disimpan!", "success");
}

function renderTemplateList() {
    const container = document.getElementById('template-list-container');
    if (!container) return;

    if (messageTemplates.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 italic">Belum ada template tersimpan.</p>`;
        return;
    }

    container.innerHTML = messageTemplates.map(t => `
        <div class="p-4 bg-slate-800/60 border border-slate-700 rounded-xl space-y-2">
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold text-beatles-cyan"><i class="fas fa-bookmark mr-1"></i> ${t.name}</span>
                <button onclick="deleteTemplate(${t.id})" class="text-red-400 hover:text-red-300 text-xs"><i class="fas fa-trash"></i> Hapus</button>
            </div>
            <p class="text-xs text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono"><b>Pesan:</b> ${t.text}</p>
            <div class="flex flex-wrap gap-4 text-[11px] text-slate-400">
                <span><i class="fas fa-link text-beatles-emerald mr-1"></i> Link: ${t.url}</span>
                <span><i class="fas fa-image text-beatles-bronze mr-1"></i> Foto: ${t.photo}</span>
            </div>
        </div>
    `).join('');
}

function deleteTemplate(id) {
    messageTemplates = messageTemplates.filter(t => t.id !== id);
    localStorage.setItem('beatles_templates', JSON.stringify(messageTemplates));
    renderTemplateList();
    showToast("Template berhasil dihapus.", "info");
}

function requestPairingCode() {
    const phone = document.getElementById('pairing-phone').value.trim();
    if (!phone) {
        showToast("Masukkan nomor WhatsApp terlebih dahulu!", "error");
        return;
    }

    if (pairingAttempts >= 4) {
        showToast("Batas maksimal 4x percobaan pairing tercapai!", "error");
        document.getElementById('pairing-limit-info').innerText = "❌ Batas 4 percobaan tercapai.";
        return;
    }

    pairingAttempts++;
    localStorage.setItem('beatles_pairing_attempts', pairingAttempts);

    const mockCode = Math.floor(10000000 + Math.random() * 90000000).toString();
    document.getElementById('pairing-code-display').innerText = `${mockCode.slice(0,4)}-${mockCode.slice(4)}`.toUpperCase();
    document.getElementById('pairing-limit-info').innerText = `Percobaan ke-${pairingAttempts} dari 4 maksimal.`;
    document.getElementById('pairing-code-box').classList.remove('hidden');
    showToast(`Kode pairing dibuat (Percobaan ${pairingAttempts}/4)`, "success");
}

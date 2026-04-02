const API_BASE = '/api';
let authToken   = null;
let tellerProfile = null;
let refreshInterval = null;
let currentPage = 'dashboard';

// ===== DOM refs =====
const loginPage     = document.getElementById('login-page');
const dashboardPage = document.getElementById('dashboard-page');
const loginForm     = document.getElementById('login-form');
const registerForm  = document.getElementById('register-form');
const loginError    = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const loginBtn      = document.getElementById('login-btn');
const registerBtn   = document.getElementById('register-btn');
const sidebar       = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const topbarToggle  = document.getElementById('topbar-toggle');
const logoutBtn     = document.getElementById('logout-btn');
const sbUserName    = document.getElementById('sb-user-name');
const sbAvatarInitial = document.getElementById('sb-avatar-initial');
const pageTitle     = document.getElementById('page-title');
const waStatusEl    = document.getElementById('wa-status');
const waLabel       = document.getElementById('wa-label');

// Dashboard page
const currentNumberEl   = document.getElementById('current-number');
const currentInfoEl     = document.getElementById('current-info');
const queueTbody        = document.getElementById('queue-tbody');
const panggilBtn        = document.getElementById('panggil-btn');
const panggilFeedback   = document.getElementById('panggil-feedback');
const totalBadge        = document.getElementById('total-badge');
const layananFilter     = document.getElementById('layanan-filter');
const refreshBtn        = document.getElementById('refresh-btn');

// Antrian page
const antrianTbody      = document.getElementById('antrian-tbody');
const antrianStats      = document.getElementById('antrian-stats');
const antrianFilterStatus  = document.getElementById('antrian-filter-status');
const antrianFilterLayanan = document.getElementById('antrian-filter-layanan');
const antrianRefreshBtn = document.getElementById('antrian-refresh-btn');

// Notif page
const notifWaStatus    = document.getElementById('notif-wa-status');
const notifPushStatus  = document.getElementById('notif-push-status');
const refreshStatusBtn = document.getElementById('refresh-status-btn');
const testPushBtn      = document.getElementById('test-push-btn');
const pushResult       = document.getElementById('push-result');
const testWaBtn        = document.getElementById('test-wa-btn');
const waResult         = document.getElementById('wa-result');

// ===== Auth Tab =====
function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  loginForm.classList.toggle('hidden', tab !== 'login');
  registerForm.classList.toggle('hidden', tab !== 'register');
  loginError.classList.add('hidden');
  registerError.classList.add('hidden');
  registerSuccess.classList.add('hidden');
}

// ===== API Helper =====
async function api(method, endpoint, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + endpoint, opts);
  return res.json();
}

// ===== Session =====
function saveSession(token, profile) {
  authToken = token;
  tellerProfile = profile;
  localStorage.setItem('teller_token', token);
  localStorage.setItem('teller_profile', JSON.stringify(profile));
}
function clearSession() {
  authToken = null; tellerProfile = null;
  localStorage.removeItem('teller_token');
  localStorage.removeItem('teller_profile');
}
function loadSession() {
  const token   = localStorage.getItem('teller_token');
  const profile = localStorage.getItem('teller_profile');
  if (token && profile) { authToken = token; tellerProfile = JSON.parse(profile); return true; }
  return false;
}

// ===== Page Show/Hide =====
function showLogin() {
  loginPage.classList.add('active');
  dashboardPage.classList.remove('active');
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  history.pushState({}, '', '/login');
}

function showApp() {
  loginPage.classList.remove('active');
  dashboardPage.classList.add('active');
  const nama = tellerProfile?.nama ?? 'Teller';
  sbUserName.textContent = nama;
  sbAvatarInitial.textContent = nama.charAt(0).toUpperCase();
  history.pushState({}, '', '/dashboard');
  navigateTo('dashboard');
  refreshInterval = setInterval(() => {
    if (currentPage === 'dashboard') { loadQueueData(); checkNotifStatus(); }
    if (currentPage === 'antrian')   { loadAntrianAll(); }
  }, 5000);
}

// ===== Sidebar Toggle =====
function toggleSidebar() {
  sidebar.classList.toggle('collapsed');
}
sidebarToggle.addEventListener('click', toggleSidebar);
topbarToggle.addEventListener('click', toggleSidebar);

// ===== Navigation =====
const pageTitles = { dashboard: 'Dashboard', antrian: 'Antrian', notif: 'Test Notif WA' };

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.sub-page').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  pageTitle.textContent = pageTitles[page] || page;

  if (page === 'dashboard') { loadQueueData(); checkNotifStatus(); }
  if (page === 'antrian')   { loadAntrianAll(); }
  if (page === 'notif')     { checkNotifStatusFull(); }
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(el.dataset.page);
  });
});

// ===== Login =====
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Memproses...';
  try {
    const result = await api('POST', '/auth/login', {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    });
    if (!result.success) { loginError.textContent = result.message || 'Login gagal'; loginError.classList.remove('hidden'); return; }
    if (result.data.user?.role !== 'teller') { loginError.textContent = 'Akses ditolak. Hanya teller yang dapat masuk.'; loginError.classList.remove('hidden'); return; }
    saveSession(result.data.token, result.data.user);
    showApp();
  } catch { loginError.textContent = 'Terjadi kesalahan koneksi. Coba lagi.'; loginError.classList.remove('hidden'); }
  finally  { loginBtn.disabled = false; loginBtn.textContent = 'Masuk'; }
});

// ===== Register =====
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.classList.add('hidden'); registerSuccess.classList.add('hidden');
  registerBtn.disabled = true; registerBtn.textContent = 'Mendaftarkan...';
  try {
    const result = await api('POST', '/auth/register', {
      nama: document.getElementById('reg-nama').value,
      email: document.getElementById('reg-email').value,
      no_hp: document.getElementById('reg-no-hp').value,
      password: document.getElementById('reg-password').value,
    });
    if (!result.success) { registerError.textContent = result.message || 'Gagal'; registerError.classList.remove('hidden'); return; }
    registerSuccess.textContent = 'Pendaftaran berhasil! Hubungi admin untuk aktivasi teller, lalu login.';
    registerSuccess.classList.remove('hidden');
    registerForm.reset();
    setTimeout(() => switchTab('login'), 3000);
  } catch { registerError.textContent = 'Terjadi kesalahan koneksi.'; registerError.classList.remove('hidden'); }
  finally  { registerBtn.disabled = false; registerBtn.textContent = 'Buat Akun'; }
});

// ===== Logout =====
logoutBtn.addEventListener('click', () => {
  if (confirm('Yakin ingin keluar?')) { clearSession(); showLogin(); }
});

// ===== Helpers =====
function formatWaktu(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function layananBadge(layanan) {
  const cls = { Tabungan: 'layanan-tabungan', Kredit: 'layanan-kredit', Umum: 'layanan-umum' }[layanan] || 'layanan-umum';
  return `<span class="layanan-badge ${cls}">${layanan}</span>`;
}
function statusBadge(status) {
  const cls = { menunggu: 'status-menunggu', dipanggil: 'status-dipanggil', selesai: 'status-selesai', batal: 'status-batal' }[status] || '';
  return `<span class="status-badge-table ${cls}">${status}</span>`;
}
function showFeedback(msg, isError = false) {
  panggilFeedback.textContent = msg;
  panggilFeedback.className = 'feedback ' + (isError ? 'feedback-error' : 'feedback-success');
  panggilFeedback.classList.remove('hidden');
  setTimeout(() => panggilFeedback.classList.add('hidden'), 4000);
}
function escapeHtml(str) {
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

// ===== Dashboard: Queue Data =====
async function loadQueueData() {
  const layanan = layananFilter?.value;
  const endpoint = layanan ? `/antrian/list?layanan=${encodeURIComponent(layanan)}` : '/antrian/list';
  try {
    const result = await api('GET', endpoint);
    if (!result.success) {
      if (result.message?.includes('Token')) { clearSession(); showLogin(); }
      return;
    }
    const { sedang_dilayani, antrian_menunggu, total_menunggu } = result.data;
    if (sedang_dilayani) {
      currentNumberEl.textContent = sedang_dilayani.nomor_antrian;
      currentInfoEl.textContent = `${sedang_dilayani.profiles?.nama ?? 'Nasabah'} · ${sedang_dilayani.layanan ?? ''}`;
    } else {
      currentNumberEl.textContent = '—';
      currentInfoEl.textContent = 'Belum ada antrian dipanggil';
    }
    totalBadge.textContent = `${total_menunggu} menunggu`;
    renderQueueTable(antrian_menunggu);
  } catch {}
}

function renderQueueTable(antrian) {
  if (!antrian?.length) {
    queueTbody.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada antrian yang menunggu saat ini</td></tr>`;
    return;
  }
  queueTbody.innerHTML = antrian.map(item => `
    <tr>
      <td><span class="antrian-number">${item.nomor_antrian}</span></td>
      <td><strong>${escapeHtml(item.profiles?.nama ?? 'Tidak diketahui')}</strong></td>
      <td>${layananBadge(item.layanan)}</td>
      <td>${formatWaktu(item.created_at)}</td>
      <td>
        <button class="btn btn-done" onclick="selesaiAntrian('${item.id}', ${item.nomor_antrian})">Selesai</button>
        <button class="btn btn-danger" style="margin-left:6px" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>
      </td>
    </tr>`).join('');
}

panggilBtn?.addEventListener('click', async () => {
  panggilBtn.disabled = true; panggilBtn.textContent = 'Memanggil...';
  const layanan = layananFilter.value || undefined;
  try {
    const result = await api('PUT', '/antrian/panggil', layanan ? { layanan } : {});
    if (result.success) { showFeedback(result.message); await loadQueueData(); }
    else showFeedback(result.message, true);
  } catch { showFeedback('Terjadi kesalahan koneksi', true); }
  finally { panggilBtn.disabled = false; panggilBtn.textContent = 'Panggil Berikutnya'; }
});

refreshBtn?.addEventListener('click', () => { loadQueueData(); checkNotifStatus(); });
layananFilter?.addEventListener('change', loadQueueData);

async function selesaiAntrian(id, nomor) {
  if (!confirm(`Tandai antrian nomor ${nomor} sebagai selesai?`)) return;
  try {
    const result = await api('PUT', `/antrian/selesai/${id}`);
    if (result.success) { loadQueueData(); if (currentPage === 'antrian') loadAntrianAll(); }
    else alert('Gagal: ' + result.message);
  } catch { alert('Terjadi kesalahan koneksi'); }
}

async function batalAntrian(id, nomor) {
  if (!confirm(`Batalkan antrian nomor ${nomor}?`)) return;
  try {
    const result = await api('PUT', `/antrian/batal/${id}`);
    if (result.success) { loadQueueData(); if (currentPage === 'antrian') loadAntrianAll(); }
    else alert('Gagal: ' + result.message);
  } catch { alert('Terjadi kesalahan koneksi'); }
}

// ===== Antrian Page =====
async function loadAntrianAll() {
  const status  = antrianFilterStatus?.value;
  const layanan = antrianFilterLayanan?.value;
  let endpoint  = '/antrian/list?all=true';
  if (status)  endpoint += `&status=${encodeURIComponent(status)}`;
  if (layanan) endpoint += `&layanan=${encodeURIComponent(layanan)}`;
  try {
    const result = await api('GET', endpoint);
    if (!result.success) return;
    const items = result.data.antrian ?? result.data.antrian_menunggu ?? [];
    renderAntrianAll(items);
    if (antrianStats) {
      const total = result.data.total ?? items.length;
      antrianStats.textContent = `Total: ${total} antrian`;
    }
  } catch {}
}

function renderAntrianAll(antrian) {
  if (!antrian?.length) {
    antrianTbody.innerHTML = `<tr class="empty-row"><td colspan="6">Tidak ada antrian ditemukan</td></tr>`;
    return;
  }
  antrianTbody.innerHTML = antrian.map(item => `
    <tr>
      <td><span class="antrian-number">${item.nomor_antrian}</span></td>
      <td><strong>${escapeHtml(item.profiles?.nama ?? 'Tidak diketahui')}</strong></td>
      <td>${layananBadge(item.layanan)}</td>
      <td>${statusBadge(item.status)}</td>
      <td>${formatWaktu(item.created_at)}</td>
      <td>
        ${item.status === 'menunggu' ? `<button class="btn btn-done" onclick="selesaiAntrian('${item.id}', ${item.nomor_antrian})">Selesai</button>` : ''}
        ${item.status === 'menunggu' ? `<button class="btn btn-danger" style="margin-left:6px" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>` : '—'}
      </td>
    </tr>`).join('');
}

antrianRefreshBtn?.addEventListener('click', loadAntrianAll);
antrianFilterStatus?.addEventListener('change', loadAntrianAll);
antrianFilterLayanan?.addEventListener('change', loadAntrianAll);

// ===== Notif Status =====
async function checkNotifStatus() {
  try {
    const result = await api('GET', '/notif/status');
    if (result.success) {
      const wa = result.data.whatsapp_connected;
      waStatusEl.className = 'wa-dot ' + (wa ? 'wa-online' : 'wa-offline');
      waLabel.textContent = wa ? 'WhatsApp Terhubung' : 'WhatsApp';
    }
  } catch {}
}

async function checkNotifStatusFull() {
  try {
    const result = await api('GET', '/notif/status');
    if (result.success) {
      const wa   = result.data.whatsapp_connected;
      const push = result.data.onesignal_configured;
      notifWaStatus.textContent  = wa   ? 'Terhubung' : 'Tidak Terhubung';
      notifWaStatus.className    = 'status-chip ' + (wa   ? 'chip-online' : 'chip-offline');
      notifPushStatus.textContent = push ? 'Aktif' : 'Tidak Aktif';
      notifPushStatus.className   = 'status-chip ' + (push ? 'chip-online' : 'chip-offline');
      waStatusEl.className = 'wa-dot ' + (wa ? 'wa-online' : 'wa-offline');
    }
  } catch {}
}

refreshStatusBtn?.addEventListener('click', checkNotifStatusFull);

// ===== Test Push =====
testPushBtn?.addEventListener('click', async () => {
  const title    = document.getElementById('push-title').value;
  const body     = document.getElementById('push-body').value;
  const playerId = document.getElementById('push-player-id').value;
  if (!playerId) { showAlert(pushResult, 'Player ID wajib diisi', 'error'); return; }
  testPushBtn.disabled = true; testPushBtn.textContent = 'Mengirim...';
  try {
    const result = await api('POST', '/notif/test-push', { player_id: playerId, title, body });
    showAlert(pushResult, result.message, result.success ? 'success' : 'error');
  } catch { showAlert(pushResult, 'Gagal mengirim', 'error'); }
  finally  { testPushBtn.disabled = false; testPushBtn.textContent = 'Kirim Push Notification'; }
});

// ===== Test WA =====
testWaBtn?.addEventListener('click', async () => {
  const phone   = document.getElementById('wa-phone').value;
  const message = document.getElementById('wa-message').value;
  if (!phone) { showAlert(waResult, 'Nomor HP wajib diisi', 'error'); return; }
  testWaBtn.disabled = true; testWaBtn.textContent = 'Mengirim...';
  try {
    const result = await api('POST', '/notif/test-wa', { phone, message });
    showAlert(waResult, result.message, result.success ? 'success' : 'error');
  } catch { showAlert(waResult, 'Gagal mengirim', 'error'); }
  finally  { testWaBtn.disabled = false; testWaBtn.textContent = 'Kirim WhatsApp'; }
});

function showAlert(el, msg, type) {
  el.textContent = msg;
  el.className = 'alert alert-' + (type === 'success' ? 'success' : 'error');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// ===== Init =====
(function init() {
  if (loadSession()) {
    api('GET', '/auth/me').then(result => {
      if (result.success && result.data.profile?.role === 'teller') {
        tellerProfile = result.data.profile;
        showApp();
      } else { clearSession(); showLogin(); }
    }).catch(() => { clearSession(); showLogin(); });
  } else {
    showLogin();
  }
})();

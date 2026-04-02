const API_BASE = '/api';
let authToken     = null;
let userProfile   = null;
let refreshInterval = null;
let qrPollInterval  = null;
let currentTellerPage = 'dashboard';
let currentCSPage     = 'cs-overview';

// ===== DOM refs — Auth =====
const loginPage       = document.getElementById('login-page');
const tellerPage      = document.getElementById('teller-page');
const csPage          = document.getElementById('cs-page');
const loginForm       = document.getElementById('login-form');
const registerForm    = document.getElementById('register-form');
const loginError      = document.getElementById('login-error');
const registerError   = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const loginBtn        = document.getElementById('login-btn');
const registerBtn     = document.getElementById('register-btn');

// ===== DOM refs — Teller =====
const tellerSidebar     = document.getElementById('teller-sidebar');
const tellerTopbarToggle = document.getElementById('teller-topbar-toggle');
const tellerLogoutBtn   = document.getElementById('teller-logout-btn');
const tellerNameEl      = document.getElementById('teller-name');
const tellerAvatarEl    = document.getElementById('teller-avatar');
const tellerPageTitle   = document.getElementById('teller-page-title');
const waStatusEl        = document.getElementById('wa-status');
const waLabel           = document.getElementById('wa-label');
const currentNumberEl   = document.getElementById('current-number');
const currentInfoEl     = document.getElementById('current-info');
const queueTbody        = document.getElementById('queue-tbody');
const panggilBtn        = document.getElementById('panggil-btn');
const panggilFeedback   = document.getElementById('panggil-feedback');
const totalBadge        = document.getElementById('total-badge');
const layananFilter     = document.getElementById('layanan-filter');
const refreshBtn        = document.getElementById('refresh-btn');
const antrianTbody          = document.getElementById('antrian-tbody');
const antrianStats          = document.getElementById('antrian-stats');
const antrianFilterStatus   = document.getElementById('antrian-filter-status');
const antrianFilterLayanan  = document.getElementById('antrian-filter-layanan');
const antrianRefreshBtn     = document.getElementById('antrian-refresh-btn');
const testPushBtn     = document.getElementById('test-push-btn');
const pushResult      = document.getElementById('push-result');
const testWaBtn       = document.getElementById('test-wa-btn');
const waResult        = document.getElementById('wa-result');
const waDisconnectBtn = document.getElementById('wa-disconnect-btn');
const waConnectedView = document.getElementById('wa-connected-view');
const waQrView        = document.getElementById('wa-qr-view');
const qrImg           = document.getElementById('qr-img');
const qrLoading       = document.getElementById('qr-loading');
const qrLoadingText   = document.getElementById('qr-loading-text');
const qrHint          = document.getElementById('qr-hint');
const waErrorBanner   = document.getElementById('wa-error-banner');
const pairingPhone    = document.getElementById('pairing-phone');
const pairingBtn      = document.getElementById('pairing-btn');
const pairingResult   = document.getElementById('pairing-result');

// ===== DOM refs — CS =====
const csSidebar     = document.getElementById('cs-sidebar');
const csTopbarToggle = document.getElementById('cs-topbar-toggle');
const csLogoutBtn   = document.getElementById('cs-logout-btn');
const csNameEl      = document.getElementById('cs-name');
const csAvatarEl    = document.getElementById('cs-avatar');
const csPageTitle   = document.getElementById('cs-page-title');

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
  userProfile = profile;
  localStorage.setItem('bank_token', token);
  localStorage.setItem('bank_profile', JSON.stringify(profile));
}
function clearSession() {
  authToken = null; userProfile = null;
  localStorage.removeItem('bank_token');
  localStorage.removeItem('bank_profile');
}
function loadSession() {
  const token   = localStorage.getItem('bank_token');
  const profile = localStorage.getItem('bank_profile');
  if (token && profile) { authToken = token; userProfile = JSON.parse(profile); return true; }
  return false;
}

// ===== Helpers =====
function formatWaktu(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function layananBadge(l) {
  const cls = { Tabungan: 'layanan-tabungan', Kredit: 'layanan-kredit', Umum: 'layanan-umum' }[l] || 'layanan-umum';
  return `<span class="layanan-badge ${cls}">${l}</span>`;
}
function statusBadge(s) {
  const cls = { menunggu: 'status-menunggu', dipanggil: 'status-dipanggil', selesai: 'status-selesai', batal: 'status-batal' }[s] || '';
  return `<span class="status-badge-table ${cls}">${s}</span>`;
}
function showFeedback(msg, isError = false) {
  panggilFeedback.textContent = msg;
  panggilFeedback.className = 'feedback ' + (isError ? 'feedback-error' : 'feedback-success');
  panggilFeedback.classList.remove('hidden');
  setTimeout(() => panggilFeedback.classList.add('hidden'), 4000);
}
function showAlert(el, msg, type, persistent = false) {
  el.innerHTML = msg;
  el.className = 'alert alert-' + (type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'error');
  el.classList.remove('hidden');
  if (!persistent) setTimeout(() => el.classList.add('hidden'), 6000);
}
function escHtml(str) {
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

// ===== Page Show/Hide =====
function showLogin() {
  loginPage.classList.add('active');
  tellerPage.classList.remove('active');
  csPage.classList.remove('active');
  stopAllPolling();
  history.replaceState({}, '', '/');
}

function showTellerApp() {
  loginPage.classList.remove('active');
  csPage.classList.remove('active');
  tellerPage.classList.add('active');

  const nama = userProfile?.nama ?? 'Teller';
  if (tellerNameEl)    tellerNameEl.textContent    = nama;
  if (tellerAvatarEl)  tellerAvatarEl.textContent  = nama.charAt(0).toUpperCase();

  const pathPage = { '/antrian': 'antrian', '/notif': 'notif' }[window.location.pathname] ?? 'dashboard';
  tellerNavigateTo(pathPage);

  refreshInterval = setInterval(() => {
    if (currentTellerPage === 'dashboard') loadStatistik();
    if (currentTellerPage === 'antrian')  { loadQueueData(); loadAntrianAll(); }
    checkWAStatusTopbar();
  }, 5000);
}

function showCSApp() {
  loginPage.classList.remove('active');
  tellerPage.classList.remove('active');
  csPage.classList.add('active');

  const nama = userProfile?.nama ?? 'CS';
  if (csNameEl)   csNameEl.textContent   = nama;
  if (csAvatarEl) csAvatarEl.textContent = nama.charAt(0).toUpperCase();

  csNavigateTo('cs-overview');

  refreshInterval = setInterval(() => {
    if (currentCSPage === 'cs-overview') { loadCSStats(); loadCSQueue(); }
  }, 8000);
}

function stopAllPolling() {
  if (refreshInterval)  { clearInterval(refreshInterval);  refreshInterval  = null; }
  if (qrPollInterval)   { clearInterval(qrPollInterval);   qrPollInterval   = null; }
}

// ===== Teller Sidebar Toggle =====
tellerTopbarToggle?.addEventListener('click', () => tellerSidebar.classList.toggle('collapsed'));

// ===== CS Sidebar Toggle =====
csTopbarToggle?.addEventListener('click', () => csSidebar.classList.toggle('collapsed'));

// ===== Teller Navigation =====
const tellerPageTitles = { dashboard: 'Dashboard', antrian: 'Antrian', notif: 'Test Notif WA' };

function tellerNavigateTo(page) {
  currentTellerPage = page;
  history.pushState({}, '', { dashboard: '/dashboard', antrian: '/antrian', notif: '/notif' }[page] || '/dashboard');

  tellerPage.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  document.querySelectorAll('#teller-page .sub-page').forEach(el => el.classList.remove('active'));
  const subPage = document.getElementById('page-' + page);
  if (subPage) subPage.classList.add('active');

  if (tellerPageTitle) tellerPageTitle.textContent = tellerPageTitles[page] || page;

  if (qrPollInterval && page !== 'notif') { clearInterval(qrPollInterval); qrPollInterval = null; }

  if (page === 'dashboard') loadStatistik();
  if (page === 'antrian')   { loadQueueData(); loadAntrianAll(); }
  if (page === 'notif')     startQRPolling();
}

tellerPage?.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); tellerNavigateTo(el.dataset.page); });
});

// ===== CS Navigation =====
const csPageTitles = { 'cs-overview': 'Overview', 'cs-buat': 'Buat Antrian' };

function csNavigateTo(page) {
  currentCSPage = page;
  history.pushState({}, '', page === 'cs-overview' ? '/cs' : '/cs/' + page.replace('cs-', ''));

  csPage.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.csPage === page);
  });

  document.querySelectorAll('#cs-page .sub-page').forEach(el => el.classList.remove('active'));
  const subPage = document.getElementById('page-' + page);
  if (subPage) subPage.classList.add('active');

  if (csPageTitle) csPageTitle.textContent = csPageTitles[page] || page;

  if (page === 'cs-overview') { loadCSStats(); loadCSQueue(); }
  if (page === 'cs-buat')     resetCSBuatForm();
}

csPage?.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); csNavigateTo(el.dataset.csPage); });
});

// ===== Logout =====
tellerLogoutBtn?.addEventListener('click', () => {
  if (confirm('Yakin ingin keluar?')) { clearSession(); showLogin(); }
});
csLogoutBtn?.addEventListener('click', () => {
  if (confirm('Yakin ingin keluar?')) { clearSession(); showLogin(); }
});

// ===== Login =====
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true; loginBtn.textContent = 'Memproses...';
  try {
    const result = await api('POST', '/auth/login', {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    });
    if (!result.success) {
      loginError.textContent = result.message || 'Login gagal';
      loginError.classList.remove('hidden');
      return;
    }
    const role = result.data.user?.role;
    if (!['teller', 'cs'].includes(role)) {
      loginError.textContent = 'Akses ditolak. Role tidak dikenali.';
      loginError.classList.remove('hidden');
      return;
    }
    saveSession(result.data.token, result.data.user);
    if (role === 'teller') showTellerApp();
    else showCSApp();
  } catch {
    loginError.textContent = 'Terjadi kesalahan koneksi. Coba lagi.';
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false; loginBtn.textContent = 'Masuk';
  }
});

// ===== Register =====
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.classList.add('hidden'); registerSuccess.classList.add('hidden');
  registerBtn.disabled = true; registerBtn.textContent = 'Mendaftarkan...';
  try {
    const result = await api('POST', '/auth/register', {
      nama:     document.getElementById('reg-nama').value,
      email:    document.getElementById('reg-email').value,
      no_hp:    document.getElementById('reg-no-hp').value,
      password: document.getElementById('reg-password').value,
      role:     document.getElementById('reg-role').value,
    });
    if (!result.success) {
      registerError.textContent = result.message || 'Gagal mendaftarkan akun';
      registerError.classList.remove('hidden');
      return;
    }
    registerSuccess.textContent = result.message || 'Pendaftaran berhasil! Silakan login.';
    registerSuccess.classList.remove('hidden');
    registerForm.reset();
    setTimeout(() => switchTab('login'), 3000);
  } catch {
    registerError.textContent = 'Terjadi kesalahan koneksi.';
    registerError.classList.remove('hidden');
  } finally {
    registerBtn.disabled = false; registerBtn.textContent = 'Buat Akun';
  }
});

// ===== Teller: Dashboard Statistik =====
async function loadStatistik() {
  const dateEl = document.getElementById('stats-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  try {
    const result = await api('GET', '/antrian/statistik');
    if (!result.success) return;
    const d = result.data;
    document.getElementById('stat-total').textContent     = d.total      ?? 0;
    document.getElementById('stat-menunggu').textContent  = d.menunggu   ?? 0;
    document.getElementById('stat-dipanggil').textContent = d.dipanggil  ?? 0;
    document.getElementById('stat-selesai').textContent   = d.selesai    ?? 0;
    document.getElementById('stat-batal').textContent     = d.batal      ?? 0;
    renderLayananCards(d.per_layanan ?? [], d.total ?? 0);
  } catch {}
}

const layananColors = { Tabungan: '#2563eb', Kredit: '#ea580c', Umum: '#16a34a' };
function renderLayananCards(perLayanan, totalAll) {
  const grid = document.getElementById('layanan-grid');
  if (!grid) return;
  if (!perLayanan.length) { grid.innerHTML = '<div class="layanan-card loading-card">Tidak ada data</div>'; return; }
  grid.innerHTML = perLayanan.map(({ layanan, total, selesai, menunggu }) => {
    const pct = totalAll > 0 ? Math.round(total / totalAll * 100) : 0;
    const color = layananColors[layanan] || '#6b7280';
    return `
      <div class="layanan-card">
        <div class="layanan-card-title">
          ${layananBadge(layanan)}
          <span style="margin-left:auto;font-size:11px;color:#9ca3af">${pct}% dari total</span>
        </div>
        <div class="layanan-stats">
          <div class="layanan-stat"><span class="ls-val">${total}</span><span class="ls-key">Total</span></div>
          <div class="layanan-stat"><span class="ls-val">${menunggu}</span><span class="ls-key">Menunggu</span></div>
          <div class="layanan-stat"><span class="ls-val">${selesai}</span><span class="ls-key">Selesai</span></div>
        </div>
        <div class="layanan-bar-wrap">
          <div class="layanan-bar" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');
}

// ===== Teller: Antrian Queue =====
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
    queueTbody.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada antrian menunggu saat ini</td></tr>`;
    return;
  }
  queueTbody.innerHTML = antrian.map(item => `
    <tr>
      <td><span class="antrian-number">${item.nomor_antrian}</span></td>
      <td><strong>${escHtml(item.profiles?.nama ?? item.nama_nasabah ?? 'Tidak diketahui')}</strong></td>
      <td>${layananBadge(item.layanan)}</td>
      <td>${formatWaktu(item.created_at)}</td>
      <td>
        <button class="btn btn-done"   onclick="selesaiAntrian('${item.id}', ${item.nomor_antrian})">Selesai</button>
        <button class="btn btn-danger" style="margin-left:6px" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>
      </td>
    </tr>`).join('');
}

panggilBtn?.addEventListener('click', async () => {
  panggilBtn.disabled = true; panggilBtn.textContent = 'Memanggil...';
  const layanan = layananFilter.value || undefined;
  try {
    const result = await api('PUT', '/antrian/panggil', layanan ? { layanan } : {});
    if (result.success) { showFeedback(result.message); loadQueueData(); loadAntrianAll(); if (currentTellerPage === 'dashboard') loadStatistik(); }
    else showFeedback(result.message, true);
  } catch { showFeedback('Terjadi kesalahan koneksi', true); }
  finally  { panggilBtn.disabled = false; panggilBtn.textContent = 'Panggil Berikutnya'; }
});

refreshBtn?.addEventListener('click', () => { loadQueueData(); loadAntrianAll(); });
layananFilter?.addEventListener('change', loadQueueData);

async function selesaiAntrian(id, nomor) {
  if (!confirm(`Tandai antrian nomor ${nomor} sebagai selesai?`)) return;
  try {
    const result = await api('PUT', `/antrian/selesai/${id}`);
    if (result.success) { loadQueueData(); loadAntrianAll(); if (currentTellerPage === 'dashboard') loadStatistik(); }
    else alert('Gagal: ' + result.message);
  } catch { alert('Terjadi kesalahan koneksi'); }
}

async function batalAntrian(id, nomor) {
  if (!confirm(`Batalkan antrian nomor ${nomor}?`)) return;
  try {
    const result = await api('PUT', `/antrian/batal/${id}`);
    if (result.success) {
      loadQueueData(); loadAntrianAll();
      if (currentTellerPage === 'dashboard') loadStatistik();
    }
    else alert('Gagal: ' + result.message);
  } catch { alert('Terjadi kesalahan koneksi'); }
}

// ===== Teller: Semua Antrian =====
async function loadAntrianAll() {
  const status  = antrianFilterStatus?.value;
  const layanan = antrianFilterLayanan?.value;
  let endpoint  = '/antrian/list?all=true';
  if (status)  endpoint += `&status=${encodeURIComponent(status)}`;
  if (layanan) endpoint += `&layanan=${encodeURIComponent(layanan)}`;
  try {
    const result = await api('GET', endpoint);
    if (!result.success) return;
    const items = result.data.antrian ?? [];
    renderAntrianAll(items);
    if (antrianStats) antrianStats.textContent = `Total: ${result.data.total ?? items.length} antrian`;
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
      <td><strong>${escHtml(item.profiles?.nama ?? item.nama_nasabah ?? 'Tidak diketahui')}</strong></td>
      <td>${layananBadge(item.layanan)}</td>
      <td>${statusBadge(item.status)}</td>
      <td>${formatWaktu(item.created_at)}</td>
      <td>
        ${item.status === 'menunggu'
          ? `<button class="btn btn-done" onclick="selesaiAntrian('${item.id}', ${item.nomor_antrian})">Selesai</button>
             <button class="btn btn-danger" style="margin-left:6px" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>`
          : '—'}
      </td>
    </tr>`).join('');
}

antrianRefreshBtn?.addEventListener('click', loadAntrianAll);
antrianFilterStatus?.addEventListener('change', loadAntrianAll);
antrianFilterLayanan?.addEventListener('change', loadAntrianAll);

// ===== Teller: WA Status Topbar =====
async function checkWAStatusTopbar() {
  try {
    const result = await api('GET', '/notif/status');
    if (result.success) {
      const connected = result.data.whatsapp_connected;
      if (waStatusEl) waStatusEl.className = 'wa-dot ' + (connected ? 'wa-online' : 'wa-offline');
      if (waLabel)    waLabel.textContent  = connected ? 'WhatsApp Terhubung' : 'WhatsApp';
    }
  } catch {}
}

// ===== Teller: QR Code Polling =====
function startQRPolling() {
  fetchQR();
  qrPollInterval = setInterval(fetchQR, 4000);
}

async function fetchQR() {
  try {
    const result = await api('GET', '/notif/wa/qr');
    if (!result.success) return;
    const { connected, qr, status, error } = result.data;

    if (waStatusEl) waStatusEl.className = 'wa-dot ' + (connected ? 'wa-online' : 'wa-offline');
    if (waLabel)    waLabel.textContent  = connected ? 'WhatsApp Terhubung' : 'WhatsApp';

    if (connected) {
      waConnectedView?.classList.remove('hidden');
      waQrView?.classList.add('hidden');
      if (qrPollInterval) { clearInterval(qrPollInterval); qrPollInterval = null; }
    } else {
      waConnectedView?.classList.add('hidden');
      waQrView?.classList.remove('hidden');

      if (error) {
        if (waErrorBanner) { waErrorBanner.textContent = '⚠ ' + error; waErrorBanner.classList.remove('hidden'); }
      } else {
        waErrorBanner?.classList.add('hidden');
      }

      if (qr) {
        qrLoading?.classList.add('hidden');
        if (qrImg) { qrImg.src = qr; qrImg.classList.remove('hidden'); }
        if (qrHint) qrHint.textContent = 'QR diperbarui otomatis. Scan sebelum kedaluwarsa.';
      } else if (status === 'error') {
        qrLoading?.classList.remove('hidden');
        qrImg?.classList.add('hidden');
        if (qrLoadingText) qrLoadingText.textContent = 'Koneksi gagal — gunakan kode pairing di bawah';
        if (qrHint) qrHint.textContent = '';
      } else {
        qrLoading?.classList.remove('hidden');
        qrImg?.classList.add('hidden');
        if (qrLoadingText) qrLoadingText.textContent = 'Menunggu QR code...';
        if (qrHint) qrHint.textContent = 'Menunggu QR code dari server...';
      }
    }
  } catch {}
}

pairingBtn?.addEventListener('click', async () => {
  const phone = pairingPhone?.value?.trim();
  if (!phone) { showAlert(pairingResult, 'Nomor HP wajib diisi', 'error'); return; }
  pairingBtn.disabled = true; pairingBtn.textContent = 'Memproses...';
  try {
    const result = await api('POST', '/notif/wa/pairing-code', { phone_number: phone });
    if (result.success) {
      showAlert(pairingResult, `Kode pairing Anda: <strong style="font-size:20px;letter-spacing:3px;font-family:monospace">${result.data.code}</strong><br><span style="font-size:12px;opacity:0.8">Masukkan di WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon</span>`, 'success', true);
    } else {
      showAlert(pairingResult, result.message, 'error');
    }
  } catch { showAlert(pairingResult, 'Gagal meminta kode pairing', 'error'); }
  finally { pairingBtn.disabled = false; pairingBtn.textContent = 'Minta Kode'; }
});

waDisconnectBtn?.addEventListener('click', async () => {
  if (!confirm('Putuskan koneksi WhatsApp dan reset QR?')) return;
  waDisconnectBtn.disabled = true; waDisconnectBtn.textContent = 'Memutuskan...';
  try {
    await api('POST', '/notif/wa/disconnect');
    waConnectedView?.classList.add('hidden');
    waQrView?.classList.remove('hidden');
    qrLoading?.classList.remove('hidden');
    qrImg?.classList.add('hidden');
    if (qrHint) qrHint.textContent = 'Menunggu QR baru...';
    startQRPolling();
  } catch {}
  finally { waDisconnectBtn.disabled = false; waDisconnectBtn.textContent = 'Putuskan & Reset QR'; }
});

testPushBtn?.addEventListener('click', async () => {
  const playerId = document.getElementById('push-player-id').value;
  const nomor    = document.getElementById('push-nomor').value;
  if (!playerId) { showAlert(pushResult, 'Player ID wajib diisi', 'error'); return; }
  testPushBtn.disabled = true; testPushBtn.textContent = 'Mengirim...';
  try {
    const result = await api('POST', '/notif/test-push', { player_id: playerId, nomor_antrian: nomor || 0 });
    showAlert(pushResult, result.message, result.success ? 'success' : 'error');
  } catch { showAlert(pushResult, 'Gagal mengirim', 'error'); }
  finally  { testPushBtn.disabled = false; testPushBtn.textContent = 'Kirim Push Notification'; }
});

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

// ===== CS: Statistik & Queue =====
async function loadCSStats() {
  const dateEl = document.getElementById('cs-stats-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  try {
    const result = await api('GET', '/antrian/statistik');
    if (!result.success) return;
    const d = result.data;
    document.getElementById('cs-stat-total').textContent     = d.total      ?? 0;
    document.getElementById('cs-stat-menunggu').textContent  = d.menunggu   ?? 0;
    document.getElementById('cs-stat-dipanggil').textContent = d.dipanggil  ?? 0;
    document.getElementById('cs-stat-selesai').textContent   = d.selesai    ?? 0;
  } catch {}
}

async function loadCSQueue() {
  const tbody = document.getElementById('cs-queue-tbody');
  if (!tbody) return;
  try {
    const result = await api('GET', '/antrian/list');
    if (!result.success) {
      if (result.message?.includes('Token')) { clearSession(); showLogin(); }
      return;
    }
    const items = result.data.antrian_menunggu ?? [];
    if (!items.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada antrian menunggu saat ini</td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(item => `
      <tr>
        <td><span class="antrian-number">${item.nomor_antrian}</span></td>
        <td><strong>${escHtml(item.profiles?.nama ?? item.nama_nasabah ?? 'Tidak diketahui')}</strong></td>
        <td>${layananBadge(item.layanan)}</td>
        <td>${formatWaktu(item.created_at)}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="csBatalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>
        </td>
      </tr>`).join('');
  } catch {}
}

document.getElementById('cs-refresh-btn')?.addEventListener('click', () => {
  loadCSStats(); loadCSQueue();
});

async function csBatalAntrian(id, nomor) {
  if (!confirm(`Batalkan antrian nomor ${nomor}?`)) return;
  try {
    const result = await api('PUT', `/antrian/batal/${id}`);
    if (result.success) { loadCSQueue(); loadCSStats(); }
    else alert('Gagal: ' + result.message);
  } catch { alert('Terjadi kesalahan koneksi'); }
}

// ===== CS: Buat Antrian =====
function resetCSBuatForm() {
  const tiket = document.getElementById('cs-tiket');
  const form  = document.querySelector('#page-cs-buat .notif-form');
  const btn   = document.getElementById('cs-buat-btn');
  if (tiket) tiket.classList.add('hidden');
  if (form)  form.style.display = '';
  if (btn)   btn.classList.remove('hidden');
  document.getElementById('cs-nama').value  = '';
  document.getElementById('cs-nohp').value  = '';
  const resultEl = document.getElementById('cs-buat-result');
  if (resultEl) resultEl.classList.add('hidden');
}

document.getElementById('cs-buat-btn')?.addEventListener('click', async () => {
  const nama    = document.getElementById('cs-nama').value.trim();
  const no_hp   = document.getElementById('cs-nohp').value.trim();
  const layanan = document.getElementById('cs-layanan').value;
  const resultEl = document.getElementById('cs-buat-result');

  if (!nama) { showAlert(resultEl, 'Nama nasabah wajib diisi', 'error'); return; }

  const btn = document.getElementById('cs-buat-btn');
  btn.disabled = true; btn.textContent = 'Membuat antrian...';

  try {
    const result = await api('POST', '/antrian/ambil', { nama, no_hp: no_hp || undefined, layanan });
    if (!result.success) {
      showAlert(resultEl, result.message || 'Gagal membuat antrian', 'error');
      return;
    }
    const data = result.data;
    // Tampilkan tiket
    document.getElementById('cs-tiket-nomor').textContent  = data.nomor_antrian ?? data.antrian?.nomor_antrian ?? '—';
    document.getElementById('cs-tiket-layanan').textContent = `Layanan: ${layanan}`;
    document.getElementById('cs-tiket-nama').textContent    = `Nasabah: ${nama}`;
    document.getElementById('cs-tiket').classList.remove('hidden');
    btn.classList.add('hidden');
    loadCSStats();
  } catch {
    showAlert(resultEl, 'Terjadi kesalahan koneksi', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Buat Nomor Antrian';
  }
});

document.getElementById('cs-buat-lagi-btn')?.addEventListener('click', resetCSBuatForm);

// ===== Init =====
(function init() {
  if (loadSession()) {
    api('GET', '/auth/me').then(result => {
      if (result.success) {
        userProfile = result.data.profile;
        const role = userProfile?.role;
        if (role === 'teller') showTellerApp();
        else if (role === 'cs') showCSApp();
        else { clearSession(); showLogin(); }
      } else {
        clearSession(); showLogin();
      }
    }).catch(() => { clearSession(); showLogin(); });
  } else {
    showLogin();
  }
})();

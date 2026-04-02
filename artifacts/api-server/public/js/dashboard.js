const API_BASE = '/api';
let authToken = null;
let tellerProfile = null;
let refreshInterval = null;

const loginPage = document.getElementById('login-page');
const dashboardPage = document.getElementById('dashboard-page');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const tellerNameEl = document.getElementById('teller-name');
const waStatusEl = document.getElementById('wa-status');
const currentNumberEl = document.getElementById('current-number');
const currentInfoEl = document.getElementById('current-info');
const queueTbody = document.getElementById('queue-tbody');
const panggilBtn = document.getElementById('panggil-btn');
const panggilFeedback = document.getElementById('panggil-feedback');
const totalBadge = document.getElementById('total-badge');
const layananFilter = document.getElementById('layanan-filter');
const refreshBtn = document.getElementById('refresh-btn');

// ========== Tab Switcher ==========
function switchTab(tab) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }

  loginError.classList.add('hidden');
  registerError.classList.add('hidden');
  registerSuccess.classList.add('hidden');
}

// ========== Helper: API Request ==========
async function apiRequest(method, endpoint, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + endpoint, opts);
  return res.json();
}

// ========== Helper: Format Waktu ==========
function formatWaktu(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ========== Helper: Badge Layanan ==========
function layananBadge(layanan) {
  const cls = {
    'Tabungan': 'layanan-tabungan',
    'Kredit': 'layanan-kredit',
    'Umum': 'layanan-umum',
  }[layanan] || 'layanan-umum';
  return `<span class="layanan-badge ${cls}">${layanan}</span>`;
}

// ========== Helper: Tampilkan Feedback ==========
function showFeedback(msg, isError = false) {
  panggilFeedback.textContent = msg;
  panggilFeedback.className = 'feedback ' + (isError ? 'feedback-error' : 'feedback-success');
  panggilFeedback.classList.remove('hidden');
  setTimeout(() => panggilFeedback.classList.add('hidden'), 4000);
}

// ========== Auth: Simpan / Hapus Session ==========
function saveSession(token, profile) {
  authToken = token;
  tellerProfile = profile;
  localStorage.setItem('teller_token', token);
  localStorage.setItem('teller_profile', JSON.stringify(profile));
}

function clearSession() {
  authToken = null;
  tellerProfile = null;
  localStorage.removeItem('teller_token');
  localStorage.removeItem('teller_profile');
}

function loadSession() {
  const token = localStorage.getItem('teller_token');
  const profile = localStorage.getItem('teller_profile');
  if (token && profile) {
    authToken = token;
    tellerProfile = JSON.parse(profile);
    return true;
  }
  return false;
}

// ========== Tampilkan Halaman ==========
function showLogin() {
  loginPage.classList.add('active');
  dashboardPage.classList.remove('active');
  if (refreshInterval) clearInterval(refreshInterval);
  history.pushState({}, '', '/login');
}

function showDashboard() {
  loginPage.classList.remove('active');
  dashboardPage.classList.add('active');
  tellerNameEl.textContent = tellerProfile?.nama ?? 'Teller';
  history.pushState({}, '', '/dashboard');
  loadQueueData();
  checkNotifStatus();
  refreshInterval = setInterval(() => {
    loadQueueData();
    checkNotifStatus();
  }, 5000);
}

// ========== Login ==========
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Memproses...';

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const result = await apiRequest('POST', '/auth/login', { email, password });

    if (!result.success) {
      loginError.textContent = result.message || 'Login gagal';
      loginError.classList.remove('hidden');
      return;
    }

    if (result.data.user?.role !== 'teller') {
      loginError.textContent = 'Akses ditolak. Hanya teller yang dapat masuk ke dashboard ini.';
      loginError.classList.remove('hidden');
      return;
    }

    saveSession(result.data.token, result.data.user);
    showDashboard();
  } catch (err) {
    loginError.textContent = 'Terjadi kesalahan koneksi. Coba lagi.';
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Masuk';
  }
});

// ========== Daftar ==========
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.classList.add('hidden');
  registerSuccess.classList.add('hidden');
  registerBtn.disabled = true;
  registerBtn.textContent = 'Mendaftarkan...';

  const nama = document.getElementById('reg-nama').value;
  const email = document.getElementById('reg-email').value;
  const no_hp = document.getElementById('reg-no-hp').value;
  const password = document.getElementById('reg-password').value;

  try {
    const result = await apiRequest('POST', '/auth/register', { nama, email, password, no_hp });

    if (!result.success) {
      registerError.textContent = result.message || 'Pendaftaran gagal';
      registerError.classList.remove('hidden');
      return;
    }

    registerSuccess.textContent = '✅ Pendaftaran berhasil! Hubungi admin untuk aktivasi teller, lalu login.';
    registerSuccess.classList.remove('hidden');
    registerForm.reset();

    setTimeout(() => switchTab('login'), 3000);
  } catch (err) {
    registerError.textContent = 'Terjadi kesalahan koneksi. Coba lagi.';
    registerError.classList.remove('hidden');
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = 'Daftar Akun';
  }
});

// ========== Logout ==========
logoutBtn.addEventListener('click', () => {
  if (confirm('Yakin ingin keluar dari dashboard?')) {
    clearSession();
    showLogin();
  }
});

// ========== Muat Data Antrian ==========
async function loadQueueData() {
  const layanan = layananFilter.value;
  const endpoint = layanan ? `/antrian/list?layanan=${encodeURIComponent(layanan)}` : '/antrian/list';

  try {
    const result = await apiRequest('GET', endpoint);

    if (!result.success) {
      if (result.message?.includes('Token')) {
        clearSession();
        showLogin();
        return;
      }
      return;
    }

    const { sedang_dilayani, antrian_menunggu, total_menunggu } = result.data;

    if (sedang_dilayani) {
      currentNumberEl.textContent = sedang_dilayani.nomor_antrian;
      const nama = sedang_dilayani.profiles?.nama ?? 'Nasabah';
      const layananNow = sedang_dilayani.layanan ?? '';
      currentInfoEl.textContent = `${nama} · ${layananNow}`;
    } else {
      currentNumberEl.textContent = '—';
      currentInfoEl.textContent = 'Belum ada antrian dipanggil';
    }

    totalBadge.textContent = `${total_menunggu} menunggu`;
    renderQueueTable(antrian_menunggu);
  } catch (err) {
    // Jangan tampilkan error saat auto-refresh
  }
}

// ========== Render Tabel ==========
function renderQueueTable(antrian) {
  if (!antrian || antrian.length === 0) {
    queueTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">Tidak ada antrian yang menunggu saat ini</td>
      </tr>
    `;
    return;
  }

  queueTbody.innerHTML = antrian.map((item) => {
    const nama = item.profiles?.nama ?? 'Tidak diketahui';
    const waktu = formatWaktu(item.created_at);
    return `
      <tr>
        <td><span class="antrian-number">${item.nomor_antrian}</span></td>
        <td><strong>${escapeHtml(nama)}</strong></td>
        <td>${layananBadge(item.layanan)}</td>
        <td>${waktu}</td>
        <td>
          <button class="btn btn-danger" onclick="selesaiAntrian('${item.id}', ${item.nomor_antrian})">
            ✓ Selesai
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== Panggil Antrian Berikutnya ==========
panggilBtn.addEventListener('click', async () => {
  panggilBtn.disabled = true;
  panggilBtn.textContent = 'Memanggil...';

  const layanan = layananFilter.value || undefined;

  try {
    const result = await apiRequest('PUT', '/antrian/panggil', layanan ? { layanan } : {});

    if (result.success) {
      showFeedback(result.message);
      await loadQueueData();
    } else {
      showFeedback(result.message, true);
    }
  } catch (err) {
    showFeedback('Terjadi kesalahan koneksi', true);
  } finally {
    panggilBtn.disabled = false;
    panggilBtn.textContent = 'Panggil Berikutnya';
  }
});

// ========== Selesaikan Antrian ==========
async function selesaiAntrian(id, nomor) {
  if (!confirm(`Tandai antrian nomor ${nomor} sebagai selesai?`)) return;

  try {
    const result = await apiRequest('PUT', `/antrian/selesai/${id}`);
    if (result.success) {
      await loadQueueData();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (err) {
    alert('Terjadi kesalahan koneksi');
  }
}

// ========== Cek Status Notifikasi ==========
async function checkNotifStatus() {
  try {
    const result = await apiRequest('GET', '/notif/status');
    if (result.success) {
      const waConnected = result.data.whatsapp_connected;
      waStatusEl.className = 'wa-dot ' + (waConnected ? 'wa-online' : 'wa-offline');
      waStatusEl.title = waConnected ? 'WhatsApp Terhubung' : 'WhatsApp Belum Terhubung';
    }
  } catch (err) {}
}

// ========== Manual Refresh ==========
refreshBtn.addEventListener('click', () => {
  loadQueueData();
  checkNotifStatus();
});

// ========== Inisialisasi ==========
(function init() {
  if (loadSession()) {
    apiRequest('GET', '/auth/me').then((result) => {
      if (result.success && result.data.profile?.role === 'teller') {
        tellerProfile = result.data.profile;
        showDashboard();
      } else {
        clearSession();
        showLogin();
      }
    }).catch(() => {
      clearSession();
      showLogin();
    });
  } else {
    showLogin();
  }
})();

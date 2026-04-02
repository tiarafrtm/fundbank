/* ============================================================
   TELLER.JS — Logika Dashboard Teller
   Dimuat di: teller.html
   Membutuhkan: shared.js (dimuat sebelumnya)
   ============================================================ */

// ===========================
// REFERENSI ELEMEN HTML
// ===========================
const sidebar         = document.getElementById('sidebar');
const topbarToggle    = document.getElementById('topbar-toggle');
const logoutBtn       = document.getElementById('logout-btn');
const sbUserName      = document.getElementById('sb-user-name');
const sbAvatar        = document.getElementById('sb-avatar');
const pageTitle       = document.getElementById('page-title');
const waStatusEl      = document.getElementById('wa-status');
const waLabel         = document.getElementById('wa-label');

// Elemen halaman Antrian
const currentNumberEl      = document.getElementById('current-number');
const currentInfoEl        = document.getElementById('current-info');
const queueTbody           = document.getElementById('queue-tbody');
const panggilBtn           = document.getElementById('panggil-btn');
const panggilFeedback      = document.getElementById('panggil-feedback');
const totalBadge           = document.getElementById('total-badge');
const refreshBtn           = document.getElementById('refresh-btn');
const antrianTbody         = document.getElementById('antrian-tbody');
const antrianStats         = document.getElementById('antrian-stats');
const antrianFilterStatus  = document.getElementById('antrian-filter-status');
const antrianFilterLayanan = document.getElementById('antrian-filter-layanan');
const antrianRefreshBtn    = document.getElementById('antrian-refresh-btn');

// Layanan counter Teller (hardcoded — queue mobile dibuat dgn layanan "Teller")
const COUNTER_LAYANAN = 'Teller';

// Elemen halaman Notif WA
const testWaBtn       = document.getElementById('test-wa-btn');
const waResult        = document.getElementById('wa-result');
const testPushBtn     = document.getElementById('test-push-btn');
const pushResult      = document.getElementById('push-result');
const waConnectedView = document.getElementById('wa-connected-view');
const waQrView        = document.getElementById('wa-qr-view');
const qrImg           = document.getElementById('qr-img');
const qrLoading       = document.getElementById('qr-loading');
const qrLoadingText   = document.getElementById('qr-loading-text');
const qrHint          = document.getElementById('qr-hint');
const waErrorBanner   = document.getElementById('wa-error-banner');
const waDisconnectBtn = document.getElementById('wa-disconnect-btn');
const pairingPhone    = document.getElementById('pairing-phone');
const pairingBtn      = document.getElementById('pairing-btn');
const pairingResult   = document.getElementById('pairing-result');

// ===========================
// STATE HALAMAN
// ===========================
let currentPage     = 'dashboard'; // halaman aktif saat ini
let refreshInterval = null;        // timer auto-refresh
let qrPollInterval  = null;        // timer polling QR WhatsApp

// Mapping: nama page → judul di topbar
const pageTitles = {
  dashboard: 'Beranda',
  antrian:   'Antrian',
  notif:     'Notifikasi WA',
};

// ===========================
// NAVIGASI ANTAR SUB-PAGE
// ===========================
function navigateTo(page) {
  currentPage = page;

  // Update URL browser tanpa reload halaman
  const urls = { dashboard: '/dashboard', antrian: '/antrian', notif: '/notif' };
  history.pushState({}, '', urls[page] || '/dashboard');

  // Highlight menu aktif di sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Tampilkan sub-page yang dipilih, sembunyikan lainnya
  document.querySelectorAll('.sub-page').forEach(el => el.classList.remove('active'));
  const subPage = document.getElementById('page-' + page);
  if (subPage) subPage.classList.add('active');

  // Update judul di topbar
  if (pageTitle) pageTitle.textContent = pageTitles[page] || page;

  // Stop polling QR kalau pindah dari halaman notif
  if (page !== 'notif' && qrPollInterval) {
    clearInterval(qrPollInterval);
    qrPollInterval = null;
  }

  // Load data sesuai halaman yang dipilih
  if (page === 'dashboard') loadStatistik();
  if (page === 'antrian')   { loadQueueData(); loadAntrianAll(); }
  if (page === 'notif')     startQRPolling();
}

// Pasang event click ke semua tombol menu sidebar
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(el.dataset.page);
  });
});

// ===========================
// SIDEBAR — Toggle collapse/expand
// ===========================
topbarToggle?.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// ===========================
// LOGOUT
// ===========================
logoutBtn?.addEventListener('click', () => {
  if (confirm('Yakin ingin keluar?')) {
    clearSession();
    window.location.href = '/login';
  }
});

// ===========================
// DASHBOARD: STATISTIK
// ===========================
async function loadStatistik() {
  // Tampilkan tanggal hari ini
  const dateEl = document.getElementById('stats-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
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
  } catch { /* biarkan jika gagal, tidak crash */ }
}

// Warna chart per layanan
const layananColors = { Tabungan: '#2563eb', Kredit: '#ea580c', Umum: '#16a34a' };

function renderLayananCards(perLayanan, totalAll) {
  const grid = document.getElementById('layanan-grid');
  if (!grid) return;

  if (!perLayanan.length) {
    grid.innerHTML = '<div class="layanan-card loading-card">Tidak ada data</div>';
    return;
  }

  grid.innerHTML = perLayanan.map(({ layanan, total, selesai, menunggu }) => {
    const persen = totalAll > 0 ? Math.round(total / totalAll * 100) : 0;
    const warna  = layananColors[layanan] || '#6b7280';
    return `
      <div class="layanan-card">
        <div class="layanan-card-title">
          ${layananBadge(layanan)}
          <span style="margin-left:auto;font-size:11px;color:#9ca3af">${persen}% dari total</span>
        </div>
        <div class="layanan-stats">
          <div class="layanan-stat"><span class="ls-val">${total}</span><span class="ls-key">Total</span></div>
          <div class="layanan-stat"><span class="ls-val">${menunggu}</span><span class="ls-key">Menunggu</span></div>
          <div class="layanan-stat"><span class="ls-val">${selesai}</span><span class="ls-key">Selesai</span></div>
        </div>
        <div class="layanan-bar-wrap">
          <div class="layanan-bar" style="width:${persen}%;background:${warna}"></div>
        </div>
      </div>`;
  }).join('');
}

// ===========================
// ANTRIAN: DAFTAR MENUNGGU
// ===========================
async function loadQueueData() {
  const endpoint = `/antrian/list?layanan=${encodeURIComponent(COUNTER_LAYANAN)}`;

  try {
    const result = await api('GET', endpoint);
    if (!result.success) {
      // Kalau token expired, redirect ke login
      if (result.message?.includes('Token')) {
        clearSession();
        window.location.href = '/login';
      }
      return;
    }

    const { sedang_dilayani, antrian_menunggu, total_menunggu } = result.data;

    // Update panel "sedang dilayani"
    if (sedang_dilayani) {
      currentNumberEl.textContent = sedang_dilayani.nomor_antrian;
      currentInfoEl.textContent = `${getNamaNasabah(sedang_dilayani)} · ${sedang_dilayani.layanan}`;
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
      <td><strong>${escHtml(getNamaNasabah(item))}</strong></td>
      <td>${layananBadge(item.layanan)}</td>
      <td>${formatWaktu(item.created_at)}</td>
      <td>
        <button class="btn btn-done"   onclick="selesaiAntrian('${item.id}', ${item.nomor_antrian})">Selesai</button>
        <button class="btn btn-danger" style="margin-left:6px" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>
      </td>
    </tr>`).join('');
}

// ===========================
// ANTRIAN: PANGGIL BERIKUTNYA
// ===========================
panggilBtn?.addEventListener('click', async () => {
  panggilBtn.disabled = true;
  panggilBtn.textContent = 'Memanggil...';

  try {
    const result = await api('PUT', '/antrian/panggil', { layanan: COUNTER_LAYANAN });

    if (result.success) {
      tampilFeedback(result.message);
      loadQueueData();
      loadAntrianAll();
      if (currentPage === 'dashboard') loadStatistik();
    } else {
      tampilFeedback(result.message, true);
    }
  } catch {
    tampilFeedback('Terjadi kesalahan koneksi', true);
  } finally {
    panggilBtn.disabled = false;
    panggilBtn.textContent = 'Panggil Berikutnya';
  }
});

// Tampilkan pesan feedback di bawah tombol panggil
function tampilFeedback(pesan, isError = false) {
  panggilFeedback.textContent = pesan;
  panggilFeedback.className = 'feedback ' + (isError ? 'feedback-error' : 'feedback-success');
  panggilFeedback.classList.remove('hidden');
  setTimeout(() => panggilFeedback.classList.add('hidden'), 4000);
}

refreshBtn?.addEventListener('click', () => { loadQueueData(); loadAntrianAll(); });
layananFilter?.addEventListener('change', loadQueueData);

// ===========================
// ANTRIAN: SELESAI & BATAL
// ===========================
async function selesaiAntrian(id, nomor) {
  if (!confirm(`Tandai antrian nomor ${nomor} sebagai selesai?`)) return;
  try {
    const result = await api('PUT', `/antrian/selesai/${id}`);
    if (result.success) {
      loadQueueData(); loadAntrianAll();
      if (currentPage === 'dashboard') loadStatistik();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch { alert('Terjadi kesalahan koneksi'); }
}

async function batalAntrian(id, nomor) {
  if (!confirm(`Batalkan antrian nomor ${nomor}?`)) return;
  try {
    const result = await api('PUT', `/antrian/batal/${id}`);
    if (result.success) {
      loadQueueData(); loadAntrianAll();
      if (currentPage === 'dashboard') loadStatistik();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch { alert('Terjadi kesalahan koneksi'); }
}

// ===========================
// ANTRIAN: SEMUA ANTRIAN HARI INI
// ===========================
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
      <td><strong>${escHtml(getNamaNasabah(item))}</strong></td>
      <td>${layananBadge(item.layanan)}</td>
      <td>${statusBadge(item.status)}</td>
      <td>${formatWaktu(item.created_at)}</td>
      <td>
        ${item.status === 'menunggu'
          ? `<button class="btn btn-done"   onclick="selesaiAntrian('${item.id}', ${item.nomor_antrian})">Selesai</button>
             <button class="btn btn-danger" style="margin-left:6px" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>`
          : '—'}
      </td>
    </tr>`).join('');
}

antrianRefreshBtn?.addEventListener('click', loadAntrianAll);
antrianFilterStatus?.addEventListener('change', loadAntrianAll);
antrianFilterLayanan?.addEventListener('change', loadAntrianAll);

// ===========================
// WHATSAPP: STATUS DI TOPBAR
// ===========================
async function checkWAStatus() {
  try {
    const result = await api('GET', '/notif/status');
    if (result.success) {
      const connected = result.data.whatsapp_connected;
      waStatusEl.className = 'wa-dot ' + (connected ? 'wa-online' : 'wa-offline');
      waLabel.textContent  = connected ? 'WhatsApp Terhubung' : 'WhatsApp';
    }
  } catch {}
}

// ===========================
// WHATSAPP: POLLING QR CODE
// ===========================
function startQRPolling() {
  fetchQR(); // langsung ambil sekali
  qrPollInterval = setInterval(fetchQR, 4000); // ulangi tiap 4 detik
}

async function fetchQR() {
  try {
    const result = await api('GET', '/notif/wa/qr');
    if (!result.success) return;

    const { connected, qr, status, error } = result.data;

    // Update status dot
    waStatusEl.className = 'wa-dot ' + (connected ? 'wa-online' : 'wa-offline');
    waLabel.textContent  = connected ? 'WhatsApp Terhubung' : 'WhatsApp';

    if (connected) {
      // WA terhubung: tampilkan view "connected"
      waConnectedView.classList.remove('hidden');
      waQrView.classList.add('hidden');
      if (qrPollInterval) { clearInterval(qrPollInterval); qrPollInterval = null; }
    } else {
      // WA belum terhubung: tampilkan QR
      waConnectedView.classList.add('hidden');
      waQrView.classList.remove('hidden');

      // Tampilkan pesan error jika ada
      if (error) {
        waErrorBanner.textContent = '⚠ ' + error;
        waErrorBanner.classList.remove('hidden');
      } else {
        waErrorBanner.classList.add('hidden');
      }

      // Tampilkan gambar QR atau loading
      if (qr) {
        qrLoading.classList.add('hidden');
        qrImg.src = qr;
        qrImg.classList.remove('hidden');
        qrHint.textContent = 'QR diperbarui otomatis. Scan sebelum kedaluwarsa.';
      } else {
        qrLoading.classList.remove('hidden');
        qrImg.classList.add('hidden');
        qrLoadingText.textContent = status === 'error'
          ? 'Koneksi gagal — coba kode pairing di bawah'
          : 'Menunggu QR code...';
        qrHint.textContent = 'Menunggu QR code dari server...';
      }
    }
  } catch {}
}

// ===========================
// WHATSAPP: PAIRING CODE
// ===========================
pairingBtn?.addEventListener('click', async () => {
  const phone = pairingPhone?.value?.trim();
  if (!phone) { showAlert(pairingResult, 'Nomor HP wajib diisi', 'error'); return; }

  pairingBtn.disabled = true;
  pairingBtn.textContent = 'Memproses...';
  try {
    const result = await api('POST', '/notif/wa/pairing-code', { phone_number: phone });
    if (result.success) {
      showAlert(pairingResult,
        `Kode pairing: <strong style="font-size:20px;letter-spacing:3px;font-family:monospace">${result.data.code}</strong>
         <br><small>Masukkan di WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon</small>`,
        'success', true);
    } else {
      showAlert(pairingResult, result.message, 'error');
    }
  } catch { showAlert(pairingResult, 'Gagal meminta kode pairing', 'error'); }
  finally { pairingBtn.disabled = false; pairingBtn.textContent = 'Minta Kode'; }
});

// ===========================
// WHATSAPP: PUTUSKAN KONEKSI
// ===========================
waDisconnectBtn?.addEventListener('click', async () => {
  if (!confirm('Putuskan koneksi WhatsApp dan reset QR?')) return;
  waDisconnectBtn.disabled = true;
  waDisconnectBtn.textContent = 'Memutuskan...';
  try {
    await api('POST', '/notif/wa/disconnect');
    waConnectedView.classList.add('hidden');
    waQrView.classList.remove('hidden');
    qrLoading.classList.remove('hidden');
    qrImg.classList.add('hidden');
    qrHint.textContent = 'Menunggu QR baru...';
    startQRPolling();
  } catch {}
  finally { waDisconnectBtn.disabled = false; waDisconnectBtn.textContent = 'Putuskan & Reset QR'; }
});

// ===========================
// TEST: KIRIM PESAN WA
// ===========================
testWaBtn?.addEventListener('click', async () => {
  const phone   = document.getElementById('wa-phone').value;
  const message = document.getElementById('wa-message').value;
  if (!phone) { showAlert(waResult, 'Nomor HP wajib diisi', 'error'); return; }

  testWaBtn.disabled = true;
  testWaBtn.textContent = 'Mengirim...';
  try {
    const result = await api('POST', '/notif/test-wa', { phone, message });
    showAlert(waResult, result.message, result.success ? 'success' : 'error');
  } catch { showAlert(waResult, 'Gagal mengirim', 'error'); }
  finally { testWaBtn.disabled = false; testWaBtn.textContent = 'Kirim WhatsApp'; }
});

// ===========================
// TEST: PUSH NOTIFICATION
// ===========================
testPushBtn?.addEventListener('click', async () => {
  const playerId = document.getElementById('push-player-id').value;
  const nomor    = document.getElementById('push-nomor').value;
  if (!playerId) { showAlert(pushResult, 'Player ID wajib diisi', 'error'); return; }

  testPushBtn.disabled = true;
  testPushBtn.textContent = 'Mengirim...';
  try {
    const result = await api('POST', '/notif/test-push', { player_id: playerId, nomor_antrian: nomor || 0 });
    showAlert(pushResult, result.message, result.success ? 'success' : 'error');
  } catch { showAlert(pushResult, 'Gagal mengirim', 'error'); }
  finally { testPushBtn.disabled = false; testPushBtn.textContent = 'Kirim Push Notification'; }
});

// ===========================
// INISIALISASI DASHBOARD TELLER
// ===========================
(async function init() {
  // 1. Cek session di localStorage
  if (!loadSession()) {
    window.location.href = '/login';
    return;
  }

  // 2. Verifikasi token + ambil profile terbaru
  try {
    const result = await api('GET', '/auth/me');
    if (!result.success || result.data.profile?.role !== 'teller') {
      // Bukan teller atau token expired
      clearSession();
      window.location.href = '/login';
      return;
    }
    // Update data profile dari server
    userProfile = result.data.profile;
  } catch {
    clearSession();
    window.location.href = '/login';
    return;
  }

  // 3. Isi nama user di sidebar
  const nama = userProfile.nama || 'Teller';
  sbUserName.textContent = nama;
  sbAvatar.textContent   = nama.charAt(0).toUpperCase();

  // 4. Tentukan halaman awal berdasarkan URL
  const pathPage = { '/antrian': 'antrian', '/notif': 'notif' }[window.location.pathname] ?? 'dashboard';
  navigateTo(pathPage);

  // 5. Auto-refresh setiap 5 detik
  refreshInterval = setInterval(() => {
    if (currentPage === 'dashboard') loadStatistik();
    if (currentPage === 'antrian')  { loadQueueData(); loadAntrianAll(); }
    checkWAStatus();
  }, 5000);
})();

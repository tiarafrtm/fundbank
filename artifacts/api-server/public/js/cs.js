/* ============================================================
   CS.JS — Logika Dashboard Customer Service
   Halaman: Beranda · Antrian · Notifikasi WA
   ============================================================ */

// ===========================
// REFERENSI ELEMEN HTML
// ===========================
const sidebar      = document.getElementById('sidebar');
const topbarToggle = document.getElementById('topbar-toggle');
const logoutBtn    = document.getElementById('logout-btn');
const sbUserName   = document.getElementById('sb-user-name');
const sbAvatar     = document.getElementById('sb-avatar');
const pageTitle    = document.getElementById('page-title');
const waStatusEl   = document.getElementById('wa-status');
const waLabel      = document.getElementById('wa-label');

// Elemen Antrian
const queueTbody   = document.getElementById('queue-tbody');
const refreshBtn   = document.getElementById('refresh-btn');

// Elemen Notif WA
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
// STATE
// ===========================
let currentPage     = 'beranda';
let refreshInterval = null;
let qrPollInterval  = null;

const pageTitles = {
  beranda: 'Beranda',
  antrian: 'Antrian',
  notif:   'Notifikasi WA',
};

// ===========================
// NAVIGASI
// ===========================
function navigateTo(page) {
  currentPage = page;

  const urls = { beranda: '/cs', antrian: '/cs/antrian', notif: '/cs/notif' };
  history.pushState({}, '', urls[page] || '/cs');

  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );

  document.querySelectorAll('.sub-page').forEach(el => el.classList.remove('active'));
  const subPage = document.getElementById('page-' + page);
  if (subPage) subPage.classList.add('active');

  if (pageTitle) pageTitle.textContent = pageTitles[page] || page;

  if (page !== 'notif' && qrPollInterval) {
    clearInterval(qrPollInterval);
    qrPollInterval = null;
  }

  if (page === 'beranda') loadStatistik();
  if (page === 'antrian') { loadQueueData(); resetFormBuat(); }
  if (page === 'notif')   startQRPolling();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(el.dataset.page);
  });
});

// ===========================
// SIDEBAR TOGGLE
// ===========================
topbarToggle?.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

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
// BERANDA: STATISTIK
// ===========================
async function loadStatistik() {
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
  } catch {}
}

const layananColors = { Tabungan: '#2563eb', Kredit: '#ea580c', Umum: '#16a34a' };

function renderLayananCards(perLayanan, totalAll) {
  const grid = document.getElementById('layanan-grid');
  if (!grid) return;
  if (!perLayanan.length) {
    grid.innerHTML = '<div class="layanan-card loading-card">Tidak ada data layanan</div>';
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
  if (!queueTbody) return;
  try {
    const result = await api('GET', '/antrian/list');
    if (!result.success) {
      if (result.message?.includes('Token')) {
        clearSession(); window.location.href = '/login';
      }
      return;
    }

    const items = result.data.antrian_menunggu ?? [];
    if (!items.length) {
      queueTbody.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada antrian menunggu saat ini</td></tr>`;
      return;
    }

    queueTbody.innerHTML = items.map(item => `
      <tr>
        <td><span class="antrian-number">${item.nomor_antrian}</span></td>
        <td><strong>${escHtml(getNamaNasabah(item))}</strong></td>
        <td>${layananBadge(item.layanan)}</td>
        <td>${formatWaktu(item.created_at)}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batalkan</button>
        </td>
      </tr>`).join('');
  } catch {}
}

refreshBtn?.addEventListener('click', () => { loadQueueData(); });

// ===========================
// ANTRIAN: BATALKAN
// ===========================
async function batalAntrian(id, nomor) {
  if (!confirm(`Batalkan antrian nomor ${nomor}?`)) return;
  try {
    const result = await api('PUT', `/antrian/batal/${id}`);
    if (result.success) {
      loadQueueData();
      loadStatistik();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch { alert('Terjadi kesalahan koneksi'); }
}

// ===========================
// ANTRIAN: BUAT BARU
// ===========================
function resetFormBuat() {
  const tiketSection = document.getElementById('tiket-section');
  const formBuat     = document.getElementById('form-buat');
  const buatBtn      = document.getElementById('buat-btn');
  const resultEl     = document.getElementById('buat-result');

  if (tiketSection) tiketSection.classList.add('hidden');
  if (formBuat)     formBuat.style.display = '';
  if (buatBtn)      buatBtn.classList.remove('hidden');
  if (resultEl)     resultEl.classList.add('hidden');

  const nama    = document.getElementById('cs-nama');
  const nohp    = document.getElementById('cs-nohp');
  const layanan = document.getElementById('cs-layanan');
  if (nama)    nama.value    = '';
  if (nohp)    nohp.value    = '';
  if (layanan) layanan.value = 'Tabungan';
}

document.getElementById('buat-btn')?.addEventListener('click', async () => {
  const nama     = document.getElementById('cs-nama').value.trim();
  const no_hp    = document.getElementById('cs-nohp').value.trim();
  const layanan  = document.getElementById('cs-layanan').value;
  const resultEl = document.getElementById('buat-result');
  const buatBtn  = document.getElementById('buat-btn');

  if (!nama) { showAlert(resultEl, 'Nama nasabah wajib diisi', 'error'); return; }

  buatBtn.disabled = true;
  buatBtn.textContent = 'Membuat...';

  try {
    const result = await api('POST', '/antrian/ambil', {
      nama, no_hp: no_hp || undefined, layanan,
    });

    if (!result.success) {
      showAlert(resultEl, result.message || 'Gagal membuat antrian', 'error');
      return;
    }

    const nomorAntrian = result.data.nomor_antrian ?? result.data.antrian?.nomor_antrian;
    document.getElementById('tiket-nomor').textContent   = nomorAntrian ?? '—';
    document.getElementById('tiket-layanan').textContent = `Layanan: ${layanan}`;
    document.getElementById('tiket-nama').textContent    = `Nasabah: ${nama}`;

    document.getElementById('form-buat').style.display = 'none';
    document.getElementById('tiket-section').classList.remove('hidden');
    loadQueueData();
    loadStatistik();
  } catch {
    showAlert(resultEl, 'Terjadi kesalahan koneksi', 'error');
  } finally {
    buatBtn.disabled = false;
    buatBtn.textContent = 'Buat Antrian';
  }
});

document.getElementById('buat-lagi-btn')?.addEventListener('click', resetFormBuat);

// ===========================
// WA: STATUS TOPBAR
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
// WA: QR POLLING
// ===========================
function startQRPolling() {
  fetchQR();
  qrPollInterval = setInterval(fetchQR, 4000);
}

async function fetchQR() {
  try {
    const result = await api('GET', '/notif/wa/qr');
    if (!result.success) return;

    const { connected, qr, status, error } = result.data;

    waStatusEl.className = 'wa-dot ' + (connected ? 'wa-online' : 'wa-offline');
    waLabel.textContent  = connected ? 'WhatsApp Terhubung' : 'WhatsApp';

    if (connected) {
      waConnectedView.classList.remove('hidden');
      waQrView.classList.add('hidden');
      if (qrPollInterval) { clearInterval(qrPollInterval); qrPollInterval = null; }
    } else {
      waConnectedView.classList.add('hidden');
      waQrView.classList.remove('hidden');

      if (error) {
        waErrorBanner.textContent = '⚠ ' + error;
        waErrorBanner.classList.remove('hidden');
      } else {
        waErrorBanner.classList.add('hidden');
      }

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
          : 'Menunggu kode QR...';
        qrHint.textContent = 'Menunggu kode QR dari server...';
      }
    }
  } catch {}
}

// ===========================
// WA: PAIRING CODE
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
// WA: PUTUSKAN KONEKSI
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
  finally { waDisconnectBtn.disabled = false; waDisconnectBtn.textContent = 'Putuskan Koneksi'; }
});

// ===========================
// WA: KIRIM PESAN UJI
// ===========================
document.getElementById('test-wa-btn')?.addEventListener('click', async () => {
  const phone   = document.getElementById('wa-phone').value;
  const message = document.getElementById('wa-message').value;
  const waResult = document.getElementById('wa-result');
  const btn      = document.getElementById('test-wa-btn');
  if (!phone) { showAlert(waResult, 'Nomor HP wajib diisi', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try {
    const result = await api('POST', '/notif/test-wa', { phone, message });
    showAlert(waResult, result.message, result.success ? 'success' : 'error');
  } catch { showAlert(waResult, 'Gagal mengirim', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Kirim via WhatsApp'; }
});

// ===========================
// PUSH: NOTIFIKASI UJI
// ===========================
document.getElementById('test-push-btn')?.addEventListener('click', async () => {
  const playerId  = document.getElementById('push-player-id').value;
  const nomor     = document.getElementById('push-nomor').value;
  const pushResult = document.getElementById('push-result');
  const btn        = document.getElementById('test-push-btn');
  if (!playerId) { showAlert(pushResult, 'Player ID wajib diisi', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try {
    const result = await api('POST', '/notif/test-push', { player_id: playerId, nomor_antrian: nomor || 0 });
    showAlert(pushResult, result.message, result.success ? 'success' : 'error');
  } catch { showAlert(pushResult, 'Gagal mengirim', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Kirim Notifikasi Push'; }
});

// ===========================
// INISIALISASI
// ===========================
(async function init() {
  if (!loadSession()) {
    window.location.href = '/login';
    return;
  }

  try {
    const result = await api('GET', '/auth/me');
    if (!result.success || result.data.profile?.role !== 'cs') {
      clearSession();
      window.location.href = '/login';
      return;
    }
    userProfile = result.data.profile;
  } catch {
    clearSession();
    window.location.href = '/login';
    return;
  }

  const nama = userProfile.nama || 'CS';
  sbUserName.textContent = nama;
  sbAvatar.textContent   = nama.charAt(0).toUpperCase();

  const path = window.location.pathname;
  const pathPage = { '/cs/antrian': 'antrian', '/cs/notif': 'notif' }[path] ?? 'beranda';
  navigateTo(pathPage);

  refreshInterval = setInterval(() => {
    if (currentPage === 'beranda') loadStatistik();
    if (currentPage === 'antrian') loadQueueData();
    checkWAStatus();
  }, 8000);
})();

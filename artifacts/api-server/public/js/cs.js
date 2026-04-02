/* ============================================================
   CS.JS — Dashboard Customer Service
   ============================================================ */

const COUNTER_LAYANAN = 'CS';

const sidebar         = document.getElementById('sidebar');
const topbarToggle    = document.getElementById('topbar-toggle');
const logoutBtn       = document.getElementById('logout-btn');
const sbUserName      = document.getElementById('sb-user-name');
const sbAvatar        = document.getElementById('sb-avatar');
const pageTitle       = document.getElementById('page-title');
const topbarDate      = document.getElementById('topbar-date');
const waBadgeEl       = document.getElementById('wa-badge');
const waDotEl         = document.getElementById('wa-dot');
const waLabelEl       = document.getElementById('wa-label');
const waDotSide       = document.getElementById('wa-dot-side');
const clockEl         = document.getElementById('clock');

const currentNumberEl = document.getElementById('current-number');
const currentInfoEl   = document.getElementById('current-info');
const totalMenunggu   = document.getElementById('total-menunggu');
const queueTbody      = document.getElementById('queue-tbody');
const panggilBtn      = document.getElementById('panggil-btn');
const skipDashBtn     = document.getElementById('skip-dash-btn');
const panggilFeedback = document.getElementById('panggil-feedback');
const refreshBtn      = document.getElementById('refresh-btn');
const navBadge        = document.getElementById('nav-antrian-badge');

const aCurNum           = document.getElementById('a-cur-num');
const aCurName          = document.getElementById('a-cur-name');
const aCurSvc           = document.getElementById('a-cur-svc');
const aTimer            = document.getElementById('a-timer');
const selesaiBtn        = document.getElementById('selesai-btn');
const skipLayaniBtn     = document.getElementById('skip-layani-btn');
const panggilAntrianBtn = document.getElementById('panggil-antrian-btn');
const panggilSideBtn    = document.getElementById('panggil-side-btn');
const aTotalBadge       = document.getElementById('a-total-badge');
const queueListWrap     = document.getElementById('queue-list-wrap');
const antrianRefreshBtn = document.getElementById('antrian-refresh-btn');

const loketNameDisplay = document.getElementById('loket-name-display');
const loketUserDisplay = document.getElementById('loket-user-display');
const msSelesai        = document.getElementById('ms-selesai');
const msMenunggu       = document.getElementById('ms-menunggu');
const msDipanggil      = document.getElementById('ms-dipanggil');
const msBatal          = document.getElementById('ms-batal');
const nextNum          = document.getElementById('next-num');
const nextName         = document.getElementById('next-name');
const nextSvc          = document.getElementById('next-svc');

const riwayatTbody         = document.getElementById('riwayat-tbody');
const riwayatFooter        = document.getElementById('riwayat-footer');
const riwayatRefreshBtn    = document.getElementById('riwayat-refresh-btn');
const riwayatFilterStatus  = document.getElementById('riwayat-filter-status');
const riwayatDateLabel     = document.getElementById('riwayat-date-label');

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

let currentPage         = 'dashboard';
let refreshInterval     = null;
let qrPollInterval      = null;
let layaniTimerStart    = null;
let layaniTimerInterval = null;
let currentLayaniId     = null;

const pageTitles = {
  dashboard: 'Dashboard',
  antrian:   'Antrian',
  riwayat:   'Riwayat',
  notif:     'Test Notif WA',
};

// ===========================
// JAM BERJALAN
// ===========================
function startClock() {
  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const ss = String(now.getSeconds()).padStart(2,'0');
    if (clockEl) clockEl.textContent = `${hh}:${mm}:${ss}`;
  }
  tick();
  setInterval(tick, 1000);
}

function setTopbarDate() {
  const now = new Date();
  const label = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (topbarDate) topbarDate.textContent = label;
  if (riwayatDateLabel) riwayatDateLabel.textContent = 'Data antrian ' + now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ===========================
// NAVIGASI
// ===========================
function navigateTo(page) {
  currentPage = page;

  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  document.querySelectorAll('.sub-page').forEach(el => el.classList.remove('active'));
  const subPage = document.getElementById('page-' + page);
  if (subPage) subPage.classList.add('active');

  if (pageTitle) pageTitle.textContent = pageTitles[page] || page;

  if (page !== 'notif' && qrPollInterval) { clearInterval(qrPollInterval); qrPollInterval = null; }

  if (page === 'dashboard') { loadStatistik(); loadQueueData(); }
  if (page === 'antrian')   loadAntrianPage();
  if (page === 'riwayat')   loadRiwayat();
  if (page === 'notif')     startQRPolling();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); navigateTo(el.dataset.page); });
});

topbarToggle?.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

logoutBtn?.addEventListener('click', () => {
  if (confirm('Yakin ingin keluar?')) { clearSession(); window.location.href = '/login'; }
});

// ===========================
// STATISTIK
// ===========================
async function loadStatistik() {
  try {
    const result = await api('GET', '/antrian/statistik');
    if (!result.success) return;
    const d = result.data;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    setEl('stat-total',    d.total    ?? 0);
    setEl('stat-menunggu', d.menunggu ?? 0);
    setEl('stat-selesai',  d.selesai  ?? 0);
    setEl('stat-batal',    d.batal    ?? 0);
  } catch {}
}

// ===========================
// QUEUE DATA
// ===========================
async function loadQueueData() {
  try {
    const result = await api('GET', `/antrian/list?layanan=${encodeURIComponent(COUNTER_LAYANAN)}`);
    if (!result.success) {
      if (result.message?.includes('Token')) { clearSession(); window.location.href = '/login'; }
      return;
    }

    const { sedang_dilayani, antrian_menunggu, antrian_dipanggil, total_menunggu } = result.data;

    const aktif = sedang_dilayani || antrian_dipanggil?.[0] || null;
    if (aktif) {
      if (currentNumberEl) currentNumberEl.textContent = aktif.nomor_antrian;
      if (currentInfoEl)   currentInfoEl.textContent   = `${getNamaNasabah(aktif)} · ${aktif.layanan === 'CS' ? 'Customer Service' : aktif.layanan}`;
    } else {
      if (currentNumberEl) currentNumberEl.textContent = '—';
      if (currentInfoEl)   currentInfoEl.textContent   = 'Belum ada antrian dipanggil';
    }

    if (totalMenunggu) totalMenunggu.textContent = total_menunggu ?? 0;
    if (navBadge) {
      const n = total_menunggu ?? 0;
      navBadge.textContent = n;
      navBadge.style.display = n > 0 ? '' : 'none';
    }

    renderQueueTable(antrian_menunggu);
  } catch {}
}

function renderQueueTable(antrian) {
  if (!queueTbody) return;
  if (!antrian?.length) {
    queueTbody.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada antrian CS menunggu saat ini</td></tr>`;
    return;
  }
  queueTbody.innerHTML = antrian.map(item => `
    <tr>
      <td><span class="antrian-number">${item.nomor_antrian}</span></td>
      <td><strong>${escHtml(getNamaNasabah(item))}</strong></td>
      <td>${layananBadge(item.layanan)}</td>
      <td>${formatWaktu(item.created_at)}</td>
      <td>
        <button class="btn btn-done"   onclick="selesaiAntrian('${item.id}',${item.nomor_antrian})">Selesai</button>
        <button class="btn btn-danger" onclick="skipAntrian('${item.id}',${item.nomor_antrian})">Skip</button>
      </td>
    </tr>`).join('');
}

// ===========================
// PANGGIL & SKIP
// ===========================
panggilBtn?.addEventListener('click', () => panggilBerikutnya(panggilBtn, panggilFeedback));
skipDashBtn?.addEventListener('click', () => skipBerikutnya());

async function panggilBerikutnya(btn, feedbackEl) {
  if (btn) { btn.disabled = true; btn.textContent = 'Memanggil...'; }
  try {
    const result = await api('PUT', '/antrian/panggil', { layanan: COUNTER_LAYANAN });
    if (result.success) {
      tampilFeedback(feedbackEl, result.message);
      loadQueueData(); loadStatistik();
      if (currentPage === 'antrian') loadAntrianPage();
    } else {
      tampilFeedback(feedbackEl, result.message, true);
    }
  } catch { tampilFeedback(feedbackEl, 'Terjadi kesalahan koneksi', true); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Panggil Berikutnya'; } }
}

async function skipBerikutnya() {
  try {
    const result = await api('GET', `/antrian/list?layanan=${encodeURIComponent(COUNTER_LAYANAN)}`);
    const list = result.data?.antrian_menunggu ?? [];
    if (!list.length) { alert('Tidak ada antrian untuk diskip'); return; }
    await skipAntrian(list[0].id, list[0].nomor_antrian);
  } catch {}
}

function tampilFeedback(el, pesan, isError = false) {
  if (!el) return;
  el.textContent = pesan;
  el.className = 'feedback ' + (isError ? 'feedback-error' : 'feedback-success');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

refreshBtn?.addEventListener('click', () => { loadQueueData(); loadStatistik(); });

// ===========================
// ANTRIAN PAGE
// ===========================
async function loadAntrianPage() {
  try {
    const result = await api('GET', `/antrian/list?layanan=${encodeURIComponent(COUNTER_LAYANAN)}`);
    if (!result.success) return;

    const { sedang_dilayani, antrian_menunggu, antrian_dipanggil, total_menunggu } = result.data;
    const aktif = sedang_dilayani || antrian_dipanggil?.[0] || null;

    if (aktif) {
      if (aCurNum)  aCurNum.textContent  = aktif.nomor_antrian;
      if (aCurName) aCurName.textContent = getNamaNasabah(aktif);
      if (aCurSvc)  aCurSvc.textContent  = 'Customer Service';
      if (selesaiBtn)    selesaiBtn.disabled    = false;
      if (skipLayaniBtn) skipLayaniBtn.disabled = false;
      currentLayaniId = aktif.id;
      startLayaniTimer(aktif.updated_at || aktif.created_at);
    } else {
      if (aCurNum)  aCurNum.textContent  = '—';
      if (aCurName) aCurName.textContent = 'Belum ada yang dipanggil';
      if (aCurSvc)  aCurSvc.textContent  = 'Tekan "Panggil" untuk memulai';
      if (aTimer)   aTimer.textContent   = '—';
      if (selesaiBtn)    selesaiBtn.disabled    = true;
      if (skipLayaniBtn) skipLayaniBtn.disabled = true;
      currentLayaniId = null;
      stopLayaniTimer();
    }

    if (aTotalBadge) aTotalBadge.textContent = `(${total_menunggu ?? 0} orang)`;

    const next = antrian_menunggu?.[0];
    if (next) {
      if (nextNum)  nextNum.textContent  = next.nomor_antrian;
      if (nextName) nextName.textContent = getNamaNasabah(next);
      if (nextSvc)  nextSvc.textContent  = `CS · Tunggu ${getWaitingMins(next.created_at)} mnt`;
      if (panggilSideBtn) panggilSideBtn.textContent = `Panggil #${next.nomor_antrian}`;
    } else {
      if (nextNum)  nextNum.textContent  = '—';
      if (nextName) nextName.textContent = 'Tidak ada antrian';
      if (nextSvc)  nextSvc.textContent  = '—';
      if (panggilSideBtn) panggilSideBtn.textContent = 'Panggil Berikutnya';
    }

    renderQueueList(antrian_menunggu);
    loadMiniStat();
  } catch {}
}

async function loadMiniStat() {
  try {
    const result = await api('GET', '/antrian/statistik');
    if (!result.success) return;
    const d = result.data;
    if (msSelesai)   msSelesai.textContent   = d.selesai   ?? 0;
    if (msMenunggu)  msMenunggu.textContent  = d.menunggu  ?? 0;
    if (msDipanggil) msDipanggil.textContent = d.dipanggil ?? 0;
    if (msBatal)     msBatal.textContent     = d.batal     ?? 0;
  } catch {}
}

function renderQueueList(antrian) {
  if (!queueListWrap) return;
  if (!antrian?.length) {
    queueListWrap.innerHTML = `<p style="text-align:center;color:var(--gray-400);padding:24px;font-size:13px;">Tidak ada antrian CS menunggu</p>`;
    return;
  }
  queueListWrap.innerHTML = antrian.map((item, idx) => `
    <div class="queue-item">
      <div class="queue-pos">${idx + 1}</div>
      <div class="queue-info">
        <div class="queue-name">${escHtml(getNamaNasabah(item))}</div>
        <div class="queue-meta">Customer Service · Ambil ${formatWaktu(item.created_at)}</div>
      </div>
      <div>
        <div class="queue-num">${item.nomor_antrian}</div>
        <div class="queue-wait">${getWaitingMins(item.created_at)} mnt</div>
      </div>
    </div>`).join('');
}

function getWaitingMins(createdAt) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
}

function startLayaniTimer(startAt) {
  stopLayaniTimer();
  layaniTimerStart = startAt ? new Date(startAt) : new Date();
  layaniTimerInterval = setInterval(() => {
    const diff = Math.floor((Date.now() - layaniTimerStart.getTime()) / 60000);
    if (aTimer) aTimer.textContent = diff;
  }, 1000);
  const diff = Math.floor((Date.now() - layaniTimerStart.getTime()) / 60000);
  if (aTimer) aTimer.textContent = diff;
}

function stopLayaniTimer() {
  if (layaniTimerInterval) { clearInterval(layaniTimerInterval); layaniTimerInterval = null; }
}

[panggilAntrianBtn, panggilSideBtn].forEach(btn => {
  btn?.addEventListener('click', async () => {
    if (!btn) return;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Memanggil...';
    try {
      const result = await api('PUT', '/antrian/panggil', { layanan: COUNTER_LAYANAN });
      if (result.success) { loadAntrianPage(); loadQueueData(); loadStatistik(); }
      else { alert(result.message); }
    } catch {}
    finally { btn.disabled = false; btn.textContent = orig; }
  });
});

antrianRefreshBtn?.addEventListener('click', () => loadAntrianPage());

// ===========================
// SELESAI & SKIP
// ===========================
async function selesaiSedangDilayani() {
  if (!currentLayaniId) return;
  try {
    const result = await api('PUT', `/antrian/selesai/${currentLayaniId}`);
    if (result.success) { loadAntrianPage(); loadQueueData(); loadStatistik(); }
    else { alert('Gagal: ' + result.message); }
  } catch { alert('Terjadi kesalahan'); }
}

async function skipSedangDilayani() {
  if (!currentLayaniId) return;
  const nomor = aCurNum?.textContent;
  if (!confirm(`Skip antrian #${nomor}? Anda punya 30 detik untuk membatalkan.`)) return;
  const savedId = currentLayaniId;
  try {
    const result = await api('PUT', `/antrian/batal/${savedId}`);
    if (result.success) {
      showUndoToast(savedId, nomor);
      loadAntrianPage(); loadQueueData(); loadStatistik();
    } else { alert('Gagal: ' + result.message); }
  } catch { alert('Terjadi kesalahan'); }
}

async function selesaiAntrian(id, nomor) {
  if (!confirm(`Tandai antrian #${nomor} selesai?`)) return;
  try {
    const result = await api('PUT', `/antrian/selesai/${id}`);
    if (result.success) { loadQueueData(); loadStatistik(); if (currentPage === 'antrian') loadAntrianPage(); if (currentPage === 'riwayat') loadRiwayat(); }
    else { alert('Gagal: ' + result.message); }
  } catch { alert('Terjadi kesalahan'); }
}

async function skipAntrian(id, nomor) {
  if (!confirm(`Skip antrian #${nomor}? Anda punya 30 detik untuk membatalkan.`)) return;
  try {
    const result = await api('PUT', `/antrian/batal/${id}`);
    if (result.success) {
      showUndoToast(id, nomor);
      loadQueueData(); loadStatistik();
      if (currentPage === 'antrian') loadAntrianPage();
      if (currentPage === 'riwayat') loadRiwayat();
    } else { alert('Gagal: ' + result.message); }
  } catch { alert('Terjadi kesalahan'); }
}

// ===========================
// RIWAYAT
// ===========================
async function loadRiwayat() {
  const status = riwayatFilterStatus?.value ?? '';
  let endpoint = `/antrian/list?all=true&layanan=${encodeURIComponent(COUNTER_LAYANAN)}`;
  if (status) endpoint += `&status=${encodeURIComponent(status)}`;

  if (riwayatTbody) riwayatTbody.innerHTML = `<tr class="empty-row"><td colspan="5">Memuat data...</td></tr>`;

  try {
    const result = await api('GET', endpoint);
    if (!result.success) return;
    const items = result.data.antrian ?? [];
    const total = result.data.total ?? items.length;

    const selesai  = items.filter(i => i.status === 'selesai').length;
    const menunggu = items.filter(i => i.status === 'menunggu' || i.status === 'dipanggil').length;
    const batal    = items.filter(i => i.status === 'batal').length;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('r-total',    total);
    setEl('r-selesai',  selesai);
    setEl('r-menunggu', menunggu);
    setEl('r-batal',    batal);
    if (riwayatFooter) riwayatFooter.textContent = `Total: ${total} antrian`;

    if (!riwayatTbody) return;
    if (!items.length) {
      riwayatTbody.innerHTML = `<tr class="empty-row"><td colspan="5">Tidak ada data antrian CS hari ini</td></tr>`;
      return;
    }

    riwayatTbody.innerHTML = items.map(item => `
      <tr>
        <td><span class="antrian-number">${item.nomor_antrian}</span></td>
        <td><strong>${escHtml(getNamaNasabah(item))}</strong></td>
        <td>${statusBadge(item.status)}</td>
        <td>${formatWaktu(item.created_at)}</td>
        <td>
          ${item.status === 'menunggu'
            ? `<button class="btn btn-done" onclick="selesaiAntrian('${item.id}',${item.nomor_antrian})">Selesai</button>
               <button class="btn btn-danger" onclick="skipAntrian('${item.id}',${item.nomor_antrian})">Skip</button>`
            : item.status === 'dipanggil'
              ? `<button class="btn btn-done" onclick="selesaiAntrian('${item.id}',${item.nomor_antrian})">Selesai</button>`
              : '—'}
        </td>
      </tr>`).join('');
  } catch {}
}

riwayatRefreshBtn?.addEventListener('click', loadRiwayat);
riwayatFilterStatus?.addEventListener('change', loadRiwayat);

// ===========================
// WA STATUS
// ===========================
async function checkWAStatus() {
  try {
    const result = await api('GET', '/notif/status');
    if (!result.success) return;
    const connected = result.data.whatsapp_connected;
    if (waBadgeEl) waBadgeEl.className = 'badge-wa ' + (connected ? '' : 'badge-wa-offline');
    if (waLabelEl) waLabelEl.textContent = connected ? 'WhatsApp Terhubung' : 'WhatsApp';
    if (waDotSide) waDotSide.style.background = connected ? '#22C55E' : '#A8A29E';
  } catch {}
}

// ===========================
// WA QR POLLING
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

    if (waBadgeEl) waBadgeEl.className = 'badge-wa ' + (connected ? '' : 'badge-wa-offline');
    if (waLabelEl) waLabelEl.textContent = connected ? 'WhatsApp Terhubung' : 'WhatsApp';
    if (waDotSide) waDotSide.style.background = connected ? '#22C55E' : '#A8A29E';

    if (connected) {
      waConnectedView?.classList.remove('hidden');
      waQrView?.classList.add('hidden');
      if (qrPollInterval) { clearInterval(qrPollInterval); qrPollInterval = null; }
    } else {
      waConnectedView?.classList.add('hidden');
      waQrView?.classList.remove('hidden');
      if (error) { if (waErrorBanner) { waErrorBanner.textContent = 'Error: ' + error; waErrorBanner.classList.remove('hidden'); } }
      else { waErrorBanner?.classList.add('hidden'); }
      if (qr) {
        qrLoading?.classList.add('hidden');
        if (qrImg) { qrImg.src = qr; qrImg.classList.remove('hidden'); }
        if (qrHint) qrHint.textContent = 'QR diperbarui otomatis. Scan sebelum kedaluwarsa.';
      } else {
        qrLoading?.classList.remove('hidden');
        if (qrImg) qrImg.classList.add('hidden');
        if (qrLoadingText) qrLoadingText.textContent = status === 'error' ? 'Koneksi gagal — coba kode pairing' : 'Menunggu QR code...';
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
      showAlert(pairingResult, `Kode pairing: <strong style="font-size:20px;letter-spacing:3px;font-family:monospace">${result.data.code}</strong><br><small>Masukkan di WhatsApp → Perangkat Tertaut</small>`, 'success', true);
    } else { showAlert(pairingResult, result.message, 'error'); }
  } catch { showAlert(pairingResult, 'Gagal meminta kode pairing', 'error'); }
  finally { pairingBtn.disabled = false; pairingBtn.textContent = 'Minta Kode'; }
});

waDisconnectBtn?.addEventListener('click', async () => {
  if (!confirm('Putuskan koneksi WhatsApp?')) return;
  waDisconnectBtn.disabled = true; waDisconnectBtn.textContent = 'Memutuskan...';
  try {
    await api('POST', '/notif/wa/disconnect');
    waConnectedView?.classList.add('hidden');
    waQrView?.classList.remove('hidden');
    qrLoading?.classList.remove('hidden');
    if (qrImg) qrImg.classList.add('hidden');
    startQRPolling();
  } catch {}
  finally { waDisconnectBtn.disabled = false; waDisconnectBtn.textContent = 'Putuskan & Reset QR'; }
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
  finally { testWaBtn.disabled = false; testWaBtn.textContent = 'Kirim via WhatsApp'; }
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
  finally { testPushBtn.disabled = false; testPushBtn.textContent = 'Kirim Push Notification'; }
});

// ===========================
// AUTO-LOGOUT (inaktif 30 menit)
(function setupAutoLogout() {
  const TIMEOUT_MS = 30 * 60 * 1000;
  let idleTimer = null;
  function resetTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      clearSession();
      alert('Sesi Anda telah berakhir karena tidak aktif selama 30 menit. Silakan login kembali.');
      window.location.href = '/login';
    }, TIMEOUT_MS);
  }
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt =>
    document.addEventListener(evt, resetTimer, { passive: true })
  );
  resetTimer();
})();

// UNDO-SKIP TOAST
let undoToast = null;
let undoCountdown = null;

function showUndoToast(id, nomor) {
  clearUndoToast();
  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span>Antrian #${nomor} diskip</span>
    <button class="undo-btn" id="undo-skip-btn">Batalkan <span id="undo-count">30</span>s</button>
  `;
  document.body.appendChild(toast);
  undoToast = toast;
  let sisa = 30;
  const countEl = toast.querySelector('#undo-count');
  undoCountdown = setInterval(() => {
    sisa--;
    if (countEl) countEl.textContent = sisa;
    if (sisa <= 0) clearUndoToast();
  }, 1000);
  toast.querySelector('#undo-skip-btn')?.addEventListener('click', async () => {
    clearUndoToast();
    try {
      const result = await api('PUT', `/antrian/restore/${id}`);
      if (result.success) {
        loadQueueData(); loadStatistik();
        if (currentPage === 'antrian') loadAntrianPage();
        if (currentPage === 'riwayat') loadRiwayat();
        showInfoBanner(`Antrian #${nomor} berhasil dipulihkan`);
      } else { showInfoBanner(result.message, true); }
    } catch { showInfoBanner('Gagal memulihkan antrian', true); }
  });
  setTimeout(clearUndoToast, 32000);
}

function clearUndoToast() {
  if (undoCountdown) { clearInterval(undoCountdown); undoCountdown = null; }
  if (undoToast) { undoToast.remove(); undoToast = null; }
}

function showInfoBanner(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'undo-toast' + (isError ? ' undo-toast-error' : '');
  el.innerHTML = `<span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// INISIALISASI
// ===========================
(async function init() {
  if (!loadSession()) { window.location.href = '/login'; return; }

  try {
    const result = await api('GET', '/auth/me');
    if (!result.success || result.data.profile?.role !== 'cs') {
      clearSession(); window.location.href = '/login'; return;
    }
    userProfile = result.data.profile;
  } catch { clearSession(); window.location.href = '/login'; return; }

  const nama = userProfile.nama || 'CS';
  if (sbUserName) sbUserName.textContent = nama;
  if (sbAvatar)   sbAvatar.textContent   = nama.charAt(0).toUpperCase();
  if (loketNameDisplay) loketNameDisplay.textContent = 'Customer Service — Aktif';
  if (loketUserDisplay) loketUserDisplay.textContent = `${nama} · CS`;

  startClock();
  setTopbarDate();

  navigateTo('dashboard');
  checkWAStatus();

  refreshInterval = setInterval(() => {
    if (currentPage === 'dashboard') { loadStatistik(); loadQueueData(); }
    if (currentPage === 'antrian')   loadAntrianPage();
    checkWAStatus();
  }, 5000);
})();

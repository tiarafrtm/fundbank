/* ============================================================
   ADMIN.JS — Logika Panel Administrator
   Dimuat di: admin.html
   ============================================================ */

// State global
let currentPage    = 'dashboard';
let cabangList     = [];   // Cache daftar cabang
let laporanOffset  = 0;
const LAPORAN_LIMIT = 50;
let laporanTotal   = 0;
let _toastTimer    = null;

// ===========================
// TOAST NOTIFIKASI
// ===========================
function showToast(msg, type = 'success') {
  const el   = document.getElementById('admin-toast');
  const icon = document.getElementById('admin-toast-icon');
  const txt  = document.getElementById('admin-toast-msg');
  if (!el) return;

  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.style.background = type === 'success' ? '#15803d' : type === 'error' ? '#dc2626' : '#1c1917';
  txt.textContent = msg;
  el.style.display = 'flex';

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// ===========================
// NAVIGASI HALAMAN
// ===========================
function navigateTo(page) {
  currentPage = page;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Tampilkan halaman yang dipilih
  document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  // Update topbar title
  const titles = { dashboard: 'Dashboard', cabang: 'Kelola Cabang', staff: 'Kelola Staff', nasabah: 'Kelola Nasabah', jadwal: 'Kelola Jadwal', laporan: 'Laporan', docs: 'Docs API' };
  const titleEl = document.getElementById('topbar-page-title');
  if (titleEl) titleEl.textContent = titles[page] ?? 'Admin';

  // Load data sesuai halaman
  if (page === 'dashboard') loadDashboard();
  else if (page === 'cabang')  loadCabang();
  else if (page === 'staff')   loadStaff();
  else if (page === 'nasabah') loadNasabah();
  else if (page === 'jadwal')  initJadwal();
  else if (page === 'laporan') initLaporan();
  else if (page === 'docs')    initDocs();
}

// ===========================
// DASHBOARD
// ===========================
async function loadDashboard() {
  // Tanggal hari ini
  const tgl = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const el = document.getElementById('dash-date');
  if (el) el.textContent = tgl;

  try {
    const result = await api('GET', '/admin/statistik');
    if (!result.success) return;

    const { total, menunggu, dipanggil, selesai, batal, per_cabang } = result.data;

    // Global stats — update elemen individual
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('s-total',  total);
    setEl('s-selesai', selesai);
    setEl('s-aktif',  menunggu + dipanggil);
    setEl('s-batal',  batal);

    // Per-cabang cards
    if (!per_cabang || per_cabang.length === 0) {
      document.getElementById('cabang-stats').innerHTML = `<div class="empty-state">Belum ada data cabang. Tambahkan cabang terlebih dahulu.</div>`;
      return;
    }

    document.getElementById('cabang-stats').innerHTML = per_cabang.map(cb => `
      <div class="cabang-stat-card">
        <div class="cs-title">${escHtml(cb.cabang_nama)}</div>
        <div class="cs-kode">${escHtml(cb.cabang_kode)}</div>
        <div class="cs-row"><span>Total antrian</span><strong>${cb.total}</strong></div>
        <div class="cs-row"><span>Selesai</span><strong style="color:var(--success)">${cb.selesai}</strong></div>
        <div class="cs-row"><span>Menunggu</span><strong style="color:var(--orange)">${cb.menunggu}</strong></div>
        <div class="cs-row"><span>Dibatalkan</span><strong style="color:var(--danger)">${cb.batal}</strong></div>
        <div class="cs-row"><span>Rata-rata layanan</span><strong>${cb.avg_layanan_menit != null ? cb.avg_layanan_menit + ' menit' : '—'}</strong></div>
        <div class="cs-row"><span>Staff terdaftar</span><strong>${cb.total_staff}</strong></div>
      </div>
    `).join('');

  } catch (e) {
    document.getElementById('global-stats').innerHTML = `<div class="stat-card"><div class="stat-lbl" style="color:red">Gagal memuat data</div></div>`;
  }
}

// ===========================
// KELOLA CABANG
// ===========================
async function loadCabang() {
  document.getElementById('cabang-table-body').innerHTML = `<tr><td colspan="6" class="empty-state">Memuat...</td></tr>`;
  try {
    const result = await api('GET', '/admin/cabang');
    if (!result.success) { showCabangError('Gagal memuat data cabang'); return; }

    cabangList = result.data.cabang ?? [];
    renderCabangTable(cabangList);
    refreshCabangDropdowns();
  } catch { showCabangError('Terjadi kesalahan koneksi'); }
}

function renderCabangTable(list) {
  if (!list.length) {
    document.getElementById('cabang-table-body').innerHTML = `<tr class="empty-row"><td colspan="6">Belum ada cabang. Klik "+ Tambah Cabang" untuk menambahkan.</td></tr>`;
    return;
  }
  document.getElementById('cabang-table-body').innerHTML = list.map(cb => `
    <tr>
      <td class="text-muted">${cb.id}</td>
      <td style="font-weight:600">${escHtml(cb.nama)}</td>
      <td><span class="badge-loket-small">${escHtml(cb.kode)}</span></td>
      <td class="text-muted">${escHtml(cb.alamat ?? '—')}</td>
      <td><span class="status-badge-table ${cb.is_active ? 'status-selesai' : 'status-batal'}">${cb.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-outline btn-sm" onclick="openModalCabang(${JSON.stringify(cb).replace(/"/g,'&quot;')})">Edit</button>
          <button class="btn btn-sm ${cb.is_active ? 'btn-danger' : 'btn-done'}" onclick="toggleCabang(${cb.id}, ${!cb.is_active})">${cb.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showCabangError(msg) {
  document.getElementById('cabang-table-body').innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;padding:16px">${escHtml(msg)}</td></tr>`;
}

// Modal Cabang
function openModalCabang(cabang = null) {
  document.getElementById('cabang-form-id').value = cabang?.id ?? '';
  document.getElementById('cabang-nama').value    = cabang?.nama ?? '';
  document.getElementById('cabang-kode').value    = cabang?.kode ?? '';
  document.getElementById('cabang-alamat').value  = cabang?.alamat ?? '';
  document.getElementById('modal-cabang-title').textContent = cabang ? 'Edit Cabang' : 'Tambah Cabang';
  document.getElementById('cabang-aktif-group').style.display = cabang ? '' : 'none';
  if (cabang) document.getElementById('cabang-aktif').value = String(cabang.is_active);
  document.getElementById('modal-cabang-alert').innerHTML = '';
  document.getElementById('modal-cabang').classList.remove('hidden');
}

function closeModalCabang() {
  document.getElementById('modal-cabang').classList.add('hidden');
}

async function submitCabang() {
  const id     = document.getElementById('cabang-form-id').value;
  const nama   = document.getElementById('cabang-nama').value.trim();
  const kode   = document.getElementById('cabang-kode').value.trim().toUpperCase();
  const alamat = document.getElementById('cabang-alamat').value.trim();

  if (!nama || !kode) {
    setModalAlert('modal-cabang-alert', 'error', 'Nama dan kode cabang wajib diisi');
    return;
  }

  const body = { nama, kode, alamat };
  if (id) body.is_active = document.getElementById('cabang-aktif').value === 'true';

  const result = id
    ? await api('PUT', `/admin/cabang/${id}`, body)
    : await api('POST', '/admin/cabang', body);

  if (result.success) {
    showToast(result.message || (id ? 'Cabang berhasil diperbarui' : 'Cabang berhasil ditambahkan'));
    closeModalCabang();
    loadCabang();
  } else {
    setModalAlert('modal-cabang-alert', 'error', result.message);
  }
}

async function toggleCabang(id, newStatus) {
  const label = newStatus ? 'mengaktifkan' : 'menonaktifkan';
  if (!confirm(`Yakin ingin ${label} cabang ini?`)) return;
  const result = await api('PUT', `/admin/cabang/${id}`, { is_active: newStatus });
  if (result.success) { showToast(result.message || 'Status cabang diperbarui'); loadCabang(); }
  else showToast('Gagal: ' + result.message, 'error');
}

// ===========================
// KELOLA STAFF
// ===========================
async function loadStaff() {
  document.getElementById('staff-table-body').innerHTML = `<tr><td colspan="6" class="empty-state">Memuat...</td></tr>`;

  const filterCabang = document.getElementById('staff-filter-cabang')?.value ?? '';

  try {
    const result = await api('GET', '/admin/staff');
    if (!result.success) { showStaffError('Gagal memuat data staff'); return; }

    let list = result.data.staff ?? [];
    if (filterCabang) list = list.filter(s => String(s.cabang_id) === filterCabang);
    renderStaffTable(list);
  } catch { showStaffError('Terjadi kesalahan koneksi'); }
}

function renderStaffTable(list) {
  if (!list.length) {
    document.getElementById('staff-table-body').innerHTML = `<tr class="empty-row"><td colspan="6">Belum ada data staff.</td></tr>`;
    return;
  }
  document.getElementById('staff-table-body').innerHTML = list.map(s => `
    <tr>
      <td>
        <div style="font-weight:600;color:var(--gray-800)">${escHtml(s.nama)}</div>
        <div style="font-size:11px;color:var(--gray-400)">${escHtml(s.no_hp ?? '—')}</div>
      </td>
      <td class="text-muted" style="font-size:12px">${escHtml(s.email ?? '—')}</td>
      <td><span class="layanan-badge ${s.role === 'cs' ? 'layanan-cs' : 'layanan-teller'}">${s.role === 'cs' ? 'CS' : 'Teller'}</span></td>
      <td style="font-size:12px">${escHtml(s.cabang?.nama ?? '—')}</td>
      <td>${s.loket_number ? `<span class="badge-loket-small">Loket ${s.loket_number}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-primary btn-sm" onclick="openMonitorPanel('${s.id}')">Pantau</button>
          <button class="btn btn-outline btn-sm" onclick='openModalStaff(${JSON.stringify(s)})'>Edit</button>
          <button class="btn btn-outline btn-sm" style="color:var(--purple)" onclick="openModalResetPw('${s.id}', '${escHtml(s.nama)}')">Reset PW</button>
          <button class="btn btn-danger btn-sm" onclick="deleteStaff('${s.id}', '${escHtml(s.nama)}')">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showStaffError(msg) {
  document.getElementById('staff-table-body').innerHTML = `<tr class="empty-row"><td colspan="6" style="color:var(--danger)">${escHtml(msg)}</td></tr>`;
}

// Modal Staff
function openModalStaff(staff = null) {
  const isEdit = !!staff;
  document.getElementById('staff-form-id').value  = staff?.id ?? '';
  document.getElementById('staff-nama').value     = staff?.nama ?? '';
  document.getElementById('staff-email').value    = staff?.email ?? '';
  document.getElementById('staff-hp').value       = staff?.no_hp ?? '';
  document.getElementById('staff-role').value     = staff?.role ?? 'teller';
  document.getElementById('staff-cabang').value   = staff?.cabang_id ?? '';
  document.getElementById('staff-password').value = '';

  // Sembunyikan email & password saat edit (tidak boleh ubah email lewat sini)
  document.getElementById('staff-email-group').style.display    = isEdit ? 'none' : '';
  document.getElementById('staff-password-group').style.display = isEdit ? 'none' : '';

  document.getElementById('modal-staff-title').textContent = isEdit ? 'Edit Staff' : 'Tambah Staff';
  document.getElementById('modal-staff-alert').innerHTML   = '';
  document.getElementById('modal-staff').classList.remove('hidden');
}

function closeModalStaff() {
  document.getElementById('modal-staff').classList.add('hidden');
}

async function submitStaff() {
  const id       = document.getElementById('staff-form-id').value;
  const nama     = document.getElementById('staff-nama').value.trim();
  const email    = document.getElementById('staff-email').value.trim();
  const no_hp    = document.getElementById('staff-hp').value.trim();
  const password = document.getElementById('staff-password').value;
  const role     = document.getElementById('staff-role').value;
  const cabangId = document.getElementById('staff-cabang').value;

  if (!nama || (!id && (!email || !password))) {
    setModalAlert('modal-staff-alert', 'error', 'Nama, email, dan password wajib diisi untuk staff baru');
    return;
  }

  const body = { nama, role, no_hp };
  if (cabangId) body.cabang_id = Number(cabangId);

  let result;
  if (id) {
    result = await api('PUT', `/admin/staff/${id}`, body);
  } else {
    body.email    = email;
    body.password = password;
    result = await api('POST', '/admin/staff', body);
  }

  if (result.success) {
    showToast(result.message || (id ? 'Staff berhasil diperbarui' : 'Staff berhasil ditambahkan'));
    closeModalStaff();
    loadStaff();
  } else {
    setModalAlert('modal-staff-alert', 'error', result.message);
  }
}

// Modal Reset Password
function openModalResetPw(id, nama) {
  document.getElementById('reset-pw-id').value = id;
  document.getElementById('reset-pw-nama').textContent = `Reset password untuk: ${nama}`;
  document.getElementById('reset-pw-value').value = '';
  document.getElementById('modal-reset-pw-alert').innerHTML = '';
  document.getElementById('modal-reset-pw').classList.remove('hidden');
}

function closeModalResetPw() {
  document.getElementById('modal-reset-pw').classList.add('hidden');
}

async function submitResetPw() {
  const id  = document.getElementById('reset-pw-id').value;
  const pw  = document.getElementById('reset-pw-value').value;

  if (!pw || pw.length < 8) {
    setModalAlert('modal-reset-pw-alert', 'error', 'Password minimal 8 karakter');
    return;
  }

  const result = await api('POST', `/admin/staff/${id}/reset-password`, { password_baru: pw });
  if (result.success) {
    showToast(result.message || 'Password berhasil direset');
    closeModalResetPw();
  } else {
    setModalAlert('modal-reset-pw-alert', 'error', result.message);
  }
}

async function deleteStaff(id, nama) {
  if (!confirm(`Hapus akun "${nama}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  const result = await api('DELETE', `/admin/staff/${id}`);
  if (result.success) {
    showToast(result.message || `Akun "${nama}" berhasil dihapus`);
    loadStaff();
  } else {
    showToast('Gagal: ' + result.message, 'error');
  }
}

// ===========================
// MONITOR PANEL
// ===========================
let _monitorStaffId   = null;
let _monitorTimer     = null;

function openMonitorPanel(staffId) {
  _monitorStaffId = staffId;

  // Reset header dulu — akan diisi dari API
  document.getElementById('mon-staff-name').textContent  = 'Memuat...';
  document.getElementById('mon-staff-role').textContent  = '';
  document.getElementById('mon-staff-loket').textContent = '';
  document.getElementById('mon-staff-cabang').textContent = '';
  document.getElementById('monitor-body').innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--gray-400);font-size:13px">Memuat data...</div>';

  document.getElementById('monitor-overlay').classList.add('open');
  document.getElementById('monitor-panel').classList.add('open');

  loadMonitorData();
  startMonitorRefresh();
}

function closeMonitorPanel() {
  document.getElementById('monitor-overlay').classList.remove('open');
  document.getElementById('monitor-panel').classList.remove('open');
  stopMonitorRefresh();
  _monitorStaffId = null;
}

function startMonitorRefresh() {
  stopMonitorRefresh();
  _monitorTimer = setInterval(loadMonitorData, 10000);
}

function stopMonitorRefresh() {
  if (_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
}

async function loadMonitorData() {
  if (!_monitorStaffId) return;

  const dot = document.getElementById('mon-dot');
  if (dot) { dot.style.background = 'var(--orange)'; }

  try {
    const result = await api('GET', `/admin/staff/${_monitorStaffId}/monitor`);
    if (!result.success) {
      document.getElementById('monitor-body').innerHTML =
        `<div style="text-align:center;padding:40px;color:var(--danger)">Gagal memuat: ${escHtml(result.message)}</div>`;
      return;
    }

    const { staff, stats, nowServing, antrian } = result.data;

    // Update header dari data API
    if (staff) {
      const roleLabel = staff.role === 'cs' ? 'Customer Service' : 'Teller';
      const loket     = staff.loket_number ? `Loket ${staff.loket_number}` : 'Loket belum diset';
      const cabang    = staff.cabang?.nama ?? '—';
      document.getElementById('mon-staff-name').textContent   = staff.nama;
      document.getElementById('mon-staff-role').textContent   = roleLabel;
      document.getElementById('mon-staff-loket').textContent  = loket;
      document.getElementById('mon-staff-cabang').textContent = cabang;
    }

    // Bagian "Now Serving"
    const nsHtml = nowServing
      ? `<div class="monitor-now-serving">
          <div>
            <div class="ns-label">Sedang Dilayani</div>
            <div class="ns-nomor">${escHtml(nowServing.nomor_antrian)}</div>
            <div class="ns-detail">${escHtml(nowServing.keperluan ?? nowServing.layanan)}</div>
          </div>
          <div class="ns-icon">🏦</div>
        </div>`
      : `<div style="background:var(--gray-100);border-radius:14px;padding:16px 20px;color:var(--gray-400);font-size:13px;text-align:center">
          Tidak ada nasabah yang sedang dilayani
        </div>`;

    // Stat chips
    const statsHtml = `
      <div class="monitor-stats">
        <div class="monitor-stat orange"><div class="ms-val">${stats.total}</div><div class="ms-lbl">Total</div></div>
        <div class="monitor-stat blue"><div class="ms-val">${stats.menunggu}</div><div class="ms-lbl">Menunggu</div></div>
        <div class="monitor-stat green"><div class="ms-val">${stats.selesai}</div><div class="ms-lbl">Selesai</div></div>
        <div class="monitor-stat red"><div class="ms-val">${stats.batal}</div><div class="ms-lbl">Batal</div></div>
      </div>`;

    // Tabel antrian
    const statusMap = {
      menunggu:  ['status-menunggu',  'Menunggu'],
      dipanggil: ['status-dipanggil', 'Dipanggil'],
      selesai:   ['status-selesai',   'Selesai'],
      batal:     ['status-batal',     'Batal'],
    };

    const rows = antrian.length
      ? antrian.map(a => {
          const nama = a.profiles?.nama ?? a.nama_nasabah ?? 'Nasabah';
          const [cls, lbl] = statusMap[a.status] ?? ['', a.status];
          return `<tr>
            <td class="antrian-number" style="font-size:13px">${escHtml(a.nomor_antrian)}</td>
            <td>${escHtml(nama)}<div style="font-size:10px;color:var(--gray-400)">${escHtml(a.keperluan ?? '—')}</div></td>
            <td><span class="status-badge-table ${cls}">${lbl}</span></td>
            <td style="color:var(--gray-400);font-size:11px">${a.called_at ? formatWaktu(a.called_at) : '—'}</td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="4">Belum ada antrian hari ini</td></tr>`;

    const tableHtml = `
      <div class="monitor-table-wrap">
        <div class="monitor-table-title">Daftar Antrian Hari Ini</div>
        <table class="monitor-table">
          <thead><tr><th>Nomor</th><th>Nasabah</th><th>Status</th><th>Dipanggil</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('monitor-body').innerHTML = nsHtml + statsHtml + tableHtml;

    // Update last update
    const now = new Date();
    const hms = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const el = document.getElementById('mon-last-update');
    if (el) el.textContent = `Update: ${hms}`;

  } catch (e) {
    document.getElementById('monitor-body').innerHTML =
      `<div style="text-align:center;padding:40px;color:var(--danger)">Terjadi kesalahan koneksi</div>`;
  } finally {
    if (dot) { dot.style.background = 'var(--success)'; }
  }
}

// ===========================
// KELOLA NASABAH
// ===========================
let _nasabahSearchTimer = null;

function debounceNasabahSearch() {
  if (_nasabahSearchTimer) clearTimeout(_nasabahSearchTimer);
  _nasabahSearchTimer = setTimeout(loadNasabah, 400);
}

async function loadNasabah() {
  document.getElementById('nasabah-table-body').innerHTML =
    `<tr class="empty-row"><td colspan="6">Memuat...</td></tr>`;

  const search  = document.getElementById('nasabah-search')?.value.trim() ?? '';
  const cabang  = document.getElementById('nasabah-filter-cabang')?.value ?? '';

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (cabang) params.set('cabang_id', cabang);

  try {
    const result = await api('GET', '/admin/nasabah?' + params.toString());
    if (!result.success) {
      document.getElementById('nasabah-table-body').innerHTML =
        `<tr class="empty-row"><td colspan="6" style="color:var(--danger)">${escHtml(result.message)}</td></tr>`;
      return;
    }

    const { nasabah, stats } = result.data;

    // Update stat chips
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('ns-total', stats.total);
    setEl('ns-aktif', stats.aktif_hari_ini);
    setEl('ns-baru',  stats.baru_minggu_ini);

    renderNasabahTable(nasabah);
  } catch {
    document.getElementById('nasabah-table-body').innerHTML =
      `<tr class="empty-row"><td colspan="6" style="color:var(--danger)">Terjadi kesalahan koneksi</td></tr>`;
  }
}

function renderNasabahTable(list) {
  if (!list.length) {
    document.getElementById('nasabah-table-body').innerHTML =
      `<tr class="empty-row"><td colspan="6">Belum ada nasabah terdaftar.</td></tr>`;
    return;
  }

  document.getElementById('nasabah-table-body').innerHTML = list.map(n => {
    const aktifBadge = n.aktif_hari_ini
      ? `<span class="status-badge-table status-selesai">Aktif Hari Ini</span>`
      : `<span class="status-badge-table status-batal" style="background:var(--gray-100);color:var(--gray-400);border-color:var(--gray-200)">—</span>`;

    const statusBadge = n.is_active === false
      ? `<span class="status-badge-table status-batal">Nonaktif</span>`
      : `<span class="status-badge-table status-selesai">Aktif</span>`;

    const terakhir = n.terakhir_aktif
      ? new Date(n.terakhir_aktif).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
      : '—';

    return `<tr>
      <td>
        <div style="font-weight:600;color:var(--gray-800)">${escHtml(n.nama)}</div>
        ${n.cabang?.nama ? `<div style="font-size:11px;color:var(--gray-400)">${escHtml(n.cabang.nama)}</div>` : ''}
      </td>
      <td class="text-muted" style="font-size:12px">${escHtml(n.no_hp ?? '—')}</td>
      <td style="font-weight:700;color:var(--orange);font-size:14px">${n.total_antrian}</td>
      <td class="text-muted" style="font-size:12px">${terakhir}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-primary btn-sm" onclick="openRiwayatPanel('${n.id}')">Riwayat</button>
          <button class="btn btn-sm ${n.is_active === false ? 'btn-done' : 'btn-danger'}"
            onclick="doToggleNasabah('${n.id}', ${n.is_active !== false})">
            ${n.is_active === false ? 'Aktifkan' : 'Nonaktifkan'}
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// --- Riwayat Panel ---
let _riwayatNasabahId   = null;
let _riwayatNasabahNama = null;

function openRiwayatPanel(nasabahId) {
  _riwayatNasabahId = nasabahId;
  document.getElementById('riw-nasabah-name').textContent = 'Memuat...';
  document.getElementById('riw-nasabah-hp').textContent   = '';
  document.getElementById('riw-nasabah-daftar').textContent = '';
  document.getElementById('riwayat-body').innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--gray-400);font-size:13px">Memuat riwayat...</div>';
  document.getElementById('riwayat-overlay').classList.add('open');
  document.getElementById('riwayat-panel').classList.add('open');
  loadRiwayatData();
}

function closeRiwayatPanel() {
  document.getElementById('riwayat-overlay').classList.remove('open');
  document.getElementById('riwayat-panel').classList.remove('open');
  _riwayatNasabahId   = null;
  _riwayatNasabahNama = null;
}

async function loadRiwayatData() {
  if (!_riwayatNasabahId) return;
  try {
    const result = await api('GET', `/admin/nasabah/${_riwayatNasabahId}/riwayat`);
    if (!result.success) {
      document.getElementById('riwayat-body').innerHTML =
        `<div style="text-align:center;padding:40px;color:var(--danger)">Gagal memuat: ${escHtml(result.message)}</div>`;
      return;
    }

    const { profile, antrian, stats } = result.data;
    _riwayatNasabahNama = profile.nama;

    // Update header
    document.getElementById('riw-nasabah-name').textContent = profile.nama;
    document.getElementById('riw-nasabah-hp').textContent   = profile.no_hp ?? '—';
    document.getElementById('reset-pw-nasabah-id').value    = _riwayatNasabahId;
    document.getElementById('reset-pw-nasabah-nama').textContent = `Reset password untuk: ${profile.nama}`;

    const daftar = profile.created_at
      ? 'Daftar: ' + new Date(profile.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
      : '';
    document.getElementById('riw-nasabah-daftar').textContent = daftar;

    // Stat chips
    const statusMap = {
      menunggu:  ['status-menunggu',  'Menunggu'],
      dipanggil: ['status-dipanggil', 'Dipanggil'],
      selesai:   ['status-selesai',   'Selesai'],
      batal:     ['status-batal',     'Batal'],
    };

    const statsHtml = `
      <div class="monitor-stats">
        <div class="monitor-stat orange"><div class="ms-val">${stats.total}</div><div class="ms-lbl">Total</div></div>
        <div class="monitor-stat green"><div class="ms-val">${stats.selesai}</div><div class="ms-lbl">Selesai</div></div>
        <div class="monitor-stat blue"><div class="ms-val">${stats.menunggu}</div><div class="ms-lbl">Aktif</div></div>
        <div class="monitor-stat red"><div class="ms-val">${stats.batal}</div><div class="ms-lbl">Batal</div></div>
      </div>`;

    const rows = antrian.length
      ? antrian.map(a => {
          const [cls, lbl] = statusMap[a.status] ?? ['', a.status];
          const tgl = a.created_at
            ? new Date(a.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short' })
            : '—';
          const lClass = a.layanan === 'CS' ? 'layanan-cs' : 'layanan-teller';
          return `<tr>
            <td class="text-muted" style="font-size:11px;white-space:nowrap">${tgl}</td>
            <td class="antrian-number" style="font-size:13px">${escHtml(a.nomor_antrian)}</td>
            <td><span class="layanan-badge ${lClass}">${a.layanan}</span></td>
            <td style="font-size:11px;color:var(--gray-500)">${escHtml(a.keperluan ?? '—')}</td>
            <td><span class="status-badge-table ${cls}">${lbl}</span></td>
            <td class="text-muted" style="font-size:11px">${escHtml(a.cabang?.nama ?? '—')}</td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="6">Belum ada riwayat antrian</td></tr>`;

    const tableHtml = `
      <div class="monitor-table-wrap">
        <div class="monitor-table-title">Riwayat Antrian</div>
        <table class="monitor-table">
          <thead><tr><th>Tgl</th><th>Nomor</th><th>Layanan</th><th>Keperluan</th><th>Status</th><th>Cabang</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('riwayat-body').innerHTML = statsHtml + tableHtml;

  } catch {
    document.getElementById('riwayat-body').innerHTML =
      `<div style="text-align:center;padding:40px;color:var(--danger)">Terjadi kesalahan koneksi</div>`;
  }
}

// --- Toggle aktif/nonaktif nasabah ---
async function doToggleNasabah(id, currentlyActive) {
  const label = currentlyActive ? 'menonaktifkan' : 'mengaktifkan';
  if (!confirm(`Yakin ingin ${label} nasabah ini?`)) return;
  const result = await api('PUT', `/admin/nasabah/${id}/toggle`, { is_active: !currentlyActive });
  if (result.success) { showToast(result.message); loadNasabah(); }
  else showToast('Gagal: ' + result.message, 'error');
}

// --- Reset password nasabah ---
function openResetPwNasabah() {
  document.getElementById('reset-pw-nasabah-value').value = '';
  document.getElementById('modal-reset-pw-nasabah-alert').innerHTML = '';
  document.getElementById('modal-reset-pw-nasabah').classList.remove('hidden');
}
function closeResetPwNasabah() {
  document.getElementById('modal-reset-pw-nasabah').classList.add('hidden');
}
async function submitResetPwNasabah() {
  const id = document.getElementById('reset-pw-nasabah-id').value;
  const pw = document.getElementById('reset-pw-nasabah-value').value;
  if (!pw || pw.length < 8) {
    setModalAlert('modal-reset-pw-nasabah-alert', 'error', 'Password minimal 8 karakter');
    return;
  }
  const result = await api('POST', `/admin/nasabah/${id}/reset-password`, { password_baru: pw });
  if (result.success) {
    showToast(result.message || 'Password nasabah berhasil direset');
    closeResetPwNasabah();
  } else {
    setModalAlert('modal-reset-pw-nasabah-alert', 'error', result.message);
  }
}

// ===========================
// LAPORAN
// ===========================
function initLaporan() {
  // Default tanggal hari ini
  const today = new Date().toISOString().split('T')[0];
  const dariEl   = document.getElementById('lap-dari');
  const sampaiEl = document.getElementById('lap-sampai');
  if (dariEl   && !dariEl.value)   dariEl.value   = today;
  if (sampaiEl && !sampaiEl.value) sampaiEl.value  = today;

  loadLaporan();
}

async function loadLaporan(resetOffset = true) {
  if (resetOffset) laporanOffset = 0;

  document.getElementById('laporan-table-body').innerHTML = `<tr><td colspan="8" class="empty-state">Memuat...</td></tr>`;

  const dari    = document.getElementById('lap-dari').value;
  const sampai  = document.getElementById('lap-sampai').value;
  const cabang  = document.getElementById('lap-cabang').value;
  const layanan = document.getElementById('lap-layanan').value;
  const status  = document.getElementById('lap-status').value;

  const params = new URLSearchParams({
    limit: String(LAPORAN_LIMIT),
    offset: String(laporanOffset),
  });
  if (dari)    params.set('dari',      dari);
  if (sampai)  params.set('sampai',    sampai);
  if (cabang)  params.set('cabang_id', cabang);
  if (layanan) params.set('layanan',   layanan);
  if (status)  params.set('status',    status);

  try {
    const result = await api('GET', '/admin/laporan?' + params.toString());
    if (!result.success) {
      document.getElementById('laporan-table-body').innerHTML = `<tr><td colspan="8" style="color:red;text-align:center;padding:16px">${escHtml(result.message)}</td></tr>`;
      return;
    }

    laporanTotal = result.data.total ?? 0;
    const list   = result.data.antrian ?? [];

    // Update info
    const from = laporanOffset + 1;
    const to   = Math.min(laporanOffset + LAPORAN_LIMIT, laporanTotal);
    document.getElementById('lap-info').textContent =
      laporanTotal ? `Menampilkan ${from}–${to} dari ${laporanTotal} data` : 'Tidak ada data';

    // Update pagination buttons
    document.getElementById('lap-prev').disabled = laporanOffset === 0;
    document.getElementById('lap-next').disabled = laporanOffset + LAPORAN_LIMIT >= laporanTotal;

    if (!list.length) {
      document.getElementById('laporan-table-body').innerHTML = `<tr class="empty-row"><td colspan="8">Tidak ada data dengan filter yang dipilih.</td></tr>`;
      return;
    }

    document.getElementById('laporan-table-body').innerHTML = list.map(a => {
      const nama = a.profiles?.nama ?? a.nama_nasabah ?? '—';
      const lClass = a.layanan === 'CS' ? 'layanan-cs' : 'layanan-teller';
      const sClass = `status-${a.status}`;
      return `
        <tr>
          <td class="antrian-number">${a.nomor_antrian}</td>
          <td>
            <div style="font-weight:500">${escHtml(nama)}</div>
            ${a.keperluan ? `<div style="font-size:11px;color:var(--gray-400)">${escHtml(a.keperluan)}</div>` : ''}
          </td>
          <td><span class="layanan-badge ${lClass}">${a.layanan}</span></td>
          <td><span class="status-badge-table ${sClass}">${a.status}</span></td>
          <td class="text-muted" style="font-size:12px">${escHtml(a.cabang?.nama ?? '—')}</td>
          <td>${a.loket_number ? `<span class="badge-loket-small">Loket ${a.loket_number}</span>` : '<span class="text-muted">—</span>'}</td>
          <td class="text-muted" style="font-size:12px;white-space:nowrap">${a.created_at  ? formatWaktu(a.created_at)  : '—'}</td>
          <td class="text-muted" style="font-size:12px;white-space:nowrap">${a.finished_at ? formatWaktu(a.finished_at) : '—'}</td>
        </tr>
      `;
    }).join('');

  } catch {
    document.getElementById('laporan-table-body').innerHTML = `<tr><td colspan="8" style="color:red;text-align:center;padding:16px">Terjadi kesalahan koneksi</td></tr>`;
  }
}

function laporanPrev() {
  if (laporanOffset === 0) return;
  laporanOffset = Math.max(0, laporanOffset - LAPORAN_LIMIT);
  loadLaporan(false);
}

function laporanNext() {
  if (laporanOffset + LAPORAN_LIMIT >= laporanTotal) return;
  laporanOffset += LAPORAN_LIMIT;
  loadLaporan(false);
}

async function exportCSV() {
  const dari    = document.getElementById('lap-dari').value;
  const sampai  = document.getElementById('lap-sampai').value;
  const cabang  = document.getElementById('lap-cabang').value;
  const layanan = document.getElementById('lap-layanan').value;
  const status  = document.getElementById('lap-status').value;

  const params = new URLSearchParams({ format: 'csv' });
  if (dari)    params.set('dari',      dari);
  if (sampai)  params.set('sampai',    sampai);
  if (cabang)  params.set('cabang_id', cabang);
  if (layanan) params.set('layanan',   layanan);
  if (status)  params.set('status',    status);

  // Unduh file CSV langsung lewat anchor
  const link = document.createElement('a');
  link.href  = `/api/admin/laporan?${params.toString()}`;
  link.setAttribute('download', `laporan-antrian-${dari || 'semua'}.csv`);

  // Sertakan token di header tidak bisa lewat anchor biasa — fetch dengan blob
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const resp = await fetch('/api/admin/laporan?' + params.toString(), { headers });
    if (!resp.ok) { alert('Gagal export: server error'); return; }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `laporan-antrian-${dari || new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('Gagal mengunduh CSV. Coba lagi.');
  }
}

// ===========================
// HELPER: Refresh dropdown cabang di semua form
// ===========================
function refreshCabangDropdowns() {
  const selectors = ['#staff-cabang', '#lap-cabang', '#staff-filter-cabang', '#nasabah-filter-cabang'];
  selectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    const current = el.value;
    el.innerHTML = sel.includes('filter') || sel.includes('lap-')
      ? '<option value="">Semua Cabang</option>'
      : '<option value="">— Belum dipilih —</option>';
    cabangList.forEach(cb => {
      const opt = document.createElement('option');
      opt.value       = cb.id;
      opt.textContent = cb.is_active ? cb.nama : `${cb.nama} (nonaktif)`;
      if (String(cb.id) === current) opt.selected = true;
      el.appendChild(opt);
    });
  });
}

async function loadCabangDropdowns() {
  try {
    const result = await api('GET', '/admin/cabang');
    if (result.success) {
      cabangList = result.data.cabang ?? [];
      refreshCabangDropdowns();
    }
  } catch { /* non-fatal */ }
}

// ===========================
// HELPER: Modal alert
// ===========================
function setModalAlert(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `<div class="modal-alert ${type}">${escHtml(msg)}</div>`;
}

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
    if (!result.success || result.data.profile?.role !== 'admin') {
      clearSession();
      window.location.href = '/login';
      return;
    }

    // Isi nama admin di sidebar
    const nama = result.data.profile?.nama ?? 'Admin';
    const sbName = document.getElementById('sb-user-name');
    if (sbName) sbName.textContent = nama;

    // Tombol logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      clearSession();
      window.location.href = '/login';
    });

    // Navigasi sidebar
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // Load cabang untuk dropdowns
    await loadCabangDropdowns();

    // Load halaman awal
    navigateTo('dashboard');

  } catch {
    clearSession();
    window.location.href = '/login';
  }
})();

// Clock topbar
function startClock() {
  function tick() {
    const now = new Date();
    const el  = document.getElementById('clock');
    if (el) el.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// Topbar date
function updateTopbarDate() {
  const tgl = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = tgl;
}

// ===========================
// DOCS API
// ===========================
const DOCS_SECTIONS = [
  {
    id: 'auth', label: 'Autentikasi', icon: '🔑',
    endpoints: [
      { method:'POST', path:'/api/auth/register',        auth:'Publik',  desc:'Daftarkan akun Teller atau CS baru',
        body: '{\n  "email": "john@teller.com",\n  "password": "pass123",\n  "nama": "John",\n  "cabang_id": 1,\n  "no_loket": "T01"\n}',
        response: '{ "success": true, "data": { "token": "eyJ...", "user": { "role": "teller" } } }' },
      { method:'POST', path:'/api/auth/login',           auth:'Publik',  desc:'Login Teller, CS, dan Admin — mengembalikan JWT token',
        body: '{ "email": "john@teller.com", "password": "pass123" }',
        response: '{ "success": true, "data": { "token": "eyJ...", "user": { "nama": "John", "role": "teller" } } }' },
      { method:'GET',  path:'/api/auth/me',              auth:'Staff',   desc:'Info profil user yang sedang login',
        body: null,
        response: '{ "data": { "nama": "John", "role": "teller", "cabang": { "nama": "Cabang Sudirman" } } }' },
      { method:'POST', path:'/api/auth/admin/reset-password', auth:'Publik', desc:'Kirim link reset password ke email via Supabase',
        body: '{ "email": "john@teller.com" }',
        response: '{ "success": true, "message": "Link reset terkirim" }' },
    ]
  },
  {
    id: 'antrian', label: 'Antrian (Staff)', icon: '🎫',
    endpoints: [
      { method:'GET',  path:'/api/antrian/statistik',  auth:'Staff',  desc:'Statistik antrian hari ini: total, menunggu, dilayani, selesai, batal',
        body: null, response: '{ "data": { "total": 42, "menunggu": 8, "dilayani": 1, "selesai": 30, "batal": 3 } }' },
      { method:'GET',  path:'/api/antrian/list',       auth:'Staff',  desc:'Daftar antrian hari ini, bisa filter per status (menunggu/dilayani/selesai/batal)',
        body: null, response: '[{ "id": "uuid", "nomor": 5, "layanan": "Teller", "keperluan": "Transfer", "status": "menunggu" }]' },
      { method:'PUT',  path:'/api/antrian/panggil',    auth:'Staff',  desc:'Panggil antrian berikutnya — otomatis kirim push notif OneSignal + WhatsApp',
        body: null, response: '{ "data": { "nomor": 5, "status": "dilayani" } }' },
      { method:'PUT',  path:'/api/antrian/selesai/:id',auth:'Staff',  desc:'Tandai antrian yang sedang dilayani sebagai selesai',
        body: null, response: '{ "success": true, "message": "Antrian selesai" }' },
      { method:'PUT',  path:'/api/antrian/batal/:id',  auth:'Staff',  desc:'Batalkan antrian yang menunggu atau sedang dilayani',
        body: null, response: '{ "success": true, "message": "Antrian dibatalkan" }' },
      { method:'PUT',  path:'/api/antrian/restore/:id',auth:'Staff',  desc:'Pulihkan antrian batal kembali ke status menunggu',
        body: null, response: '{ "success": true, "message": "Antrian dipulihkan" }' },
      { method:'POST', path:'/api/antrian/ambil',      auth:'Staff',  desc:'Staff buat antrian baru untuk nasabah walk-in tanpa mobile app',
        body: '{ "keperluan": "Transfer", "nama_nasabah": "Budi", "no_hp": "0812..." }',
        response: '{ "data": { "nomor": 7, "layanan": "Teller" } }' },
      { method:'PUT',  path:'/api/antrian/loket',      auth:'Staff',  desc:'Ubah nomor loket yang tampil saat nasabah dipanggil',
        body: '{ "no_loket": "T02" }', response: '{ "success": true, "message": "Loket diperbarui" }' },
      { method:'GET',  path:'/api/antrian/cabang',     auth:'Staff',  desc:'Daftar semua cabang yang terdaftar',
        body: null, response: '[{ "id": 1, "nama": "Cabang Sudirman", "kode": "CBG1" }]' },
    ]
  },
  {
    id: 'notif', label: 'Notifikasi', icon: '🔔',
    endpoints: [
      { method:'GET',  path:'/api/notif/status',            auth:'Staff',  desc:'Status koneksi OneSignal dan WhatsApp',
        body: null, response: '{ "data": { "onesignal": true, "whatsapp": "connected", "wa_number": "628..." } }' },
      { method:'GET',  path:'/api/notif/wa/qr',             auth:'Teller', desc:'QR code base64 untuk scan WhatsApp Web di dashboard Teller',
        body: null, response: '{ "data": { "qr": "data:image/png;base64,...", "status": "waiting_scan" } }' },
      { method:'POST', path:'/api/notif/wa/pairing-code',   auth:'Teller', desc:'Connect WhatsApp dengan kode pairing tanpa scan QR',
        body: '{ "phone": "6281234567890" }', response: '{ "data": { "code": "AB12-CD34" } }' },
      { method:'POST', path:'/api/notif/wa/disconnect',     auth:'Teller', desc:'Putuskan koneksi WhatsApp yang aktif',
        body: null, response: '{ "message": "WhatsApp terputus" }' },
      { method:'POST', path:'/api/notif/test-push',         auth:'Staff',  desc:'Kirim push notif test ke semua perangkat OneSignal terdaftar',
        body: null, response: '{ "message": "Push notification terkirim" }' },
    ]
  },
  {
    id: 'mobile', label: 'Mobile Nasabah', icon: '📱',
    endpoints: [
      { method:'POST', path:'/api/mobile/daftar',           auth:'Publik', desc:'Daftarkan akun nasabah baru via mobile app',
        body: '{ "nama": "Budi", "no_hp": "0812...", "password": "pass123", "cabang_id": 1 }',
        response: '{ "data": { "token": "eyJ..." } }' },
      { method:'POST', path:'/api/mobile/masuk',            auth:'Publik', desc:'Login nasabah dengan nomor HP (dikonversi ke email internal)',
        body: '{ "no_hp": "081234567890", "password": "pass123" }',
        response: '{ "data": { "token": "eyJ..." } }' },
      { method:'GET',  path:'/api/mobile/cabang',           auth:'Publik', desc:'Daftar semua cabang untuk dipilih saat daftar nasabah',
        body: null, response: '[{ "id": 1, "nama": "Cabang Sudirman" }]' },
      { method:'GET',  path:'/api/mobile/saya',             auth:'Nasabah',desc:'Profil nasabah yang sedang login',
        body: null, response: '{ "data": { "nama": "Budi", "no_hp": "081..." } }' },
      { method:'POST', path:'/api/mobile/antrian/ambil',    auth:'Nasabah',desc:'Ambil nomor antrian — hanya 1 antrian aktif per nasabah',
        body: '{ "layanan": "Teller", "keperluan": "Transfer" }',
        response: '{ "data": { "nomor": 12, "posisi": 3 } }' },
      { method:'GET',  path:'/api/mobile/antrian/status',   auth:'Nasabah',desc:'Cek status antrian aktif milik nasabah sekarang',
        body: null, response: '{ "data": { "ada_antrian": true, "antrian": { "nomor": 12, "posisi": 3 } } }' },
      { method:'GET',  path:'/api/mobile/antrian/riwayat',  auth:'Nasabah',desc:'Riwayat antrian nasabah dengan paginasi (param: limit, offset)',
        body: null, response: '[{ "nomor": 5, "layanan": "Teller", "status": "selesai" }]' },
      { method:'DELETE',path:'/api/mobile/antrian/:id',     auth:'Nasabah',desc:'Batalkan antrian berstatus menunggu (tidak bisa batalkan yang sudah dilayani)',
        body: null, response: '{ "message": "Antrian dibatalkan" }' },
    ]
  },
  {
    id: 'admin', label: 'Admin', icon: '⚙️',
    endpoints: [
      { method:'GET',  path:'/api/admin/statistik',              auth:'Admin', desc:'Statistik global: total antrian hari ini, staff, nasabah, cabang',
        body: null, response: '{ "data": { "total_antrian_hari_ini": 142, "total_staff": 8, "total_nasabah": 320, "total_cabang": 2 } }' },
      { method:'GET',  path:'/api/admin/cabang',                 auth:'Admin', desc:'Daftar semua cabang beserta jumlah staff per cabang',
        body: null, response: '[{ "id": 1, "nama": "Cabang Sudirman", "kode": "CBG1", "total_staff": 4 }]' },
      { method:'POST', path:'/api/admin/cabang',                 auth:'Admin', desc:'Tambah cabang baru',
        body: '{ "nama": "Cabang Merdeka", "kode": "CBG3", "alamat": "Jl. Merdeka 5" }',
        response: '{ "data": { "id": 3 } }' },
      { method:'PUT',  path:'/api/admin/cabang/:id',             auth:'Admin', desc:'Edit data cabang yang sudah ada',
        body: '{ "nama": "Nama Baru", "alamat": "..." }', response: '{ "success": true, "message": "Cabang diperbarui" }' },
      { method:'GET',  path:'/api/admin/staff',                  auth:'Admin', desc:'Daftar staff — bisa filter per cabang_id dan role (teller/cs)',
        body: null, response: '[{ "nama": "John", "role": "teller", "no_loket": "T01" }]' },
      { method:'POST', path:'/api/admin/staff',                  auth:'Admin', desc:'Tambah akun staff (Teller atau CS) oleh admin',
        body: '{ "nama": "Jane", "email": "jane@cs.com", "password": "pass", "no_loket": "CS01", "cabang_id": 1 }',
        response: '{ "data": { "id": "uuid" } }' },
      { method:'GET',  path:'/api/admin/staff/:id/monitor',      auth:'Admin', desc:'Aktivitas real-time staff: antrian hari ini, nomor dilayani, statistik',
        body: null, response: '{ "data": { "staff": { "nama": "John" }, "now_serving": { "nomor": 8 }, "stats": { "selesai": 12 } } }' },
      { method:'GET',  path:'/api/admin/nasabah',                auth:'Admin', desc:'Daftar nasabah — filter cabang_id, pencarian nama (q), paginasi',
        body: null, response: '{ "data": { "stats": { "total": 320 }, "nasabah": [{ "nama": "Budi", "total_antrian": 17 }] } }' },
      { method:'GET',  path:'/api/admin/nasabah/:id/riwayat',    auth:'Admin', desc:'100 riwayat antrian terakhir nasabah beserta statistik lengkap',
        body: null, response: '{ "data": { "profile": { "nama": "Budi" }, "stats": { "total": 17 }, "antrian": [...] } }' },
      { method:'PUT',  path:'/api/admin/nasabah/:id/toggle',     auth:'Admin', desc:'Blokir atau aktifkan akun nasabah via Supabase Auth ban',
        body: '{ "is_active": false }', response: '{ "message": "Nasabah dinonaktifkan" }' },
      { method:'POST', path:'/api/admin/nasabah/:id/reset-password', auth:'Admin', desc:'Reset password akun nasabah',
        body: '{ "password": "passwordbaru" }', response: '{ "message": "Password berhasil direset" }' },
      { method:'GET',  path:'/api/admin/laporan',                auth:'Admin', desc:'Laporan antrian dengan filter tanggal (dari/sampai) dan cabang_id',
        body: null, response: '{ "data": { "total": 450, "selesai": 400, "per_hari": [...], "per_cabang": [...] } }' },
      { method:'POST', path:'/api/admin/bootstrap',              auth:'Publik',desc:'Buat akun admin pertama saat setup awal (sekali pakai)',
        body: '{ "email": "admin@admin.com", "password": "password", "nama": "Administrator" }',
        response: '{ "message": "Admin berhasil dibuat" }' },
    ]
  }
];

const AUTH_COLORS = {
  'Publik':  { bg:'#F3F4F6', color:'#6B7280' },
  'Staff':   { bg:'#FFF7ED', color:'#C2410C' },
  'Teller':  { bg:'#F0FDF4', color:'#15803D' },
  'Nasabah': { bg:'#EFF6FF', color:'#1D4ED8' },
  'Admin':   { bg:'#FAF5FF', color:'#7E22CE' },
};
const METHOD_COLORS = {
  'GET':    { bg:'#F0FDF4', color:'#15803D' },
  'POST':   { bg:'#EFF6FF', color:'#1D4ED8' },
  'PUT':    { bg:'#FEFCE8', color:'#92400E' },
  'DELETE': { bg:'#FEF2F2', color:'#B91C1C' },
};

let _docsInitialized = false;

function initDocs() {
  if (_docsInitialized) return;
  _docsInitialized = true;
  renderDocs(DOCS_SECTIONS);
}

function renderDocs(sections) {
  const container = document.getElementById('docs-endpoint-list');
  if (!container) return;
  container.innerHTML = sections.map(sec => {
    const rows = sec.endpoints.map((ep, i) => {
      const mc = METHOD_COLORS[ep.method] || { bg:'#F3F4F6', color:'#374151' };
      const ac = AUTH_COLORS[ep.auth]     || { bg:'#F3F4F6', color:'#374151' };
      const bodyHtml = ep.body
        ? `<div style="margin-top:10px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:5px;">Request Body</div>
           <pre style="background:#1F2937;color:#E2E8F0;font-family:'Courier New',monospace;font-size:11.5px;border-radius:8px;padding:11px 13px;overflow-x:auto;white-space:pre;margin:0;">${escHtml(ep.body)}</pre></div>`
        : '';
      const resHtml = `<div style="margin-top:10px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:5px;">Response</div>
           <pre style="background:#1F2937;color:#86EFAC;font-family:'Courier New',monospace;font-size:11.5px;border-radius:8px;padding:11px 13px;overflow-x:auto;white-space:pre;margin:0;">${escHtml(ep.response)}</pre></div>`;
      return `<div class="docs-ep-row" data-idx="${sec.id}-${i}">
        <div class="docs-ep-header" onclick="docsToggle('${sec.id}-${i}')">
          <span class="docs-method" style="background:${mc.bg};color:${mc.color}">${ep.method}</span>
          <span class="docs-path">${ep.path}</span>
          <span class="docs-ep-desc">${ep.desc}</span>
          <span class="docs-auth-tag" style="background:${ac.bg};color:${ac.color}">${ep.auth}</span>
          <span class="docs-chevron">›</span>
        </div>
        <div class="docs-ep-body" id="ep-body-${sec.id}-${i}" style="display:none;">
          ${bodyHtml}${resHtml}
        </div>
      </div>`;
    }).join('');
    return `<div class="docs-section-block" data-section="${sec.id}">
      <div class="docs-sec-title"><span>${sec.icon}</span> ${sec.label}</div>
      ${rows}
    </div>`;
  }).join('');
}

function docsToggle(id) {
  const body = document.getElementById(`ep-body-${id}`);
  const row  = document.querySelector(`[data-idx="${id}"]`);
  if (!body || !row) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  const ch = row.querySelector('.docs-chevron');
  if (ch) ch.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function docsSearch(q) {
  const query = q.trim().toLowerCase();
  const blocks = document.querySelectorAll('.docs-section-block');
  blocks.forEach(block => {
    const rows = block.querySelectorAll('.docs-ep-row');
    let anyVisible = false;
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const match = !query || text.includes(query);
      row.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    });
    block.style.display = anyVisible ? '' : 'none';
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===========================
// KELOLA JADWAL
// ===========================
const HARI_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const DEFAULT_JADWAL = [
  { hari: 1, jam_buka: '08:00', jam_tutup: '15:00', is_buka: true  },
  { hari: 2, jam_buka: '08:00', jam_tutup: '15:00', is_buka: true  },
  { hari: 3, jam_buka: '08:00', jam_tutup: '15:00', is_buka: true  },
  { hari: 4, jam_buka: '08:00', jam_tutup: '15:00', is_buka: true  },
  { hari: 5, jam_buka: '08:00', jam_tutup: '15:00', is_buka: true  },
  { hari: 6, jam_buka: '08:00', jam_tutup: '12:00', is_buka: false },
  { hari: 7, jam_buka: '08:00', jam_tutup: '12:00', is_buka: false },
];

async function initJadwal() {
  if (!cabangList.length) {
    try {
      const r = await api('GET', '/admin/cabang');
      cabangList = r.data?.cabang ?? [];
    } catch { /* biarkan kosong */ }
  }

  const sel = document.getElementById('jadwal-cabang-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— pilih cabang —</option>' +
    cabangList.map(cb => `<option value="${cb.id}">${escHtml(cb.nama)}</option>`).join('');

  if (!cabangList.length) {
    document.getElementById('jadwal-content').innerHTML =
      `<div style="padding:40px 24px;text-align:center;color:var(--gray-400);font-size:13px">Belum ada cabang. Tambahkan cabang terlebih dahulu.</div>`;
    return;
  }

  if (cabangList.length === 1) {
    sel.value = cabangList[0].id;
    loadJadwal();
  }
}

async function loadJadwal() {
  const cabang_id = document.getElementById('jadwal-cabang-sel').value;
  const content   = document.getElementById('jadwal-content');
  if (!cabang_id) {
    content.innerHTML = `<div style="padding:40px 24px;text-align:center;color:var(--gray-400);font-size:13px">Pilih cabang untuk melihat jadwal operasional.</div>`;
    return;
  }

  content.innerHTML = `<div style="padding:30px 24px;text-align:center;color:var(--gray-400);font-size:13px">Memuat jadwal...</div>`;

  try {
    const result = await api('GET', `/admin/jadwal?cabang_id=${cabang_id}`);
    const dataMap = {};
    (result.data ?? []).forEach(j => { dataMap[j.hari] = j; });

    const rows = DEFAULT_JADWAL.map(def => {
      const d   = dataMap[def.hari] ?? def;
      const buka = d.is_buka;
      return `
        <div class="jadwal-row${buka ? '' : ' tutup'}" id="jadwal-row-${d.hari}">
          <div class="jadwal-hari">${HARI_NAMES[d.hari]}</div>
          <label class="jadwal-toggle">
            <input type="checkbox" id="jadwal-buka-${d.hari}" ${buka ? 'checked' : ''}
              onchange="toggleJadwalRow(${d.hari})"/>
            <span class="jadwal-toggle-track"></span>
          </label>
          <div class="jadwal-time-col">
            <label>Buka</label>
            <input type="time" id="jadwal-open-${d.hari}" value="${d.jam_buka ?? '08:00'}"/>
          </div>
          <div class="jadwal-time-col">
            <label>Tutup</label>
            <input type="time" id="jadwal-close-${d.hari}" value="${d.jam_tutup ?? '15:00'}"/>
          </div>
        </div>`;
    }).join('');

    content.innerHTML = `
      <div class="jadwal-grid">${rows}</div>
      <div class="jadwal-footer">
        <span class="jadwal-info">Toggle untuk hari libur/tidak buka. Perubahan berlaku setelah disimpan.</span>
        <button class="btn btn-outline btn-sm" onclick="loadJadwal()">↺ Reset</button>
        <button class="btn btn-primary" onclick="saveJadwal()">Simpan Jadwal</button>
      </div>`;
  } catch {
    content.innerHTML = `<div style="padding:30px 24px;text-align:center;color:var(--danger);font-size:13px">Gagal memuat jadwal.</div>`;
  }
}

function toggleJadwalRow(hari) {
  const cb  = document.getElementById(`jadwal-buka-${hari}`);
  const row = document.getElementById(`jadwal-row-${hari}`);
  if (!cb || !row) return;
  row.classList.toggle('tutup', !cb.checked);
}

async function saveJadwal() {
  const cabang_id = document.getElementById('jadwal-cabang-sel').value;
  if (!cabang_id) return;

  const jadwal = DEFAULT_JADWAL.map(def => ({
    hari:      def.hari,
    is_buka:   document.getElementById(`jadwal-buka-${def.hari}`)?.checked ?? def.is_buka,
    jam_buka:  document.getElementById(`jadwal-open-${def.hari}`)?.value  ?? def.jam_buka,
    jam_tutup: document.getElementById(`jadwal-close-${def.hari}`)?.value ?? def.jam_tutup,
  }));

  try {
    const result = await api('PUT', `/admin/jadwal/${cabang_id}`, { jadwal });
    if (result.success) showToast('Jadwal berhasil disimpan', 'success');
    else showToast(result.message ?? 'Gagal menyimpan jadwal', 'error');
  } catch {
    showToast('Terjadi kesalahan. Coba lagi.', 'error');
  }
}

// Sidebar toggle
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('topbar-toggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
  }
  startClock();
  updateTopbarDate();
});

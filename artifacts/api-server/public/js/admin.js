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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  // Update topbar title
  const titles = { dashboard: 'Dashboard', cabang: 'Kelola Cabang', staff: 'Kelola Staff', laporan: 'Laporan' };
  const titleEl = document.getElementById('topbar-page-title');
  if (titleEl) titleEl.textContent = titles[page] ?? 'Admin';

  // Load data sesuai halaman
  if (page === 'dashboard') loadDashboard();
  else if (page === 'cabang') loadCabang();
  else if (page === 'staff')  loadStaff();
  else if (page === 'laporan') initLaporan();
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

    // Global stats
    document.getElementById('global-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-val">${total}</div>
        <div class="stat-lbl">Total Antrian Hari Ini</div>
      </div>
      <div class="stat-card green">
        <div class="stat-val">${selesai}</div>
        <div class="stat-lbl">Selesai Dilayani</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-val">${menunggu + dipanggil}</div>
        <div class="stat-lbl">Masih Aktif</div>
      </div>
      <div class="stat-card red">
        <div class="stat-val">${batal}</div>
        <div class="stat-lbl">Dibatalkan</div>
      </div>
    `;

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
        <div class="cs-row"><span>Selesai</span><strong style="color:#16A34A">${cb.selesai}</strong></div>
        <div class="cs-row"><span>Menunggu</span><strong style="color:#EA580C">${cb.menunggu}</strong></div>
        <div class="cs-row"><span>Dibatalkan</span><strong style="color:#DC2626">${cb.batal}</strong></div>
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
    document.getElementById('cabang-table-body').innerHTML = `<tr><td colspan="6"><div class="empty-state">Belum ada cabang. Klik "+ Tambah Cabang" untuk menambahkan.</div></td></tr>`;
    return;
  }
  document.getElementById('cabang-table-body').innerHTML = list.map(cb => `
    <tr>
      <td>${cb.id}</td>
      <td><strong>${escHtml(cb.nama)}</strong></td>
      <td><code style="background:#f5f5f4;padding:2px 6px;border-radius:5px;font-size:11px">${escHtml(cb.kode)}</code></td>
      <td style="color:#78716c">${escHtml(cb.alamat ?? '—')}</td>
      <td><span class="badge ${cb.is_active ? 'badge-active' : 'badge-inactive'}">${cb.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td>
        <div class="actions">
          <button class="btn-edit btn-sm" onclick="openModalCabang(${JSON.stringify(cb).replace(/"/g,'&quot;')})">Edit</button>
          <button class="btn-${cb.is_active ? 'danger' : 'green'} btn-sm" onclick="toggleCabang(${cb.id}, ${!cb.is_active})">${cb.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
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
  if (result.success) loadCabang();
  else alert('Gagal: ' + result.message);
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
    document.getElementById('staff-table-body').innerHTML = `<tr><td colspan="6"><div class="empty-state">Belum ada data staff.</div></td></tr>`;
    return;
  }
  document.getElementById('staff-table-body').innerHTML = list.map(s => `
    <tr>
      <td><strong>${escHtml(s.nama)}</strong><div style="font-size:11px;color:#a8a29e">${escHtml(s.no_hp ?? '—')}</div></td>
      <td style="color:#78716c;font-size:12px">${escHtml(s.email ?? '—')}</td>
      <td><span class="badge badge-${s.role}">${s.role === 'cs' ? 'CS' : 'Teller'}</span></td>
      <td style="font-size:12px">${escHtml(s.cabang?.nama ?? '—')}</td>
      <td style="font-size:12px">${s.loket_number ? 'Loket ' + s.loket_number : '—'}</td>
      <td>
        <div class="actions">
          <button class="btn-edit btn-sm" onclick='openModalStaff(${JSON.stringify(s)})'>Edit</button>
          <button class="btn-purple btn-sm" onclick="openModalResetPw('${s.id}', '${escHtml(s.nama)}')">Reset PW</button>
          <button class="btn-danger btn-sm" onclick="deleteStaff('${s.id}', '${escHtml(s.nama)}')">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showStaffError(msg) {
  document.getElementById('staff-table-body').innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;padding:16px">${escHtml(msg)}</td></tr>`;
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
    closeModalResetPw();
    alert(result.message);
  } else {
    setModalAlert('modal-reset-pw-alert', 'error', result.message);
  }
}

async function deleteStaff(id, nama) {
  if (!confirm(`Hapus akun "${nama}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  const result = await api('DELETE', `/admin/staff/${id}`);
  if (result.success) {
    alert(result.message);
    loadStaff();
  } else {
    alert('Gagal: ' + result.message);
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
      document.getElementById('laporan-table-body').innerHTML = `<tr><td colspan="8"><div class="empty-state">Tidak ada data dengan filter yang dipilih.</div></td></tr>`;
      return;
    }

    document.getElementById('laporan-table-body').innerHTML = list.map((a, idx) => {
      const nama = a.profiles?.nama ?? a.nama_nasabah ?? '—';
      const layananLabel = a.layanan === 'CS' ? 'CS' : a.layanan;
      return `
        <tr>
          <td style="font-weight:700;color:#F97316">${a.nomor_antrian}</td>
          <td>
            <div>${escHtml(nama)}</div>
            ${a.keperluan ? `<div style="font-size:11px;color:#a8a29e">${escHtml(a.keperluan)}</div>` : ''}
          </td>
          <td>${layananLabel}</td>
          <td><span class="badge badge-${a.status}">${a.status}</span></td>
          <td style="font-size:12px">${escHtml(a.cabang?.nama ?? '—')}</td>
          <td style="font-size:12px">${a.loket_number ? 'Loket ' + a.loket_number : '—'}</td>
          <td style="font-size:12px;white-space:nowrap">${a.created_at  ? formatWaktu(a.created_at)  : '—'}</td>
          <td style="font-size:12px;white-space:nowrap">${a.finished_at ? formatWaktu(a.finished_at) : '—'}</td>
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
  const selectors = ['#staff-cabang', '#lap-cabang', '#staff-filter-cabang'];
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
  el.innerHTML = `<div class="alert-inline ${type}">${escHtml(msg)}</div>`;
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

// Sidebar toggle (reuse dari shared.js)
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('topbar-toggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
  }
});

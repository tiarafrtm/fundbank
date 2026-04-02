/* ============================================================
   CS.JS — Logika Dashboard Customer Service
   Dimuat di: cs.html
   Membutuhkan: shared.js (dimuat sebelumnya)
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
const refreshBtn   = document.getElementById('refresh-btn');
const queueTbody   = document.getElementById('queue-tbody');

// ===========================
// STATE HALAMAN
// ===========================
let currentPage     = 'overview'; // halaman aktif saat ini
let refreshInterval = null;       // timer auto-refresh

// Mapping: nama page → judul di topbar
const pageTitles = {
  overview: 'Ringkasan',
  buat:     'Buat Antrian',
};

// ===========================
// NAVIGASI ANTAR SUB-PAGE
// ===========================
function navigateTo(page) {
  currentPage = page;

  // Update URL browser tanpa reload
  const urls = { overview: '/cs', buat: '/cs/buat' };
  history.pushState({}, '', urls[page] || '/cs');

  // Highlight menu aktif
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Tampilkan sub-page yang dipilih
  document.querySelectorAll('.sub-page').forEach(el => el.classList.remove('active'));
  const subPage = document.getElementById('page-' + page);
  if (subPage) subPage.classList.add('active');

  // Update judul topbar
  if (pageTitle) pageTitle.textContent = pageTitles[page] || page;

  // Load data sesuai halaman
  if (page === 'overview') { loadStatistik(); loadQueueData(); }
  if (page === 'buat')     resetFormBuat();
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
// OVERVIEW: STATISTIK
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
  } catch {}
}

// ===========================
// OVERVIEW: DAFTAR ANTRIAN MENUNGGU
// ===========================
async function loadQueueData() {
  if (!queueTbody) return;

  try {
    const result = await api('GET', '/antrian/list');
    if (!result.success) {
      if (result.message?.includes('Token')) {
        clearSession();
        window.location.href = '/login';
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
          <button class="btn btn-danger btn-sm" onclick="batalAntrian('${item.id}', ${item.nomor_antrian})">Batal</button>
        </td>
      </tr>`).join('');
  } catch {}
}

// Tombol refresh manual
refreshBtn?.addEventListener('click', () => {
  loadStatistik();
  loadQueueData();
});

// ===========================
// OVERVIEW: BATALKAN ANTRIAN
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
// BUAT ANTRIAN: RESET FORM
// ===========================
function resetFormBuat() {
  // Sembunyikan tiket, tampilkan form kembali
  document.getElementById('tiket-section').classList.add('hidden');
  document.getElementById('form-buat').style.display = '';
  document.getElementById('buat-btn').classList.remove('hidden');

  // Kosongkan input
  document.getElementById('cs-nama').value  = '';
  document.getElementById('cs-nohp').value  = '';
  document.getElementById('cs-layanan').value = 'Tabungan';

  // Reset pesan
  const resultEl = document.getElementById('buat-result');
  if (resultEl) resultEl.classList.add('hidden');
}

// ===========================
// BUAT ANTRIAN: SUBMIT FORM
// ===========================
document.getElementById('buat-btn')?.addEventListener('click', async () => {
  const nama    = document.getElementById('cs-nama').value.trim();
  const no_hp   = document.getElementById('cs-nohp').value.trim();
  const layanan = document.getElementById('cs-layanan').value;
  const resultEl = document.getElementById('buat-result');

  // Validasi: nama wajib diisi
  if (!nama) {
    showAlert(resultEl, 'Nama nasabah wajib diisi', 'error');
    return;
  }

  const buatBtn = document.getElementById('buat-btn');
  buatBtn.disabled = true;
  buatBtn.textContent = 'Membuat antrian...';

  try {
    const result = await api('POST', '/antrian/ambil', {
      nama,
      no_hp: no_hp || undefined, // kirim undefined kalau kosong
      layanan,
    });

    if (!result.success) {
      showAlert(resultEl, result.message || 'Gagal membuat antrian', 'error');
      return;
    }

    // Tampilkan tiket nomor antrian
    const nomorAntrian = result.data.nomor_antrian ?? result.data.antrian?.nomor_antrian;
    document.getElementById('tiket-nomor').textContent   = nomorAntrian ?? '—';
    document.getElementById('tiket-layanan').textContent = `Layanan: ${layanan}`;
    document.getElementById('tiket-nama').textContent    = `Nasabah: ${nama}`;

    // Sembunyikan form, tampilkan tiket
    document.getElementById('form-buat').style.display = 'none';
    document.getElementById('tiket-section').classList.remove('hidden');

    // Refresh statistik
    loadStatistik();

  } catch {
    showAlert(resultEl, 'Terjadi kesalahan koneksi', 'error');
  } finally {
    buatBtn.disabled = false;
    buatBtn.textContent = 'Buat Nomor Antrian';
  }
});

// Tombol "Buat Antrian Lagi" — reset form untuk nasabah berikutnya
document.getElementById('buat-lagi-btn')?.addEventListener('click', resetFormBuat);

// ===========================
// INISIALISASI DASHBOARD CS
// ===========================
(async function init() {
  // 1. Cek session di localStorage
  if (!loadSession()) {
    window.location.href = '/login';
    return;
  }

  // 2. Verifikasi token + cek role
  try {
    const result = await api('GET', '/auth/me');
    if (!result.success || result.data.profile?.role !== 'cs') {
      // Bukan CS atau token expired
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

  // 3. Isi nama user di sidebar
  const nama = userProfile.nama || 'CS';
  sbUserName.textContent = nama;
  sbAvatar.textContent   = nama.charAt(0).toUpperCase();

  // 4. Tentukan halaman awal berdasarkan URL
  const pathPage = window.location.pathname === '/cs/buat' ? 'buat' : 'overview';
  navigateTo(pathPage);

  // 5. Auto-refresh setiap 8 detik
  refreshInterval = setInterval(() => {
    if (currentPage === 'overview') {
      loadStatistik();
      loadQueueData();
    }
  }, 8000);
})();

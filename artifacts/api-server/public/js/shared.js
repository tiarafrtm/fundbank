/* ============================================================
   SHARED.JS — Fungsi bersama untuk semua halaman
   Dimuat di: login.html, teller.html, cs.html
   ============================================================ */

// ===========================
// KONFIGURASI
// ===========================
const API_BASE = '/api';

// Variabel global session (diisi saat login)
let authToken   = null;
let userProfile = null;

// ===========================
// FUNGSI: PANGGIL API
// Gunakan ini untuk semua request ke backend
// ===========================
async function api(method, endpoint, body = null) {
  const headers = { 'Content-Type': 'application/json' };

  // Kalau sudah login, sertakan token di header
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(API_BASE + endpoint, options);
  return response.json();
}

// ===========================
// FUNGSI: MANAJEMEN SESSION
// Session disimpan di localStorage agar tetap login setelah refresh
// ===========================
function saveSession(token, profile) {
  authToken   = token;
  userProfile = profile;
  localStorage.setItem('bank_token',   token);
  localStorage.setItem('bank_profile', JSON.stringify(profile));
}

function clearSession() {
  authToken   = null;
  userProfile = null;
  localStorage.removeItem('bank_token');
  localStorage.removeItem('bank_profile');
}

function loadSession() {
  const token   = localStorage.getItem('bank_token');
  const profile = localStorage.getItem('bank_profile');
  if (token && profile) {
    authToken   = token;
    userProfile = JSON.parse(profile);
    return true; // session ditemukan
  }
  return false; // tidak ada session
}

// ===========================
// FUNGSI HELPER TAMPILAN
// ===========================

// Format jam dari ISO string → "HH:MM"
function formatWaktu(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// Buat badge HTML untuk jenis layanan
function layananBadge(layanan) {
  const kelas = {
    Teller:   'layanan-teller',
    CS:       'layanan-cs',
    Tabungan: 'layanan-tabungan',
    Kredit:   'layanan-kredit',
    Umum:     'layanan-umum',
  }[layanan] || 'layanan-umum';
  const label = layanan === 'CS' ? 'Customer Service' : layanan;
  return `<span class="layanan-badge ${kelas}">${label}</span>`;
}

// Buat badge HTML untuk status antrian
function statusBadge(status) {
  const kelas = {
    menunggu:  'status-menunggu',
    dipanggil: 'status-dipanggil',
    selesai:   'status-selesai',
    batal:     'status-batal',
  }[status] || '';
  return `<span class="status-badge-table ${kelas}">${status}</span>`;
}

// Tampilkan alert (error/success/warning) di dalam elemen
function showAlert(el, pesan, tipe, permanen = false) {
  el.innerHTML = pesan;
  el.className = 'alert alert-' + (
    tipe === 'success' ? 'success' :
    tipe === 'warning' ? 'warning' : 'error'
  );
  el.classList.remove('hidden');
  // Hilang otomatis setelah 6 detik (kecuali permanen=true)
  if (!permanen) setTimeout(() => el.classList.add('hidden'), 6000);
}

// Escape karakter HTML untuk mencegah XSS
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Ambil nama nasabah: bisa dari profile (self-service) atau nama_nasabah (dari CS)
function getNamaNasabah(item) {
  return item.profiles?.nama ?? item.nama_nasabah ?? 'Tidak diketahui';
}

// Update badge nama cabang di sidebar
function updateCabangBadge(cabangInfo) {
  const badge = document.getElementById('sb-cabang-badge');
  if (!badge) return;
  if (!cabangInfo || !cabangInfo.nama) {
    badge.style.display = 'none';
    return;
  }
  badge.textContent = cabangInfo.nama;
  badge.style.display = 'inline-block';
}

// ===========================
// MOBILE SIDEBAR
// ===========================
function openMobileSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar || !backdrop) return;
  sidebar.classList.add('mobile-open');
  backdrop.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar || !backdrop) return;
  sidebar.classList.remove('mobile-open');
  backdrop.classList.remove('visible');
  document.body.style.overflow = '';
}

// Tutup sidebar mobile saat nav-item diklik
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeMobileSidebar();
    });
  });
});

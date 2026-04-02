/* ============================================================
   AUTH.JS — Logika Halaman Login & Register
   Dimuat di: login.html
   Membutuhkan: shared.js (dimuat sebelumnya)
   ============================================================ */

// ===========================
// REFERENSI ELEMEN HTML
// ===========================
const loginForm       = document.getElementById('login-form');
const registerForm    = document.getElementById('register-form');
const loginError      = document.getElementById('login-error');
const registerError   = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const loginBtn        = document.getElementById('login-btn');
const registerBtn     = document.getElementById('register-btn');

// ===========================
// TAB MASUK / DAFTAR
// ===========================
function switchTab(tab) {
  // Update tampilan tombol tab
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');

  // Tampilkan/sembunyikan form sesuai tab
  loginForm.classList.toggle('hidden', tab !== 'login');
  registerForm.classList.toggle('hidden', tab !== 'register');

  // Reset pesan error
  loginError.classList.add('hidden');
  registerError.classList.add('hidden');
  registerSuccess.classList.add('hidden');
}

// ===========================
// PROSES LOGIN
// ===========================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Memproses...';

  try {
    const result = await api('POST', '/auth/login', {
      email:    document.getElementById('email').value,
      password: document.getElementById('password').value,
    });

    if (!result.success) {
      // Tampilkan pesan error dari server
      loginError.textContent = result.message || 'Login gagal';
      loginError.classList.remove('hidden');
      return;
    }

    const role = result.data.user?.role;

    // Pastikan role dikenali
    if (!['teller', 'cs'].includes(role)) {
      loginError.textContent = 'Akses ditolak. Role tidak dikenali.';
      loginError.classList.remove('hidden');
      return;
    }

    // Simpan session (token + profile)
    saveSession(result.data.token, result.data.user);

    // Redirect ke dashboard sesuai role
    if (role === 'teller') {
      window.location.href = '/dashboard';
    } else {
      window.location.href = '/cs';
    }

  } catch {
    loginError.textContent = 'Terjadi kesalahan koneksi. Coba lagi.';
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Masuk';
  }
});

// ===========================
// PROSES REGISTER
// ===========================
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.classList.add('hidden');
  registerSuccess.classList.add('hidden');
  registerBtn.disabled = true;
  registerBtn.textContent = 'Mendaftarkan...';

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

    // Tampilkan pesan sukses
    registerSuccess.textContent = result.message || 'Pendaftaran berhasil! Silakan login.';
    registerSuccess.classList.remove('hidden');
    registerForm.reset();

    // Otomatis pindah ke tab login setelah 3 detik
    setTimeout(() => switchTab('login'), 3000);

  } catch {
    registerError.textContent = 'Terjadi kesalahan koneksi.';
    registerError.classList.remove('hidden');
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = 'Buat Akun';
  }
});

// ===========================
// INISIALISASI HALAMAN
// Cek apakah sudah login — kalau iya, langsung redirect
// ===========================
(async function init() {
  if (!loadSession()) return; // Tidak ada session, tampilkan form login

  try {
    // Verifikasi token masih valid
    const result = await api('GET', '/auth/me');
    if (result.success) {
      const role = result.data.profile?.role;
      if (role === 'teller') window.location.href = '/dashboard';
      else if (role === 'cs') window.location.href = '/cs';
      else clearSession(); // Role tidak dikenali, bersihkan session
    } else {
      clearSession(); // Token tidak valid
    }
  } catch {
    clearSession();
  }
})();

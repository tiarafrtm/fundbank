# FUND BANK — Sistem Antrian Digital
## Backend API Server

Dokumentasi lengkap alur kerja backend, teknologi yang digunakan, struktur database, semua endpoint API, dan panduan integrasi dengan aplikasi mobile Android.

---

## Daftar Isi

1. [Gambaran Umum Sistem](#1-gambaran-umum-sistem)
2. [Teknologi yang Digunakan](#2-teknologi-yang-digunakan)
3. [Struktur Folder](#3-struktur-folder)
4. [Database — Struktur Tabel](#4-database--struktur-tabel)
5. [Alur Autentikasi](#5-alur-autentikasi)
6. [Semua Endpoint API](#6-semua-endpoint-api)
7. [Alur Kerja Antrian (Step by Step)](#7-alur-kerja-antrian-step-by-step)
8. [Sistem Notifikasi](#8-sistem-notifikasi)
9. [Estimasi Waktu Tunggu](#9-estimasi-waktu-tunggu)
10. [App Links (Android Deep Link)](#10-app-links-android-deep-link)
11. [Integrasi Android Studio](#11-integrasi-android-studio)
12. [Variabel Lingkungan](#12-variabel-lingkungan)
13. [Menjalankan Server](#13-menjalankan-server)

---

## 1. Gambaran Umum Sistem

Sistem ini adalah backend REST API untuk manajemen antrian bank digital. Terdapat tiga jenis pengguna:

| Role | Akses | Platform |
|------|-------|----------|
| **Teller** | Dashboard web, kelola antrian Teller | Browser (desktop) |
| **CS** | Dashboard web, kelola antrian CS | Browser (desktop) |
| **Nasabah** | Ambil nomor, cek status, batalkan antrian | Aplikasi Android |

```
┌────────────────────────────────────────────────────────────┐
│                    FUND BANK — Alur Sistem                 │
├──────────────────┬─────────────────────┬───────────────────┤
│   NASABAH        │      BACKEND         │   TELLER / CS     │
│  (Android App)   │   (Node.js/Express)  │  (Browser/Web)    │
├──────────────────┼─────────────────────┼───────────────────┤
│                  │                      │                   │
│ 1. Daftar/Login  │→ Supabase Auth       │                   │
│                  │                      │                   │
│ 2. Ambil tiket   │→ Simpan ke DB        │                   │
│    (pilih layanan│                      │                   │
│    & keperluan)  │                      │                   │
│                  │                      │ 3. Dashboard      │
│                  │                      │    (lihat antrian)│
│                  │                      │                   │
│                  │← Panggil Berikutnya ─│ 4. Klik "Panggil" │
│                  │                      │                   │
│ 5. Terima notif  │→ OneSignal Push      │                   │
│    WA & push     │→ WhatsApp (Baileys)  │                   │
│                  │                      │                   │
│ 6. Polling       │→ GET /status         │                   │
│    (tiap 15 dtk) │← posisi, estimasi    │                   │
│                  │                      │                   │
│                  │                      │ 7. Klik "Selesai" │
│                  │← Status: selesai ────│                   │
│                  │                      │                   │
└──────────────────┴─────────────────────┴───────────────────┘
```

---

## 2. Teknologi yang Digunakan

### Runtime & Framework
| Teknologi | Versi | Fungsi |
|-----------|-------|--------|
| **Node.js** | 20+ | Runtime JavaScript server |
| **TypeScript** | 5+ | Bahasa pemrograman (type-safe) |
| **Express.js** | 5 | Web framework, routing API |
| **ESBuild** | 0.27 | Build & bundling TypeScript ke JavaScript |

### Database & Auth
| Teknologi | Fungsi |
|-----------|--------|
| **Supabase** | Database PostgreSQL + Auth (JWT) |
| **@supabase/supabase-js** | Client library untuk query DB dan verifikasi token |
| **Row Level Security (RLS)** | Keamanan data level baris di Supabase |

### Notifikasi
| Teknologi | Fungsi |
|-----------|--------|
| **OneSignal** | Push notification ke Android |
| **Baileys (@whiskeysockets/baileys)** | WhatsApp Web API (tanpa nomor bisnis berbayar) |

### Logging
| Teknologi | Fungsi |
|-----------|--------|
| **Pino** | Logger performa tinggi (JSON format) |
| **pino-http** | Middleware log setiap HTTP request |

### Lainnya
| Teknologi | Fungsi |
|-----------|--------|
| **CORS** | Izinkan request dari domain lain (untuk app Android) |
| **qrcode / qrcode-terminal** | Generate QR code saat pairing WhatsApp |
| **pnpm** | Package manager monorepo |

---

## 3. Struktur Folder

```
artifacts/api-server/
├── src/
│   ├── index.ts              # Entry point — mulai server & inisialisasi WA
│   ├── app.ts                # Setup Express: middleware, routes, static files
│   │
│   ├── config/
│   │   ├── supabase.ts       # Koneksi ke Supabase (SUPABASE_URL + SERVICE_KEY)
│   │   └── onesignal.ts      # Config OneSignal (APP_ID + API_KEY)
│   │
│   ├── controllers/
│   │   ├── authController.ts      # Register, login, get profil (staf)
│   │   ├── antrianController.ts   # Kelola antrian (panggil, selesai, skip) — STAF
│   │   ├── mobileController.ts    # Semua endpoint untuk app Android nasabah
│   │   └── notifController.ts     # Test notif, manajemen koneksi WA
│   │
│   ├── middleware/
│   │   └── authMiddleware.ts      # Verifikasi JWT + cek role (teller/cs/nasabah)
│   │
│   ├── routes/
│   │   ├── index.ts          # Gabungkan semua router → /api/*
│   │   ├── auth.ts           # /api/auth/*
│   │   ├── antrian.ts        # /api/antrian/*
│   │   ├── mobile.ts         # /api/mobile/*
│   │   ├── notif.ts          # /api/notif/*
│   │   └── health.ts         # /api/health
│   │
│   ├── services/
│   │   ├── antrianService.ts      # Logika bisnis antrian + kirim notif
│   │   ├── onesignalService.ts    # Kirim push notification via OneSignal
│   │   ├── waService.ts           # Koneksi & kirim pesan WhatsApp (Baileys)
│   │   └── migrationService.ts    # Helper migrasi DB
│   │
│   └── lib/
│       └── logger.ts         # Konfigurasi Pino logger
│
├── public/
│   ├── login.html            # Halaman login staf (teller & CS)
│   ├── teller.html           # Dashboard Teller
│   ├── cs.html               # Dashboard CS
│   ├── tiket.html            # Fallback web jika nasabah belum install app
│   ├── css/                  # Stylesheet dashboard
│   ├── js/
│   │   ├── teller.js         # Logic dashboard teller
│   │   └── cs.js             # Logic dashboard CS
│   └── .well-known/
│       └── assetlinks.json   # Android App Links verification
│
├── supabase_schema.sql       # SQL lengkap — jalankan manual di Supabase
├── package.json
└── README.md                 # File ini
```

---

## 4. Database — Struktur Tabel

Jalankan file `supabase_schema.sql` di **Supabase Dashboard → SQL Editor → New Query → Run**.

### Tabel `profiles`
Menyimpan profil semua pengguna (teller, CS, nasabah).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | Sama dengan `auth.users.id` di Supabase |
| `nama` | TEXT | Nama lengkap pengguna |
| `no_hp` | TEXT | Nomor HP untuk WhatsApp notifikasi |
| `role` | TEXT | `nasabah` / `cs` / `teller` |
| `onesignal_player_id` | TEXT | ID device Android untuk push notification |
| `created_at` | TIMESTAMPTZ | Waktu registrasi |

### Tabel `antrian`
Menyimpan semua data antrian harian.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | ID unik antrian |
| `user_id` | UUID (FK) | Referensi ke `profiles.id` |
| `nama_nasabah` | TEXT | Nama (backup jika user dihapus) |
| `no_hp_nasabah` | TEXT | HP (backup) |
| `nomor_antrian` | INTEGER | Nomor antrian (1, 2, 3, ...) |
| `layanan` | TEXT | `Teller` atau `CS` |
| `keperluan` | TEXT | Sub-layanan (lihat tabel di bawah) |
| `status` | TEXT | `menunggu` / `dipanggil` / `selesai` / `batal` |
| `notif_sent` | BOOLEAN | Sudah dikirim notif atau belum |
| `created_at` | TIMESTAMPTZ | Waktu ambil nomor |
| `called_at` | TIMESTAMPTZ | Waktu dipanggil teller |
| `finished_at` | TIMESTAMPTZ | Waktu selesai dilayani |

### Pilihan Keperluan per Layanan

| Layanan | Keperluan yang Valid |
|---------|---------------------|
| **Teller** | `Setor Tunai`, `Tarik Tunai`, `Transfer`, `Pembayaran` |
| **CS** | `Buka Rekening`, `Pengajuan Kartu ATM`, `Info Produk Bank`, `Konsultasi Keuangan` |

### Status Antrian — Alur Hidup

```
menunggu → dipanggil → selesai
    ↓           ↓
   batal       batal
               ↓ (dalam 60 detik)
            menunggu  ← (restore/undo)
```

---

## 5. Alur Autentikasi

Semua endpoint yang membutuhkan login menggunakan **JWT Bearer Token** dari Supabase.

```
Request → Authorization: Bearer <token>
           │
           ▼
authMiddleware verifikasi token ke Supabase
           │
           ├─ Token invalid → 401 Unauthorized
           │
           └─ Token valid → lanjut ke controller
                            (req.user, req.userRole, req.userNama tersedia)
```

### Aturan Domain Email Staf

| Role | Domain Email |
|------|-------------|
| Teller | `@teller.com` |
| CS | `@cs.com` |
| Nasabah | Email apa saja |

---

## 6. Semua Endpoint API

**Base URL:** `https://antrianbank.site` (atau domain server Anda)

### 6.1 Health Check

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| GET | `/api/health` | Tidak | Cek server berjalan |

**Response:**
```json
{ "status": "ok", "timestamp": "2026-04-03T10:00:00Z" }
```

---

### 6.2 Auth Staf (Teller & CS)

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| POST | `/api/auth/login` | Tidak | Login teller/CS |
| GET | `/api/auth/me` | Bearer | Ambil profil staf |

**POST /api/auth/login — Request:**
```json
{
  "email": "teller1@teller.com",
  "password": "password123"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": { "id": "uuid", "email": "...", "role": "teller" }
  }
}
```

---

### 6.3 Antrian — Endpoint Staf (Teller & CS)

Semua endpoint ini membutuhkan **Bearer Token staf** (teller atau CS).

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/antrian/statistik` | Ringkasan statistik hari ini |
| GET | `/api/antrian/list` | Daftar antrian menunggu |
| GET | `/api/antrian/status` | Status antrian aktif saat ini |
| PUT | `/api/antrian/panggil` | Panggil nomor berikutnya |
| PUT | `/api/antrian/selesai/:id` | Tandai antrian selesai |
| PUT | `/api/antrian/batal/:id` | Skip/batalkan antrian |
| PUT | `/api/antrian/restore/:id` | Undo skip (maks 60 detik) |

**PUT /api/antrian/panggil — Response:**
```json
{
  "success": true,
  "data": {
    "antrian": {
      "id": "uuid",
      "nomor_antrian": 5,
      "nama_nasabah": "Budi Santoso",
      "layanan": "Teller",
      "keperluan": "Setor Tunai",
      "status": "dipanggil"
    },
    "notif_dikirim": true
  }
}
```

**GET /api/antrian/statistik — Response:**
```json
{
  "success": true,
  "data": {
    "total": 15,
    "menunggu": 3,
    "dipanggil": 1,
    "selesai": 10,
    "batal": 1,
    "per_layanan": {
      "Teller": { "total": 10, "menunggu": 2 },
      "CS": { "total": 5, "menunggu": 1 }
    }
  }
}
```

---

### 6.4 Notifikasi — Endpoint Staf

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| GET | `/api/notif/status` | Staf | Status koneksi WA & OneSignal |
| POST | `/api/notif/test-push` | Staf | Test kirim push notification |
| POST | `/api/notif/test-wa` | Staf | Test kirim pesan WhatsApp |
| GET | `/api/notif/wa/qr` | Teller | QR code pairing WhatsApp |
| POST | `/api/notif/wa/pairing-code` | Teller | Pairing WA via kode 8 digit |
| POST | `/api/notif/wa/disconnect` | Teller | Putuskan koneksi WhatsApp |

---

### 6.5 Mobile — Endpoint Nasabah (Android App)

#### Auth Nasabah

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| POST | `/api/mobile/daftar` | Tidak | Registrasi akun nasabah baru |
| POST | `/api/mobile/masuk` | Tidak | Login nasabah |
| GET | `/api/mobile/saya` | Bearer | Profil nasabah yang login |

**POST /api/mobile/daftar — Request:**
```json
{
  "nama": "Budi Santoso",
  "email": "budi@gmail.com",
  "password": "password123",
  "no_hp": "081234567890"
}
```

**POST /api/mobile/masuk — Request:**
```json
{
  "email": "budi@gmail.com",
  "password": "password123",
  "onesignal_player_id": "abc123-onesignal-device-id"
}
```
> `onesignal_player_id` wajib dikirim agar push notification berfungsi.

**Response (masuk):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "id": "uuid",
      "nama": "Budi Santoso",
      "email": "budi@gmail.com",
      "no_hp": "081234567890",
      "role": "nasabah"
    }
  }
}
```

---

#### Antrian Nasabah

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| POST | `/api/mobile/antrian/ambil` | Bearer | Ambil nomor antrian baru |
| GET | `/api/mobile/antrian/status` | Bearer | Status + posisi + estimasi |
| DELETE | `/api/mobile/antrian/:id` | Bearer | Batalkan antrian sendiri |
| GET | `/api/mobile/antrian/tiket/:id` | Bearer | HTML tiket antrian |

**POST /api/mobile/antrian/ambil — Request:**
```json
{
  "layanan": "Teller",
  "keperluan": "Setor Tunai"
}
```

**GET /api/mobile/antrian/status — Response:**
```json
{
  "success": true,
  "message": "Status antrian",
  "data": {
    "antrian": {
      "id": "uuid",
      "nomor_antrian": 12,
      "layanan": "Teller",
      "keperluan": "Setor Tunai",
      "status": "menunggu",
      "created_at": "2026-04-03T08:30:00Z"
    },
    "terlewati": false,
    "posisi": 4,
    "antrian_di_depan": 3,
    "estimasi_menit": 30,
    "menit_per_nasabah": 10
  }
}
```

> Jika antrian di-skip oleh teller (dalam 10 menit terakhir):
```json
{
  "success": true,
  "message": "Antrian Anda telah dilewati",
  "data": {
    "antrian": { "status": "batal", ... },
    "terlewati": true,
    "posisi": null,
    "estimasi_menit": null
  }
}
```

---

## 7. Alur Kerja Antrian (Step by Step)

### A. Nasabah Ambil Nomor (dari App Android)

```
1. Nasabah buka app → Login (POST /api/mobile/masuk)
2. Pilih layanan: "Teller" atau "CS"
3. Pilih keperluan (sub-layanan sesuai layanan)
4. POST /api/mobile/antrian/ambil
5. Backend: cek apakah nasabah sudah punya antrian aktif hari ini
6. Backend: generate nomor_antrian (auto-increment per layanan per hari)
7. Simpan ke tabel antrian dengan status "menunggu"
8. Response: nomor antrian + HTML tiket
```

### B. Teller/CS Panggil Nasabah (dari Dashboard Web)

```
1. Teller login di browser → Dashboard
2. Klik "Panggil Berikutnya" → PUT /api/antrian/panggil
3. Backend (atomic update):
   a. Ambil antrian pertama dengan status "menunggu" + layanan sesuai
   b. Update status → "dipanggil", catat called_at
   c. Pastikan tidak ada race condition (2 teller klik bersamaan)
4. Backend kirim notifikasi ke nasabah dalam 3 posisi ke depan:
   a. OneSignal push notification
   b. WhatsApp via Baileys
5. Update notif_sent = true untuk yang sudah dikirimi
```

### C. Teller/CS Selesai Melayani

```
1. Klik "Selesai" → PUT /api/antrian/selesai/:id
2. Backend: update status → "selesai", catat finished_at
3. Data durasi layanan (called_at → finished_at) digunakan
   untuk hitung rata-rata estimasi berikutnya
```

### D. Teller/CS Skip Nasabah

```
1. Klik "Skip/Lewati" → PUT /api/antrian/batal/:id
2. Backend: update status → "batal"
3. Backend kirim notifikasi ke nasabah yang diskip:
   - WA: "Antrian Anda dilewati, segera datang ke loket"
   - Push: tipe "skip" → Android tampilkan modal dialog
4. Teller bisa undo dalam 60 detik → PUT /api/antrian/restore/:id
```

---

## 8. Sistem Notifikasi

### WhatsApp (Baileys)

Baileys menghubungkan WhatsApp Web ke server tanpa memerlukan WhatsApp Business API berbayar.

**Setup awal (sekali saja):**
1. Login ke dashboard teller
2. Buka menu "Test Notif WA"
3. Scan QR code dengan HP WhatsApp yang akan dipakai sebagai pengirim
4. Setelah terhubung, koneksi tersimpan otomatis (tidak perlu scan ulang kecuali logout)

**Kapan WA dikirim otomatis:**
- Saat teller klik "Panggil Berikutnya" → ke semua nasabah dalam 3 posisi ke depan
- Saat teller klik "Skip" → ke nasabah yang dilewati

**Format pesan WA — Notifikasi Panggilan:**
```
Halo, [Nama]!

Nomor antrian Anda: *[N]* ([Layanan])
[Anda adalah antrian *berikutnya*! / Anda berada di posisi ke-*X* dari depan.]

Klik untuk lihat status antrian:
https://antrianbank.site/tiket?ticket=[N]

— FUND BANK, Cabang Sudirman
```

**Format pesan WA — Notifikasi Skip:**
```
Halo, [Nama]!

⚠️ Nomor antrian *[N]* ([Layanan]) Anda telah *dilewati*...

Lihat status atau ambil antrian baru:
https://antrianbank.site/tiket?ticket=[N]

— FUND BANK, Cabang Sudirman
```

### OneSignal Push Notification

**Data yang dikirim ke Android:**
```json
{
  "headings": { "id": "Segera Bersiap!" },
  "contents": { "id": "Antrian Anda nomor 5 akan segera dipanggil..." },
  "data": {
    "tipe": "normal",
    "nomor_antrian": 5
  }
}
```

Untuk skip, `"tipe": "skip"` — Android membaca field ini untuk menampilkan modal dialog.

**Syarat push berfungsi:** Nasabah harus mengirim `onesignal_player_id` saat login.

---

## 9. Estimasi Waktu Tunggu

Endpoint `GET /api/mobile/antrian/status` mengembalikan estimasi waktu tunggu.

**Formula:**
```
estimasi_menit = antrian_di_depan × menit_per_nasabah
```

**Cara hitung `menit_per_nasabah`:**
1. Ambil max 20 antrian yang **selesai** hari ini di layanan yang sama
2. Hitung durasi masing-masing: `finished_at - called_at`
3. Abaikan durasi > 60 menit (anomali — teller lupa klik selesai)
4. Rata-ratakan semua durasi yang valid
5. Jika belum ada data hari ini → gunakan default **10 menit**

**Contoh:**
```
Posisi Anda = 4 (ada 3 orang di depan)
Rata-rata layanan hari ini = 8 menit

estimasi_menit = 3 × 8 = 24 menit
```

---

## 10. App Links (Android Deep Link)

Link WA yang dikirim ke nasabah: `https://antrianbank.site/tiket?ticket=17`

**Jika app Android sudah terinstall:** Link langsung membuka app.
**Jika belum terinstall:** Browser membuka halaman `/tiket` yang menampilkan tombol download APK.

### File Verifikasi Android

File `public/.well-known/assetlinks.json`:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.antrianbank",
      "sha256_cert_fingerprints": [
        "50:8E:51:4D:ED:63:04:F6:90:47:1C:9E:52:35:D0:94:3B:94:7C:56:20:50:31:75:60:9E:1F:98:D4:5D:34:AE"
      ]
    }
  }
]
```

Backend otomatis melayani file ini di `GET /.well-known/assetlinks.json`.

---

## 11. Integrasi Android Studio

### Dependensi yang Diperlukan (`build.gradle` app)

```gradle
dependencies {
    // HTTP Client
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.9.1'

    // OneSignal Push Notification
    implementation 'com.onesignal:OneSignal:5.+'

    // Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'

    // Material Design (untuk dialog modal)
    implementation 'com.google.android.material:material:1.11.0'
}
```

### Base URL

```kotlin
// ApiClient.kt
const val BASE_URL = "https://antrianbank.site/"
```

### Alur Login & Simpan Token

```kotlin
// SessionManager.kt
class SessionManager(context: Context) {
    private val prefs = context.getSharedPreferences("fund_bank_session", Context.MODE_PRIVATE)

    fun saveToken(token: String) = prefs.edit().putString("token", token).apply()
    fun getToken(): String? = prefs.getString("token", null)
    fun clearSession() = prefs.edit().clear().apply()
}
```

### Kirim OneSignal Player ID saat Login

```kotlin
// Di LoginActivity atau saat login:
val playerId = OneSignal.getDeviceState()?.userId ?: ""

val request = MasukRequest(
    email = email,
    password = password,
    onesignal_player_id = playerId   // WAJIB — untuk push notif
)

val response = apiRepository.masuk(request)
sessionManager.saveToken(response.data.token)
```

### Polling Status Antrian (Tiap 15 Detik)

```kotlin
// TiketActivity.kt
private fun startPolling() {
    pollingJob = lifecycleScope.launch {
        while (isActive) {
            try {
                val response = apiRepository.getStatusAntrian()
                if (response.success && response.data != null) {

                    if (response.data.terlewati) {
                        // Tampilkan modal "antrian dilewati"
                        tampilkanModalSkip(response.data.antrian.nomor_antrian)
                    } else {
                        updateUI(response.data)
                    }
                }
            } catch (e: Exception) {
                Log.e("TiketActivity", "Error polling: ${e.message}")
            }
            delay(15_000) // tunggu 15 detik
        }
    }
}
```

### Handle Push Notification Tipe Skip

```kotlin
// NotifManager.kt (Application class)
OneSignal.setNotificationWillShowInForegroundHandler { event ->
    val tipe = event.notification.additionalData?.optString("tipe") ?: "normal"

    if (tipe == "skip") {
        val nomor = event.notification.additionalData?.optInt("nomor_antrian", -1) ?: -1
        // Tampilkan modal langsung di TiketActivity
        event.complete(null)
    } else {
        event.complete(event.notification)
    }
}

OneSignal.setNotificationOpenedHandler { result ->
    val tipe = result.notification.additionalData?.optString("tipe", "normal")
    val nomor = result.notification.additionalData?.optInt("nomor_antrian", -1)

    val intent = Intent(applicationContext, TiketActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra("tipe", tipe)
        putExtra("nomor_antrian", nomor)
    }
    startActivity(intent)
}
```

### Modal Dialog Antrian Dilewati

```kotlin
private fun tampilkanModalSkip(nomorAntrian: Int) {
    MaterialAlertDialogBuilder(this)
        .setTitle("⚠️ Antrian Anda Dilewati")
        .setMessage(
            "Nomor antrian $nomorAntrian Anda telah dilewati karena tidak hadir " +
            "saat dipanggil.\n\nJika ada notifikasi WhatsApp dari kami, segera " +
            "datang ke loket agar tidak dilewati kembali."
        )
        .setPositiveButton("Ambil Antrian Baru") { _, _ ->
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
        .setNegativeButton("Tutup") { dialog, _ -> dialog.dismiss(); finish() }
        .setCancelable(false)
        .show()
}
```

### Android Manifest — App Links & Deep Link

```xml
<activity
    android:name=".ui.TiketActivity"
    android:exported="true"
    android:launchMode="singleTask">

    <!-- Launcher -->
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- App Link HTTPS (butuh assetlinks.json di server) -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https"
              android:host="antrianbank.site"
              android:pathPrefix="/tiket" />
    </intent-filter>

</activity>
```

---

## 12. Variabel Lingkungan

Buat file `.env` di root project atau set di Replit Secrets:

| Variable | Keterangan | Contoh |
|----------|------------|--------|
| `PORT` | Port server berjalan | `8080` |
| `SUPABASE_URL` | URL project Supabase | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key Supabase | `eyJhbGci...` |
| `SUPABASE_ANON_KEY` | Anon key Supabase | `eyJhbGci...` |
| `SUPABASE_DB_PASSWORD` | Password database Supabase | `xxx` |
| `ONESIGNAL_APP_ID` | App ID dari OneSignal dashboard | `xxxxxxxx-xxxx-...` |
| `ONESIGNAL_API_KEY` | REST API Key dari OneSignal | `os_v2_...` |
| `SESSION_SECRET` | Secret untuk session cookie | `random-string-panjang` |

---

## 13. Menjalankan Server

### Development

```bash
pnpm --filter @workspace/api-server run dev
```

Server akan:
1. Build TypeScript → JavaScript (`dist/`)
2. Jalankan server di port yang ditentukan
3. Inisialisasi koneksi WhatsApp (perlu scan QR pertama kali)

### Cek Semua Berjalan

```bash
# Health check
curl http://localhost:8080/api/health

# Test assetlinks.json
curl http://localhost:8080/.well-known/assetlinks.json

# Test halaman tiket
curl http://localhost:8080/tiket?ticket=1
```

### Alur Setup Pertama Kali

```
1. Clone/buka project di Replit
2. Set semua environment variables (Replit Secrets)
3. Jalankan supabase_schema.sql di Supabase Dashboard
4. Jalankan server: pnpm run dev
5. Buka dashboard: https://domain-anda/login
6. Login sebagai teller → buka "Test Notif WA"
7. Scan QR code dengan HP WhatsApp pengirim
8. ✅ Sistem siap digunakan
```

---

*Dokumentasi ini dibuat untuk FUND BANK — Sistem Antrian Digital*
*Backend: Node.js + Express + Supabase + Baileys + OneSignal*

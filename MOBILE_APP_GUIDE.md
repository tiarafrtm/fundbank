# Panduan Pengembangan Aplikasi Mobile Antrian Bank
> Dokumen ini ditujukan untuk developer Android Studio yang membangun aplikasi nasabah.
> Seluruh endpoint di bawah ini aktif dan sudah diuji. Diperbarui sesuai kondisi backend terkini.

---

## Daftar Isi
1. [Informasi Umum Backend](#1-informasi-umum-backend)
2. [Alur Aplikasi Mobile](#2-alur-aplikasi-mobile)
3. [API Nasabah Mobile](#3-api-nasabah-mobile)
   - 3.1 [Daftar Akun Baru](#31-daftar-akun-baru)
   - 3.2 [Login](#32-login)
   - 3.3 [Profil Nasabah](#33-profil-nasabah)
   - 3.4 [Ambil Nomor Antrian](#34-ambil-nomor-antrian)
   - 3.5 [Status Antrian Aktif](#35-status-antrian-aktif)
   - 3.5.1 [Panduan Tampilan Layar Status Antrian](#351-panduan-tampilan-layar-status-antrian)
   - 3.6 [Batalkan Antrian](#36-batalkan-antrian)
   - 3.7 [Tiket Antrian (HTML Cetak)](#37-tiket-antrian-html-cetak)
4. [Format Pesan WhatsApp](#4-format-pesan-whatsapp)
5. [Deep Link](#5-deep-link)
6. [Push Notification OneSignal](#6-push-notification-onesignal)
7. [Status & Kode Error](#7-status--kode-error)
8. [Catatan Implementasi Android](#8-catatan-implementasi-android)
9. [Referensi Endpoint Lengkap](#9-referensi-endpoint-lengkap)

---

## 1. Informasi Umum Backend

| Info | Detail |
|------|--------|
| **Base URL Development** | `https://56b2884a-4a9e-4d63-b066-04c90f2f004a-00-f0nkpniuy9wf.janeway.replit.dev` |
| **Base URL Produksi** | `https://<domain-produksi>` ← diisi setelah deploy |
| **Base URL Mobile** | `<Base URL>/api/mobile` |
| **Format** | JSON (request & response) |
| **Auth** | Bearer Token (JWT dari Supabase) |
| **Content-Type** | `application/json` |
| **Token Validity** | ±1 jam (perlu login ulang jika expired) |

### Setup Testing di Android Studio (Tanpa Hosting)

Backend sudah bisa diakses langsung dari Android Studio selama project Replit sedang berjalan — tidak perlu hosting terlebih dahulu.

**Langkah 1 — Tambahkan izin internet di `AndroidManifest.xml`:**
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

**Langkah 2 — Definisikan Base URL di Kotlin:**
```kotlin
object ApiConfig {
    // Ganti dengan URL produksi setelah deploy
    const val BASE_URL = "https://56b2884a-4a9e-4d63-b066-04c90f2f004a-00-f0nkpniuy9wf.janeway.replit.dev"
}
```

**Langkah 3 — Setup Retrofit (contoh):**
```kotlin
val retrofit = Retrofit.Builder()
    .baseUrl(ApiConfig.BASE_URL + "/")
    .addConverterFactory(GsonConverterFactory.create())
    .build()
```

> **Catatan penting saat testing:**
> - Backend hanya aktif selama project Replit **sedang terbuka dan running**. Jangan tutup tab Replit saat testing.
> - URL development di atas bisa berubah jika project di-restart setelah lama tidak aktif. Jika koneksi gagal, cek URL terbaru di halaman Replit.
> - Untuk testing di emulator Android Studio, pastikan emulator terhubung ke internet (bukan airplane mode).
> - Setelah siap production, deploy project ini untuk mendapatkan URL permanen (contoh: `https://nama-project.replit.app`).

---

### Header Wajib untuk Endpoint yang Membutuhkan Login
```
Content-Type: application/json
Authorization: Bearer <access_token>
```

### Format Response Konsisten (semua endpoint)
```json
{
  "success": true | false,
  "message": "Pesan yang mudah dibaca manusia",
  "data": { ... }
}
```

---

## 2. Alur Aplikasi Mobile

```
[BUKA APP]
     |
     v
[Cek token tersimpan?]
  +-- Tidak --> [Layar Login / Register]
  |
  +-- Ya   --> [Validasi token ke GET /api/mobile/saya]
                    |
               +----+----+
               |         |
           [401/403]   [200 OK]
               |         |
          [Login]    [Cek antrian aktif]
                     GET /api/mobile/antrian/status
                          |
               +----------+----------+
               |                     |
           [404 Tidak ada]       [200 Ada antrian]
               |                     |
    [Layar Pilih Layanan]    [Layar Status Antrian]
    [ Teller ]  [ CS ]        Polling tiap 15 detik
               |                     |
    [POST /api/mobile/antrian/ambil]  |
               |              +------+--------+
               |              |               |
               |          [menunggu]    [dipanggil]
               |              |               |
    [Layar Nomor Antrian] (lanjut       [Tampilkan
                          polling)       notifikasi]
                                              |
                                     [GET /api/mobile/antrian/tiket/:id]
                                              |
                                       [WebView Tiket]
```

---

## 3. API Nasabah Mobile

Semua endpoint mobile ada di bawah prefix `/api/mobile/`.

---

### 3.1 Daftar Akun Baru

```
POST /api/mobile/daftar
```

Tidak memerlukan token. Nasabah mendaftar menggunakan **email dan password**.

**Request Body:**
```json
{
  "nama":     "Budi Santoso",
  "email":    "budi@gmail.com",
  "no_hp":    "08123456789",
  "password": "password123"
}
```

| Field | Wajib | Validasi |
|-------|-------|----------|
| `nama` | Ya | Tidak boleh kosong |
| `email` | Ya | Format email valid (contoh: `budi@gmail.com`) |
| `no_hp` | Ya | Tidak boleh kosong |
| `password` | Ya | Minimal **6 karakter** |

**Response sukses `201`:**
```json
{
  "success": true,
  "message": "Pendaftaran berhasil! Silakan masuk dengan email dan password Anda.",
  "data": {
    "id":    "uuid-user",
    "nama":  "Budi Santoso",
    "email": "budi@gmail.com",
    "no_hp": "08123456789"
  }
}
```

**Response error `400` — email sudah terdaftar:**
```json
{
  "success": false,
  "message": "Email sudah terdaftar, silakan masuk",
  "data": {}
}
```

**Response error `400` — format email tidak valid:**
```json
{
  "success": false,
  "message": "Format email tidak valid",
  "data": {}
}
```

---

### 3.2 Login

```
POST /api/mobile/masuk
```

Tidak memerlukan token. Login menggunakan **email + password**.

**Request Body:**
```json
{
  "email":    "budi@gmail.com",
  "password": "password123"
}
```

**Response sukses `200`:**
```json
{
  "success": true,
  "message": "Masuk berhasil",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id":    "uuid-user",
      "nama":  "Budi Santoso",
      "email": "budi@gmail.com",
      "no_hp": "08123456789",
      "role":  "nasabah"
    }
  }
}
```

> Simpan `token` di `EncryptedSharedPreferences`. Token berlaku ±1 jam.
> Jika response `401`, tampilkan layar login kembali.

**Response error `401`:**
```json
{
  "success": false,
  "message": "Email atau password salah",
  "data": {}
}
```

**Response error `403` — bukan akun nasabah:**
```json
{
  "success": false,
  "message": "Akun ini bukan akun nasabah mobile",
  "data": {}
}
```

---

### 3.3 Profil Nasabah

```
GET /api/mobile/saya
Authorization: Bearer <token>
```

Gunakan endpoint ini untuk memvalidasi token tersimpan saat app dibuka.

**Response `200`:**
```json
{
  "success": true,
  "message": "Profil berhasil diambil",
  "data": {
    "user": {
      "id":    "uuid-user",
      "nama":  "Budi Santoso",
      "email": "budi@gmail.com",
      "no_hp": "08123456789",
      "role":  "nasabah"
    }
  }
}
```

**Response `401`** — token tidak valid/expired → redirect ke layar login.

---

### 3.4 Ambil Nomor Antrian

```
POST /api/mobile/antrian/ambil
Authorization: Bearer <token>
```

Nasabah hanya bisa memiliki **satu antrian aktif per hari**. Jika sudah ada, endpoint ini akan menolak dengan `400`.

**Request Body:**
```json
{
  "layanan":              "Teller",
  "keperluan":            "Setor Tunai",
  "onesignal_player_id": "player-id-dari-onesignal-sdk"
}
```

| Field | Wajib | Nilai yang valid |
|-------|-------|-----------------|
| `layanan` | Ya | `"Teller"` atau `"CS"` |
| `keperluan` | Disarankan | Lihat tabel di bawah |
| `onesignal_player_id` | Tidak | String player ID dari OneSignal SDK — untuk push notification |

**Daftar `keperluan` per layanan:**

| Layanan | Pilihan `keperluan` |
|---------|---------------------|
| `"Teller"` | `"Setor Tunai"` · `"Tarik Tunai"` · `"Transfer"` · `"Pembayaran"` |
| `"CS"` | `"Buka Rekening"` · `"Pengajuan Kartu ATM"` · `"Info Produk Bank"` · `"Konsultasi Keuangan"` |

> Jika `keperluan` diisi dengan nilai di luar daftar, backend akan menolak dengan `400`.

**Response sukses `201`:**
```json
{
  "success": true,
  "message": "Antrian Teller nomor 10 berhasil dibuat",
  "data": {
    "antrian": {
      "id":            "uuid-antrian",
      "user_id":       "uuid-user",
      "nomor_antrian": 10,
      "layanan":       "Teller",
      "keperluan":     "Setor Tunai",
      "status":        "menunggu",
      "notif_sent":    false,
      "created_at":    "2026-04-02T09:00:00.000Z"
    },
    "nomor_antrian": 10
  }
}
```

**Response error `400` — sudah punya antrian aktif:**
```json
{
  "success": false,
  "message": "Anda sudah memiliki antrian aktif hari ini",
  "data": {
    "antrian": {
      "id":            "uuid-antrian-lama",
      "nomor_antrian": 7,
      "layanan":       "Teller",
      "status":        "menunggu"
    }
  }
}
```

**Response error `400` — layanan tidak valid:**
```json
{
  "success": false,
  "message": "Jenis layanan wajib dipilih: Teller atau CS",
  "data": {}
}
```

**Response error `400` — keperluan tidak valid:**
```json
{
  "success": false,
  "message": "Keperluan tidak valid untuk layanan Teller. Pilihan: Setor Tunai, Tarik Tunai, Transfer, Pembayaran",
  "data": {}
}
```

---

### 3.5 Status Antrian Aktif

```
GET /api/mobile/antrian/status
Authorization: Bearer <token>
```

Gunakan endpoint ini untuk **polling** (tiap 15 detik) untuk mengetahui posisi dan status antrian nasabah hari ini.

**Response `200`:**
```json
{
  "success": true,
  "message": "Status antrian",
  "data": {
    "antrian": {
      "id":            "uuid-antrian",
      "nomor_antrian": 10,
      "layanan":       "Teller",
      "status":        "menunggu",
      "notif_sent":    false,
      "created_at":    "2026-04-02T09:00:00.000Z",
      "called_at":     null,
      "finished_at":   null
    },
    "posisi":            3,
    "antrian_di_depan":  2,
    "estimasi_menit":    20,
    "menit_per_nasabah": 10
  }
}
```

| Field | Keterangan |
|-------|------------|
| `posisi` | Urutan nasabah saat ini (1 = giliran berikutnya) |
| `antrian_di_depan` | Jumlah orang yang masih menunggu di depan |
| `estimasi_menit` | Perkiraan waktu tunggu dalam menit (`antrian_di_depan × menit_per_nasabah`) |
| `menit_per_nasabah` | Rata-rata durasi layanan per nasabah hari ini (default 10 menit) |
| `called_at` | Waktu dipanggil (diisi saat status menjadi `dipanggil`) |
| `finished_at` | Waktu selesai (diisi saat status menjadi `selesai`) |

**Siklus status antrian:**

| `status` | Arti | Tindakan di App |
|----------|------|-----------------|
| `menunggu` | Masih dalam antrian | Tampilkan posisi, lanjut polling |
| `dipanggil` | Nomor dipanggil loket | Tampilkan notifikasi, buka tiket, stop polling |
| `selesai` | Layanan sudah selesai | Tampilkan pesan terima kasih, bersihkan state |
| `batal` | Dibatalkan (nasabah/teller) | Kembali ke layar pilih layanan |

**Response `404` — tidak ada antrian hari ini:**
```json
{
  "success": false,
  "message": "Tidak ada antrian aktif hari ini",
  "data": {}
}
```

---

### 3.5.1 Panduan Tampilan Layar Status Antrian

Gunakan field `posisi` dan `status` dari response `/api/mobile/antrian/status` untuk menentukan tampilan yang tepat.

#### Kondisi & Tampilan yang Direkomendasikan

| Kondisi | `status` | `posisi` | Tampilan Utama | Warna/Tone |
|---------|----------|----------|----------------|------------|
| Menunggu jauh | `menunggu` | > 3 | Nomor antrian besar + sisa antrian + estimasi waktu | Abu-abu / netral |
| Hampir giliran | `menunggu` | 2–3 | "Segera bersiap!" + sisa antrian | Oranye (`#F97316`) |
| Berikutnya | `menunggu` | 1 | "Giliran Anda berikutnya!" | Oranye highlight penuh |
| Dipanggil | `dipanggil` | — | Full screen: "Silakan menuju loket!" | Hijau / oranye bold |
| Selesai | `selesai` | — | "Terima kasih, layanan selesai" + tombol pulang | Hijau |
| Batal | `batal` | — | "Antrian dibatalkan" + tombol ambil ulang | Merah / netral |

#### Logika Kotlin yang Direkomendasikan

```kotlin
fun renderAntrianState(antrian: AntrianData, posisi: Int) {
    when {
        antrian.status == "dipanggil" -> showDipanggil()
        antrian.status == "selesai"   -> showSelesai()
        antrian.status == "batal"     -> showBatal()
        posisi == 1                   -> showGiliranBerikutnya()
        posisi in 2..3                -> showSegerapBersiap(posisi)
        else                          -> showMenunggu(posisi)
    }
}
```

#### Detail Setiap State

**State 1 — Menunggu (posisi > 3)**
```
┌─────────────────────────┐
│  Nomor Antrian Anda     │
│                         │
│        [ 10 ]           │  ← font besar, warna oranye
│      Teller             │
│                         │
│  Posisi    : ke-4       │
│  Di depan  : 3 orang    │
│  Estimasi  : ~15 menit  │  ← estimasi: posisi × rata2 layanan (mis. 5 menit/orang)
│                         │
│  [   Batalkan Antrian   ]│
└─────────────────────────┘
```

**State 2 — Segera Bersiap (posisi 2–3)**
```
┌─────────────────────────┐
│  ⬤ Segera Bersiap!     │  ← banner oranye
│                         │
│        [ 10 ]           │
│      Teller             │
│                         │
│  2 orang di depan Anda  │
│  Harap mendekat ke loket│
│                         │
│  [   Batalkan Antrian   ]│
└─────────────────────────┘
```

**State 3 — Giliran Berikutnya (posisi 1)**
```
┌─────────────────────────┐
│  ★ Giliran Anda         │
│    Berikutnya!          │  ← background oranye penuh
│                         │
│        [ 10 ]           │  ← putih di atas oranye
│      Teller             │
│                         │
│  Silakan siapkan dokumen│
│  dan menuju area tunggu │
└─────────────────────────┘
```

**State 4 — Dipanggil (status = `dipanggil`)**
```
┌─────────────────────────┐
│                         │
│   Silakan Menuju        │
│      Loket!             │  ← full screen, background hijau/oranye
│                         │
│        [ 10 ]           │
│      Teller             │
│                         │
│  [  Lihat Tiket PDF  ]  │
└─────────────────────────┘
```

> Saat status berubah menjadi `dipanggil`, hentikan polling dan tampilkan notifikasi lokal Android
> (`NotificationManager`) sebagai cadangan push notification.

#### Estimasi Waktu

Estimasi dihitung di sisi Android, bukan dari backend:

```kotlin
// Asumsi rata-rata 5 menit per nasabah
val RATA_RATA_MENIT_PER_NASABAH = 5

fun hitungEstimasi(antrianDiDepan: Int): String {
    val totalMenit = antrianDiDepan * RATA_RATA_MENIT_PER_NASABAH
    return when {
        totalMenit < 5  -> "< 5 menit"
        totalMenit < 60 -> "~$totalMenit menit"
        else -> {
            val jam = totalMenit / 60
            val menit = totalMenit % 60
            "~$jam jam $menit menit"
        }
    }
}
```

> Tampilkan label "Estimasi" dengan jelas agar nasabah tahu ini perkiraan, bukan waktu pasti.
> Hanya tampilkan estimasi saat `posisi > 1`. Saat posisi 1, lebih baik ganti dengan instruksi aksi.

#### Notifikasi Lokal Android (Cadangan Push)

Saat status berubah dari `menunggu` ke `dipanggil` melalui polling, tampilkan notifikasi lokal:

```kotlin
fun showLocalNotification(context: Context, nomor: Int) {
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle("Antrian Anda Dipanggil!")
        .setContentText("Nomor $nomor — Silakan menuju loket.")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .build()

    NotificationManagerCompat.from(context).notify(1, notification)
}
```

---

### 3.6 Batalkan Antrian

```
DELETE /api/mobile/antrian/:id
Authorization: Bearer <token>
```

Ganti `:id` dengan nilai `antrian.id` dari response status. Nasabah hanya bisa membatalkan antrian **miliknya sendiri** yang berstatus `menunggu`.

**Contoh:**
```
DELETE /api/mobile/antrian/uuid-antrian-123
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Antrian nomor 10 berhasil dibatalkan",
  "data": {
    "antrian": {
      "id":            "uuid-antrian",
      "nomor_antrian": 10,
      "layanan":       "Teller",
      "status":        "batal"
    }
  }
}
```

**Response `404` — tidak dapat dibatalkan:**
```json
{
  "success": false,
  "message": "Antrian tidak ditemukan atau tidak dapat dibatalkan",
  "data": {}
}
```

> Antrian yang sudah `dipanggil`, `selesai`, atau `batal` tidak dapat dibatalkan lagi.
> Antrian milik nasabah lain juga tidak dapat dibatalkan dari endpoint ini.

---

### 3.7 Tiket Antrian (HTML Cetak)

```
GET /api/mobile/antrian/tiket/:id
Authorization: Bearer <token>
```

Response berupa **HTML siap cetak**, bukan JSON. Tampilkan menggunakan `WebView` di Android.

**Contoh:**
```
GET /api/mobile/antrian/tiket/uuid-antrian-123
```

**Isi tiket yang ditampilkan:**
- Logo dan nama bank (Bank ABC, Cabang Sudirman)
- Nomor antrian besar (font 84px, warna oranye)
- Label layanan (Teller / Customer Service)
- Nama nasabah, Email
- Waktu ambil nomor (format lokal Indonesia)
- Chip status berwarna (Menunggu / Dipanggil / Selesai / Dibatalkan)
- Tombol cetak (menggunakan `window.print()`)

**Response `404`:**
```json
{
  "success": false,
  "message": "Tiket tidak ditemukan",
  "data": {}
}
```

---

## 4. Format Pesan WhatsApp

Backend mengirim pesan WhatsApp secara otomatis via Baileys ketika loket memanggil nomor berikutnya. Pesan dikirim ke nomor HP nasabah yang terdaftar saat posisi nasabah tinggal 3 antrian ke depan.

**Kondisi pengiriman WA:**
- Posisi nasabah ≤ 3 dari nomor yang sedang dipanggil
- Field `notif_sent` di database masih `false` (tidak dikirim dua kali)
- Status antrian nasabah masih `menunggu` saat notifikasi hendak dikirim

**Format pesan:**
```
Halo, Budi Santoso!

Kami informasikan bahwa nomor antrian Anda *10*
di layanan Teller akan segera dipanggil.

Harap segera menuju loket yang tersedia.

Klik untuk lihat status antrian:
bankantrian://queue?ticket=10

— Bank ABC, Cabang Sudirman
```

> Nomor antrian dicetak **bold** menggunakan format WhatsApp Markdown (`*10*`).
> Deep link `bankantrian://queue?ticket=10` akan membuka app nasabah langsung ke layar status.

---

## 5. Deep Link

Daftarkan skema berikut di AndroidManifest agar app bisa dibuka dari notifikasi WA:

```
bankantrian://queue?ticket=<nomor_antrian>
```

**Contoh:** `bankantrian://queue?ticket=10`

**AndroidManifest.xml:**
```xml
<activity android:name=".QueueStatusActivity"
    android:launchMode="singleTask"
    android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
      android:scheme="bankantrian"
      android:host="queue" />
  </intent-filter>
</activity>
```

**Cara ambil parameter di Activity:**
```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val ticketNumber = intent?.data?.getQueryParameter("ticket")
    // ticketNumber = "10" → gunakan untuk tampilkan status antrian
}
```

---

## 6. Push Notification OneSignal

Push notification dikirim oleh backend saat nomor antrian nasabah mendekati giliran (≤ 3 posisi ke depan).

### Langkah Integrasi

1. Tambahkan **OneSignal Android SDK** ke `build.gradle`
2. Inisialisasi OneSignal di `Application` class
3. Ambil `player_id` dan kirim ke backend saat ambil antrian

```kotlin
// Di Application class
OneSignal.initWithContext(this, "YOUR_ONESIGNAL_APP_ID")

// Ambil player ID
val playerId = OneSignal.User.pushSubscription.id

// Kirim ke backend saat POST /api/mobile/antrian/ambil
val body = JSONObject().apply {
    put("layanan", "Teller")          // atau "CS"
    put("keperluan", "Setor Tunai")   // pilih dari daftar keperluan sesuai layanan
    put("onesignal_player_id", playerId)
}
```

### Payload Push Notification yang Diterima

```json
{
  "headings": { "en": "Antrian Anda Segera Dipanggil" },
  "contents": { "en": "Nomor antrian 10 akan segera dipanggil. Harap menuju loket." }
}
```

### Handle Notifikasi

```kotlin
OneSignal.Notifications.addClickListener { result ->
    val data = result.notification.additionalData
    // Buka layar status antrian
    startActivity(Intent(this, QueueStatusActivity::class.java))
}
```

---

## 7. Status & Kode Error

| HTTP Code | Arti | Tindakan di App |
|-----------|------|-----------------|
| `200` | Sukses | Proses data `data` |
| `201` | Berhasil dibuat | Proses data `data` |
| `400` | Validasi gagal | Tampilkan `message` ke user |
| `401` | Token expired atau tidak valid | Hapus token, redirect ke layar login |
| `403` | Bukan akun nasabah | Tampilkan error, logout paksa |
| `404` | Data tidak ditemukan | Tangani kasus: tidak ada antrian, tiket tidak ada, dll |
| `500` | Error server | Tampilkan "Terjadi kesalahan, silakan coba lagi" |

**Semua error menggunakan format yang sama:**
```json
{
  "success": false,
  "message": "Deskripsi error yang jelas",
  "data": {}
}
```

---

## 8. Catatan Implementasi Android

### Penyimpanan Token (EncryptedSharedPreferences)
```kotlin
// Inisialisasi
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val prefs = EncryptedSharedPreferences.create(
    context, "bank_prefs", masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

// Simpan setelah login
prefs.edit().apply {
    putString("bank_token", token)
    putString("bank_user_id", user.id)
    putString("bank_user_nama", user.nama)
    putString("bank_user_email", user.email)
    apply()
}

// Ambil
val token = prefs.getString("bank_token", null)

// Hapus saat logout
prefs.edit().clear().apply()
```

### Validasi Token saat App Dibuka
```kotlin
// Di SplashActivity / ViewModel
suspend fun checkSession(): Boolean {
    val token = prefs.getString("bank_token", null) ?: return false
    return try {
        val response = api.getSaya("Bearer $token")
        response.success
    } catch (e: Exception) {
        false // Token expired atau server tidak bisa diakses
    }
}
```

### Polling Status Antrian (tiap 15 detik)
```kotlin
private fun startPolling() {
    viewModelScope.launch {
        while (isActive) {
            try {
                val result = api.getAntrianStatus("Bearer $token")
                if (result.success) {
                    _antrianState.value = result.data
                    // Hentikan polling jika sudah dipanggil atau selesai
                    val status = result.data.antrian.status
                    if (status == "dipanggil" || status == "selesai" || status == "batal") {
                        break
                    }
                }
            } catch (e: Exception) {
                // Tetap lanjut polling saat network error sementara
            }
            delay(15_000)
        }
    }
}
```

### Menampilkan Tiket di WebView
```kotlin
val webView = findViewById<WebView>(R.id.webView)
webView.settings.javaScriptEnabled = true

val url = "$BASE_URL/api/mobile/antrian/tiket/$antrianId"
val headers = mapOf("Authorization" to "Bearer $token")
webView.loadUrl(url, headers)
```

### Cetak PDF dari Tiket
```kotlin
val printManager = getSystemService(PRINT_SERVICE) as PrintManager
val printAdapter = webView.createPrintDocumentAdapter("Tiket Antrian $nomor")
val printAttributes = PrintAttributes.Builder()
    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
    .build()
printManager.print("Tiket_Antrian_$nomor", printAdapter, printAttributes)
```

### Struktur Layar yang Direkomendasikan
```
SplashActivity
  +-- [Cek token] --> LoginActivity
  |                     +-- RegisterActivity
  |
  +-- [Token valid] --> HomeActivity
                          +-- [Tidak ada antrian] --> PilihLayananActivity
                          |                              +-- ConfirmAntrianActivity
                          |
                          +-- [Ada antrian] --> StatusAntrianActivity (polling)
                                                    +-- TiketActivity (WebView)
                                                    +-- SelesaiActivity
```

---

## 9. Referensi Endpoint Lengkap

### Nasabah Mobile (`/api/mobile/*`)

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| `POST` | `/api/mobile/daftar` | Tidak | Daftar akun baru dengan email |
| `POST` | `/api/mobile/masuk` | Tidak | Login dengan email + password |
| `GET` | `/api/mobile/saya` | Bearer | Profil nasabah, validasi token |
| `POST` | `/api/mobile/antrian/ambil` | Bearer | Ambil nomor antrian (Teller/CS) |
| `GET` | `/api/mobile/antrian/status` | Bearer | Status & posisi antrian aktif hari ini |
| `DELETE` | `/api/mobile/antrian/:id` | Bearer | Batalkan antrian sendiri |
| `GET` | `/api/mobile/antrian/tiket/:id` | Bearer | Tiket HTML siap cetak |

### Catatan Keamanan Backend (Untuk Referensi)

Backend sudah mengimplementasikan beberapa lapisan keamanan yang perlu diketahui developer mobile:

| Fitur | Detail |
|-------|--------|
| **Satu antrian per hari** | Nasabah tidak bisa ambil dua nomor antrian di hari yang sama |
| **Token JWT** | Semua endpoint yang butuh login harus sertakan header `Authorization: Bearer <token>` |
| **Role isolation** | Token nasabah tidak bisa mengakses endpoint Teller/CS dan sebaliknya |
| **Notif WA satu kali** | Flag `notif_sent` memastikan WhatsApp tidak dikirim dua kali ke nasabah yang sama |
| **Status validation** | Antrian yang sudah `selesai` atau `batal` tidak bisa diubah lagi |

### Nilai `layanan` yang Didukung

| Nilai di API | Tampil di UI |
|-------------|-------------|
| `"Teller"` | Teller |
| `"CS"` | Customer Service |

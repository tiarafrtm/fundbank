# Panduan Pengembangan Aplikasi Mobile Antrian Bank
> Dokumen ini ditujukan untuk developer Android Studio yang akan membangun aplikasi nasabah.
> Backend sudah siap dan seluruh endpoint di bawah ini aktif.

---

## Daftar Isi
1. [Informasi Umum Backend](#1-informasi-umum-backend)
2. [Alur Aplikasi Mobile](#2-alur-aplikasi-mobile)
3. [Skema API Lengkap](#3-skema-api-lengkap)
4. [Format Pesan WhatsApp](#4-format-pesan-whatsapp)
5. [Deep Link](#5-deep-link)
6. [Push Notification OneSignal](#6-push-notification-onesignal)
7. [Status & Kode Error](#7-status--kode-error)
8. [Catatan Implementasi Android](#8-catatan-implementasi-android)

---

## 1. Informasi Umum Backend

| Info | Detail |
|------|--------|
| **Base URL** | `https://<domain-produksi>/api/mobile` |
| **Format** | JSON (request & response) |
| **Auth** | Bearer Token (JWT dari Supabase) |
| **Content-Type** | `application/json` |

### Header Standar
```
Content-Type: application/json
Authorization: Bearer <access_token>   ← wajib untuk endpoint yang membutuhkan login
```

---

## 2. Alur Aplikasi Mobile

```
[BUKA APP]
     │
     ▼
[Cek token tersimpan?]
  ├── Tidak → [Layar Login / Register]
  └── Ya   → [Cek antrian aktif hari ini]
                  │
                  ▼
        [GET /antrian/status]
          ├── 404 Tidak ada antrian
          │         │
          │         ▼
          │   [Layar Pilih Layanan]
          │   [ Teller ]  [ CS ]
          │         │
          │         ▼
          │   [POST /antrian/ambil]
          │         │
          │         ▼
          │   [Layar Nomor Antrian]
          │
          └── 200 Ada antrian aktif
                    │
                    ▼
              [Layar Status Antrian]
              Polling tiap 15 detik
                    │
              ┌─────┴──────┐
              ▼            ▼
         [dipanggil]   [menunggu]
              │            │
              ▼            │
        [Tampilkan        (lanjut
         notifikasi)      polling)
              │
              ▼
        [Lihat Tiket]
        [GET /antrian/tiket/:id]
              │
              ▼
        [Cetak PDF / WebView]
```

---

## 3. Skema API Lengkap

---

### 3.1 Daftar Akun Baru

```
POST /api/mobile/daftar
```

**Request:**
```json
{
  "nama":     "Budi Santoso",
  "nik":      "3201234567890001",
  "no_hp":    "08123456789",
  "password": "password123"
}
```

**Validasi:**
- `nik` → tepat **16 digit angka**
- `password` → minimal **6 karakter**
- `nama`, `nik`, `no_hp`, `password` → semua **wajib**

**Response sukses `201`:**
```json
{
  "success": true,
  "message": "Pendaftaran berhasil! Silakan masuk dengan NIK dan password Anda.",
  "data": {
    "id":    "uuid-user",
    "nama":  "Budi Santoso",
    "nik":   "3201234567890001",
    "no_hp": "08123456789"
  }
}
```

**Response error `400` (NIK sudah terdaftar):**
```json
{
  "success": false,
  "message": "NIK sudah terdaftar, silakan masuk",
  "data": {}
}
```

---

### 3.2 Login

```
POST /api/mobile/masuk
```

**Request:**
```json
{
  "nik":      "3201234567890001",
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
      "nik":   "3201234567890001",
      "no_hp": "08123456789",
      "role":  "nasabah"
    }
  }
}
```

> Simpan `token` di SharedPreferences / EncryptedSharedPreferences.
> Token berlaku ±1 jam. Jika expired, tampilkan layar login kembali.

**Response error `401`:**
```json
{
  "success": false,
  "message": "NIK atau password salah",
  "data": {}
}
```

---

### 3.3 Profil Nasabah

```
GET /api/mobile/saya
Authorization: Bearer <token>
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Profil berhasil diambil",
  "data": {
    "user": {
      "id":    "uuid-user",
      "nama":  "Budi Santoso",
      "nik":   "3201234567890001",
      "no_hp": "08123456789",
      "role":  "nasabah"
    }
  }
}
```

---

### 3.4 Ambil Nomor Antrian

```
POST /api/mobile/antrian/ambil
Authorization: Bearer <token>
```

**Request:**
```json
{
  "layanan":              "Teller",
  "onesignal_player_id": "player-id-dari-onesignal-sdk"
}
```

| Field | Nilai yang valid |
|-------|-----------------|
| `layanan` | `"Teller"` atau `"CS"` |
| `onesignal_player_id` | Opsional — untuk push notification |

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
      "status":        "menunggu",
      "notif_sent":    false,
      "created_at":    "2026-04-02T09:00:00.000Z"
    },
    "nomor_antrian": 10
  }
}
```

**Response error `400` (sudah punya antrian aktif):**
```json
{
  "success": false,
  "message": "Anda sudah memiliki antrian aktif hari ini",
  "data": {
    "antrian": { ...data antrian yang masih aktif... }
  }
}
```

---

### 3.5 Status Antrian Aktif

```
GET /api/mobile/antrian/status
Authorization: Bearer <token>
```

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
      "created_at":    "2026-04-02T09:00:00.000Z"
    },
    "posisi":           3,
    "antrian_di_depan": 2
  }
}
```

| Field | Keterangan |
|-------|------------|
| `posisi` | Urutan nasabah (1 = giliran berikutnya) |
| `antrian_di_depan` | Jumlah orang yang masih di depan |

**Status antrian yang mungkin:**

| `status` | Arti | Tindakan di App |
|----------|------|-----------------|
| `menunggu` | Masih antri | Tampilkan posisi, lanjut polling |
| `dipanggil` | Nomor dipanggil | Tampilkan notifikasi & buka tiket |
| `selesai` | Layanan selesai | Tampilkan pesan terima kasih |
| `batal` | Dibatalkan | Kembali ke layar pilih layanan |

**Response `404` (tidak ada antrian):**
```json
{
  "success": false,
  "message": "Tidak ada antrian aktif hari ini",
  "data": {}
}
```

---

### 3.6 Batalkan Antrian

```
DELETE /api/mobile/antrian/:id
Authorization: Bearer <token>
```

> Ganti `:id` dengan nilai `antrian.id` yang didapat dari endpoint status.
> Hanya bisa membatalkan antrian berstatus `menunggu`.

**Response `200`:**
```json
{
  "success": true,
  "message": "Antrian nomor 10 berhasil dibatalkan",
  "data": {
    "antrian": { ...data antrian yang dibatalkan... }
  }
}
```

**Response `404` (tidak bisa dibatalkan):**
```json
{
  "success": false,
  "message": "Antrian tidak ditemukan atau tidak dapat dibatalkan",
  "data": {}
}
```

---

### 3.7 Tiket Antrian (HTML Cetak)

```
GET /api/mobile/antrian/tiket/:id
Authorization: Bearer <token>
```

> Response berupa **HTML siap cetak**, bukan JSON.
> Tampilkan menggunakan `WebView` di Android, kemudian bisa di-print sebagai PDF menggunakan `PrintManager`.

**Isi tiket:**
- Nomor antrian besar (font 84px)
- Nama nasabah, NIK
- Layanan (Teller / Customer Service)
- Waktu ambil nomor
- Status antrian (chip berwarna)
- Tombol cetak bawaan

---

## 4. Format Pesan WhatsApp

Backend secara otomatis mengirim pesan WhatsApp via Baileys ketika teller memanggil nomor antrian berikutnya. Pesan dikirim ke nomor HP nasabah yang terdaftar.

**Format pesan yang dikirim:**
```
Halo, Budi Santoso!

Kami informasikan bahwa nomor antrian Anda *10* 
di layanan Teller akan segera dipanggil.

Harap segera menuju loket yang tersedia.

Klik untuk lihat status antrian:
bankantrian://queue?ticket=10

— Bank ABC, Cabang Sudirman
```

> Nomor antrian dicetak **bold** (`*10*` dalam format WhatsApp Markdown).
> Deep link `bankantrian://queue?ticket=10` mengarah ke app Android nasabah.

---

## 5. Deep Link

Skema deep link yang perlu didaftarkan di Android app:

```
bankantrian://queue?ticket=<nomor_antrian>
```

**Contoh:** `bankantrian://queue?ticket=10`

**Cara daftarkan di AndroidManifest.xml:**
```xml
<activity android:name=".QueueStatusActivity" ...>
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
val ticketNumber = intent?.data?.getQueryParameter("ticket")
// ticketNumber = "10"
```

---

## 6. Push Notification OneSignal

Untuk mendapatkan push notification saat nomor dipanggil:

1. Integrasikan **OneSignal Android SDK** di project Android Studio
2. Daftarkan listener untuk mendapat `player_id` (OneSignal subscription ID)
3. Kirim `player_id` ke backend saat ambil nomor antrian:

```kotlin
OneSignal.User.pushSubscription.addObserver(object : IPushSubscriptionObserver {
    override fun onPushSubscriptionDidChange(state: PushSubscriptionChangedState) {
        val playerId = state.current.id ?: return
        // Kirim ke API saat ambil antrian:
        // POST /api/mobile/antrian/ambil
        // body: { layanan: "Teller", onesignal_player_id: playerId }
    }
})
```

**Payload push notification yang diterima (dari backend):**
```json
{
  "headings": { "en": "Antrian Anda Segera Dipanggil" },
  "contents": { "en": "Nomor antrian 10 akan segera dipanggil. Harap menuju loket." }
}
```

---

## 7. Status & Kode Error

| HTTP Code | Arti | Tindakan di App |
|-----------|------|-----------------|
| `200` | Sukses | Proses data |
| `201` | Berhasil dibuat | Proses data |
| `400` | Validasi gagal / data tidak valid | Tampilkan pesan error ke user |
| `401` | Token expired / tidak valid | Redirect ke layar login |
| `403` | Bukan akun nasabah | Tampilkan error, logout |
| `404` | Data tidak ditemukan | Tangani (misal: antrian tidak ada) |
| `500` | Error server | Tampilkan pesan "Terjadi kesalahan, coba lagi" |

**Format error yang konsisten:**
```json
{
  "success": false,
  "message": "Pesan error yang jelas untuk user",
  "data": {}
}
```

---

## 8. Catatan Implementasi Android

### Penyimpanan Token
```kotlin
// Simpan
val prefs = getEncryptedSharedPreferences(context)
prefs.edit().putString("bank_token", token).apply()
prefs.edit().putString("bank_user_id", user.id).apply()
prefs.edit().putString("bank_user_nama", user.nama).apply()

// Ambil
val token = prefs.getString("bank_token", null)

// Hapus (logout)
prefs.edit().clear().apply()
```

### Polling Status Antrian
```kotlin
// Di ViewModel atau Coroutine
private fun startPolling() {
    viewModelScope.launch {
        while (isActive) {
            fetchAntrianStatus()
            delay(15_000) // polling tiap 15 detik
        }
    }
}
```

### Tampilkan Tiket (WebView)
```kotlin
webView.settings.javaScriptEnabled = true
webView.loadUrl(
    "$BASE_URL/api/mobile/antrian/tiket/$antrianId",
    mapOf("Authorization" to "Bearer $token")
)
```

### Cetak PDF dari Tiket
```kotlin
val printManager = getSystemService(PRINT_SERVICE) as PrintManager
val printAdapter = webView.createPrintDocumentAdapter("Tiket Antrian")
printManager.print("Tiket_Antrian_$nomor", printAdapter, PrintAttributes.Builder().build())
```

### Struktur Layar yang Direkomendasikan

```
MainActivity (SplashScreen)
├── LoginActivity
│   └── RegisterActivity
├── HomeActivity (cek antrian aktif)
│   ├── PilihLayananActivity (Teller / CS)
│   │   └── ConfirmAntrianActivity
│   └── StatusAntrianActivity (polling)
│       └── TiketActivity (WebView)
└── ProfilActivity
```

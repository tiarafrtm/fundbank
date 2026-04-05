import { type Request, type Response } from "express";
import { supabase, supabaseAdmin } from "../config/supabase";
import { getNomorAntrian } from "../services/antrianService";

// Lock per user_id — mencegah 2 request masuk bersamaan dari user yang sama
const processingUsers = new Set<string>();

// ============================================================
// POST /api/mobile/daftar — Pendaftaran nasabah baru
// Field: nama, email, no_hp, password
// ============================================================
export async function daftar(req: Request, res: Response): Promise<void> {
  const { nama, email, no_hp, password } = req.body;

  if (!nama || !email || !no_hp || !password) {
    res.status(400).json({
      success: false,
      message: "Nama lengkap, email, nomor HP, dan password wajib diisi",
      data: {},
    });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({
      success: false,
      message: "Format email tidak valid",
      data: {},
    });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({
      success: false,
      message: "Password minimal 6 karakter",
      data: {},
    });
    return;
  }

  // Buat akun Supabase dengan email langsung
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: { nama, no_hp, role: "nasabah" },
    app_metadata: { role: "nasabah" },
  });

  if (authError || !authData.user) {
    const msg = authError?.message?.includes("already registered")
      ? "Email sudah terdaftar, silakan masuk"
      : (authError?.message ?? "Gagal mendaftarkan akun");
    res.status(400).json({ success: false, message: msg, data: {} });
    return;
  }

  // Simpan ke tabel profiles
  await supabaseAdmin.from("profiles").upsert({
    id: authData.user.id,
    nama,
    no_hp,
    role: "nasabah",
  });

  res.status(201).json({
    success: true,
    message: "Pendaftaran berhasil! Silakan masuk dengan email dan password Anda.",
    data: {
      id: authData.user.id,
      nama,
      email: email.toLowerCase().trim(),
      no_hp,
    },
  });
}

// ============================================================
// POST /api/mobile/masuk — Login nasabah dengan email + password
// ============================================================
export async function masuk(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      message: "Email dan password wajib diisi",
      data: {},
    });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (error || !data.session) {
    res.status(401).json({
      success: false,
      message: "Email atau password salah",
      data: {},
    });
    return;
  }

  // Cek role — pastikan ini akun nasabah, bukan staf
  const role =
    data.user?.app_metadata?.role ??
    data.user?.user_metadata?.role ?? "";

  if (!["nasabah", ""].includes(role)) {
    res.status(403).json({
      success: false,
      message: "Akun ini bukan akun nasabah mobile",
      data: {},
    });
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  const meta = data.user.user_metadata ?? {};

  res.json({
    success: true,
    message: "Masuk berhasil",
    data: {
      token: data.session.access_token,
      user: {
        id: data.user.id,
        nama: profile?.nama ?? meta.nama ?? "Nasabah",
        email: data.user.email ?? "",
        no_hp: profile?.no_hp ?? meta.no_hp ?? "",
        role: role || "nasabah",
      },
    },
  });
}

// ============================================================
// GET /api/mobile/saya — Profil nasabah yang sedang login
// ============================================================
export async function getSaya(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const meta = user.user_metadata ?? {};

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  res.json({
    success: true,
    message: "Profil berhasil diambil",
    data: {
      user: {
        id: user.id,
        nama: profile?.nama ?? meta.nama ?? "Nasabah",
        email: user.email ?? "",
        no_hp: profile?.no_hp ?? meta.no_hp ?? "",
        role: "nasabah",
      },
    },
  });
}

// ============================================================
// POST /api/mobile/antrian/ambil — Nasabah ambil nomor antrian
// Field: layanan ("Teller" | "CS"), cabang_id (wajib), onesignal_player_id (opsional)
// ============================================================
export async function ambilAntrianMobile(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { layanan: layananRaw, keperluan: keperluanRaw, onesignal_player_id, cabang_id: cabangIdRaw } = req.body;

  // === GUARD: cegah double-tap / request bersamaan dari user yang sama ===
  if (processingUsers.has(user.id)) {
    res.status(429).json({
      success: false,
      message: "Permintaan sedang diproses, harap tunggu sebentar",
      data: {},
    });
    return;
  }
  processingUsers.add(user.id);

  try {
    // Normalisasi case: "teller"/"TELLER"/"Teller" → "Teller", "cs"/"CS" → "CS"
    const LAYANAN_MAP: Record<string, string> = {
      teller: "Teller", cs: "CS",
    };
    const layanan = LAYANAN_MAP[(layananRaw ?? "").toString().toLowerCase()] ?? null;

    if (!layanan) {
      res.status(400).json({
        success: false,
        message: "Jenis layanan wajib dipilih: Teller atau CS",
        data: {},
      });
      return;
    }

    // Keperluan: sub-layanan spesifik (opsional tapi sangat disarankan)
    const KEPERLUAN_OPTIONS: Record<string, string[]> = {
      Teller: ["Setor Tunai", "Tarik Tunai", "Transfer", "Pembayaran"],
      CS: ["Buka Rekening", "Pengajuan Kartu ATM", "Info Produk Bank", "Konsultasi Keuangan"],
    };
    const keperluan = (keperluanRaw ?? "").toString().trim() || null;
    if (keperluan && !KEPERLUAN_OPTIONS[layanan]?.includes(keperluan)) {
      res.status(400).json({
        success: false,
        message: `Keperluan tidak valid untuk layanan ${layanan}. Pilihan: ${KEPERLUAN_OPTIONS[layanan]?.join(", ")}`,
        data: {},
      });
      return;
    }

    // Validasi cabang_id — wajib ada dan aktif
    const cabangId = cabangIdRaw != null ? Number(cabangIdRaw) : null;
    if (!cabangId || isNaN(cabangId)) {
      res.status(400).json({
        success: false,
        message: "Cabang wajib dipilih. Gunakan endpoint GET /api/mobile/cabang untuk daftar cabang.",
        data: {},
      });
      return;
    }

    const { data: cabangData, error: cabangErr } = await supabaseAdmin
      .from("cabang")
      .select("id, nama")
      .eq("id", cabangId)
      .eq("is_active", true)
      .maybeSingle();

    if (cabangErr || !cabangData) {
      res.status(400).json({
        success: false,
        message: "Cabang tidak ditemukan atau tidak aktif",
        data: {},
      });
      return;
    }

    const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    // Cek antrian aktif hari ini (menunggu ATAU dipanggil)
    const { data: existingAntrian } = await supabaseAdmin
      .from("antrian")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["menunggu", "dipanggil"])
      .gte("created_at", today)
      .maybeSingle();

    if (existingAntrian) {
      res.status(400).json({
        success: false,
        message: "Anda sudah memiliki antrian aktif hari ini. Selesaikan antrian tersebut terlebih dahulu.",
        data: { antrian: existingAntrian },
      });
      return;
    }

    // Simpan OneSignal player ID jika diberikan
    if (onesignal_player_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ onesignal_player_id })
        .eq("id", user.id);
    }

    // Dapatkan nomor antrian berikutnya (atomic via lock per layanan+cabang)
    const nomorAntrian = await getNomorAntrian(layanan, cabangId);

    const { data: antrian, error } = await supabaseAdmin
      .from("antrian")
      .insert({
        user_id: user.id,
        nomor_antrian: nomorAntrian,
        layanan,
        cabang_id: cabangId,
        ...(keperluan ? { keperluan } : {}),
        status: "menunggu",
        notif_sent: false,
      })
      .select()
      .single();

    if (error || !antrian) {
      res.status(500).json({
        success: false,
        message: "Gagal membuat antrian: " + (error?.message ?? ""),
        data: {},
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: `Antrian ${layanan} nomor ${nomorAntrian} berhasil dibuat di ${cabangData.nama}`,
      data: { antrian, nomor_antrian: nomorAntrian, cabang: cabangData },
    });
  } finally {
    // Selalu lepas lock, baik sukses maupun error
    processingUsers.delete(user.id);
  }
}

// ============================================================
// GET /api/mobile/antrian/status — Status antrian aktif nasabah
// ============================================================
export async function statusAntrianMobile(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  // Ambil antrian aktif (menunggu / dipanggil) terlebih dahulu
  const { data: antrian } = await supabaseAdmin
    .from("antrian")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["menunggu", "dipanggil"])
    .gte("created_at", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Tidak ada antrian aktif — cek apakah batal atau baru selesai dilayani
  if (!antrian) {
    // Ambil antrian terakhir hari ini (batal atau selesai) secara paralel
    const [{ data: antrianBatal }, { data: antrianSelesai }] = await Promise.all([
      supabaseAdmin
        .from("antrian")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "batal")
        .gte("created_at", today)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabaseAdmin
        .from("antrian")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "selesai")
        .gte("created_at", today)
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Cek antrian dilewati — tampilkan modal skip di Android
    if (antrianBatal) {
      const dibatalkanSejak = (Date.now() - new Date(antrianBatal.updated_at).getTime()) / 1000;
      if (dibatalkanSejak < 600) {
        res.status(200).json({
          success: true,
          message: "Antrian Anda telah dilewati",
          data: {
            antrian  : antrianBatal,
            terlewati: true,
            selesai  : false,
            posisi             : null,
            antrian_di_depan   : null,
            estimasi_menit     : null,
            estimasi_label     : null,
            jumlah_loket_aktif : null,
            menit_per_nasabah  : null,
          },
        });
        return;
      }
    }

    // Cek antrian selesai — nasabah sudah dilayani
    if (antrianSelesai) {
      const selesaiSejak = (Date.now() - new Date(antrianSelesai.finished_at ?? antrianSelesai.updated_at).getTime()) / 1000;
      if (selesaiSejak < 1800) {  // tampilkan status selesai dalam 30 menit terakhir
        res.status(200).json({
          success: true,
          message: "Antrian Anda telah selesai dilayani",
          data: {
            antrian  : antrianSelesai,
            terlewati: false,
            selesai  : true,   // ← Android baca flag ini → tampilkan layar "Terima kasih"
            posisi             : null,
            antrian_di_depan   : null,
            estimasi_menit     : null,
            estimasi_label     : null,
            jumlah_loket_aktif : null,
            menit_per_nasabah  : null,
          },
        });
        return;
      }
    }

    res.status(404).json({
      success: false,
      message: "Tidak ada antrian aktif hari ini",
      data: {},
    });
    return;
  }

  // Ambil cabang_id dari antrian aktif (untuk filter estimasi per cabang)
  const antrianCabangId: number | null = antrian.cabang_id ?? null;

  // Jalankan 4 query paralel sekaligus untuk hemat waktu
  const [posisiResult, loketDipanggilResult, selesaiResult, loketProfileResult] = await Promise.all([
    // 1. Hitung berapa orang di depan (status menunggu, nomor lebih kecil, cabang sama)
    (() => {
      let q = supabaseAdmin
        .from("antrian")
        .select("*", { count: "exact", head: true })
        .eq("status", "menunggu")
        .eq("layanan", antrian.layanan)
        .lt("nomor_antrian", antrian.nomor_antrian);
      if (antrianCabangId != null) q = q.eq("cabang_id", antrianCabangId);
      return q;
    })(),

    // 2. Hitung loket yang SEDANG melayani saat ini (status dipanggil, cabang sama)
    (() => {
      let q = supabaseAdmin
        .from("antrian")
        .select("*", { count: "exact", head: true })
        .eq("status", "dipanggil")
        .eq("layanan", antrian.layanan)
        .gte("created_at", today);
      if (antrianCabangId != null) q = q.eq("cabang_id", antrianCabangId);
      return q;
    })(),

    // 3. Rata-rata durasi layanan dari histori hari ini (cabang sama)
    (() => {
      let q = supabaseAdmin
        .from("antrian")
        .select("called_at, finished_at")
        .eq("status", "selesai")
        .eq("layanan", antrian.layanan)
        .gte("created_at", today)
        .not("called_at", "is", null)
        .not("finished_at", "is", null)
        .limit(20);
      if (antrianCabangId != null) q = q.eq("cabang_id", antrianCabangId);
      return q;
    })(),

    // 4. Hitung staff yang sudah set loket untuk layanan ini di cabang yang sama
    (() => {
      let q = supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("layanan", antrian.layanan)
        .not("loket_number", "is", null);
      if (antrianCabangId != null) q = q.eq("cabang_id", antrianCabangId);
      return q;
    })(),
  ]);

  const antriDiDepan     = posisiResult.count ?? 0;
  const loketSedangLayan = loketDipanggilResult.count ?? 0;
  const loketTerdaftar   = loketProfileResult.count ?? 0;
  // Ambil nilai terbesar: saat jeda antar nasabah loketDipanggil=0,
  // tapi loketTerdaftar tetap terhitung → estimasi tidak melonjak
  const jumlahLoketAktif = Math.max(1, loketSedangLayan, loketTerdaftar);

  // Hitung rata-rata menit per nasabah per loket
  const MENIT_DEFAULT = 10;
  let meniPerNasabah  = MENIT_DEFAULT;
  const selesaiHariIni = selesaiResult.data ?? [];

  if (selesaiHariIni.length > 0) {
    const totalMenit = selesaiHariIni.reduce((sum: number, row: any) => {
      const durasi = (new Date(row.finished_at).getTime() - new Date(row.called_at).getTime()) / 60000;
      return sum + (durasi > 0 && durasi < 60 ? durasi : MENIT_DEFAULT);
    }, 0);
    meniPerNasabah = Math.round(totalMenit / selesaiHariIni.length);
    if (meniPerNasabah < 1) meniPerNasabah = MENIT_DEFAULT;
  }

  // Formula: ceil(antrian_di_depan / jumlah_loket) × menit_per_nasabah
  // Contoh: 6 orang, 3 loket aktif, 10 menit → ceil(6/3) × 10 = 20 menit
  const estimasiMenit = antriDiDepan === 0
    ? 0
    : Math.ceil(antriDiDepan / jumlahLoketAktif) * meniPerNasabah;

  // Label estimasi yang ditampilkan di app
  const estimasiLabel = antriDiDepan === 0
    ? "Segera dipanggil!"
    : estimasiMenit < 1
      ? "< 1 menit"
      : `± ${estimasiMenit} menit`;

  res.json({
    success: true,
    message: "Status antrian",
    data: {
      antrian,
      terlewati          : false,
      selesai            : false,
      posisi             : antriDiDepan + 1,
      antrian_di_depan   : antriDiDepan,
      jumlah_loket_aktif : jumlahLoketAktif,
      loket_sedang_layan : loketSedangLayan,   // loket yg aktif melayani saat ini
      loket_terdaftar    : loketTerdaftar,      // staff yg sudah set loket hari ini
      estimasi_menit     : estimasiMenit,
      estimasi_label     : estimasiLabel,
      menit_per_nasabah  : meniPerNasabah,
      // Loket yang memanggil antrian ini (null jika belum dipanggil)
      loket_number       : antrian.loket_number ?? null,
    },
  });
}

// ============================================================
// DELETE /api/mobile/antrian/:id — Nasabah batalkan antrian
// ============================================================
export async function batalAntrianMobile(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { id } = req.params;

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .update({ status: "batal" })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "menunggu")
    .select()
    .single();

  if (error || !antrian) {
    res.status(404).json({
      success: false,
      message: "Antrian tidak ditemukan atau tidak dapat dibatalkan",
      data: {},
    });
    return;
  }

  res.json({
    success: true,
    message: `Antrian nomor ${antrian.nomor_antrian} berhasil dibatalkan`,
    data: { antrian },
  });
}

// ============================================================
// GET /api/mobile/antrian/riwayat — Riwayat antrian nasabah
// Query params:
//   page   : halaman (default 1)
//   limit  : jumlah per halaman (default 10, maks 50)
//   status : filter status (selesai | batal | semua) — default: semua
//   hari   : filter N hari ke belakang (default 30)
// ============================================================
export async function riwayatAntrianMobile(req: Request, res: Response): Promise<void> {
  const user   = (req as any).user;
  const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const status = (req.query.status as string) || "semua";
  const hari   = Math.min(365, Math.max(1, parseInt(req.query.hari as string) || 30));

  const offset = (page - 1) * limit;

  // Hitung batas tanggal awal
  const batasAwal = new Date();
  batasAwal.setDate(batasAwal.getDate() - hari);
  batasAwal.setHours(0, 0, 0, 0);

  // Build query dasar
  let query = supabaseAdmin
    .from("antrian")
    .select("id, nomor_antrian, layanan, keperluan, status, created_at, called_at, finished_at", { count: "exact" })
    .eq("user_id", user.id)
    .gte("created_at", batasAwal.toISOString())
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Filter status
  if (status === "selesai") {
    query = query.eq("status", "selesai");
  } else if (status === "batal") {
    query = query.eq("status", "batal");
  } else {
    // "semua" — tampilkan semua status kecuali yang masih aktif hari ini
    // aktif (menunggu/dipanggil) tetap ditampilkan supaya riwayat lengkap
    query = query.in("status", ["selesai", "batal", "menunggu", "dipanggil"]);
  }

  const { data: riwayat, error, count } = await query;

  if (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat", data: {} });
    return;
  }

  // Hitung durasi layanan untuk setiap antrian
  const riwayatDenganDurasi = (riwayat ?? []).map((item: any) => {
    let durasi_menit: number | null = null;
    let durasi_label: string        = "—";

    if (item.called_at && item.finished_at) {
      const menit = Math.round(
        (new Date(item.finished_at).getTime() - new Date(item.called_at).getTime()) / 60000
      );
      if (menit >= 0 && menit < 300) {
        durasi_menit  = menit;
        durasi_label  = menit < 1 ? "< 1 menit" : `${menit} menit`;
      }
    }

    // Format tanggal yang ramah untuk ditampilkan di app
    const tanggal = new Date(item.created_at).toLocaleDateString("id-ID", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
    const jam = new Date(item.created_at).toLocaleTimeString("id-ID", {
      hour: "2-digit", minute: "2-digit",
    });

    // Label status dalam Bahasa Indonesia
    const statusLabel: Record<string, string> = {
      menunggu  : "Menunggu",
      dipanggil : "Dipanggil",
      selesai   : "Selesai",
      batal     : "Dilewati / Batal",
    };

    return {
      id              : item.id,
      nomor_antrian   : item.nomor_antrian,
      layanan         : item.layanan,
      keperluan       : item.keperluan ?? null,
      status          : item.status,
      status_label    : statusLabel[item.status] ?? item.status,
      tanggal         : tanggal,
      jam             : jam,
      created_at      : item.created_at,
      called_at       : item.called_at,
      finished_at     : item.finished_at,
      durasi_menit    : durasi_menit,
      durasi_label    : durasi_label,
    };
  });

  const totalHalaman = Math.ceil((count ?? 0) / limit);

  res.json({
    success : true,
    message : "Riwayat antrian",
    data    : {
      riwayat      : riwayatDenganDurasi,
      pagination   : {
        halaman_saat_ini : page,
        total_halaman    : totalHalaman,
        total_data       : count ?? 0,
        per_halaman      : limit,
        ada_halaman_lagi : page < totalHalaman,
      },
      filter       : {
        status : status,
        hari   : hari,
      },
    },
  });
}

// ============================================================
// GET /api/mobile/antrian/tiket/:id — Tiket antrian (HTML, dapat dicetak)
// ============================================================
export async function tiketAntrian(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { id } = req.params;
  const meta = user.user_metadata ?? {};

  const { data: antrian } = await supabaseAdmin
    .from("antrian")
    .select(`*, profiles (nama, no_hp)`)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!antrian) {
    res.status(404).json({ success: false, message: "Tiket tidak ditemukan", data: {} });
    return;
  }

  // Ambil info cabang jika ada
  let cabangNama = "";
  let cabangAlamat = "";
  if (antrian.cabang_id) {
    const { data: cabang } = await supabaseAdmin
      .from("cabang")
      .select("nama, alamat, kode")
      .eq("id", antrian.cabang_id)
      .single();
    if (cabang) {
      cabangNama   = cabang.nama   ?? "";
      cabangAlamat = cabang.alamat ?? "";
    }
  }

  const profile = antrian.profiles as any;
  const nama = profile?.nama ?? meta.nama ?? "Nasabah";
  const waktu = new Date(antrian.created_at).toLocaleString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const html = generateTiketHTML({
    nomor: antrian.nomor_antrian,
    layanan: antrian.layanan,
    keperluan: antrian.keperluan ?? null,
    nama,
    waktu,
    status: antrian.status,
    antrianId: antrian.id,
    cabangNama,
    cabangAlamat,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

// ============================================================
// HTML tiket yang dapat dicetak / disimpan sebagai PDF
// ============================================================
function generateTiketHTML({ nomor, layanan, keperluan, nama, waktu, status, antrianId, cabangNama, cabangAlamat }: {
  nomor: number; layanan: string; keperluan: string | null; nama: string;
  waktu: string; status: string; antrianId: string;
  cabangNama: string; cabangAlamat: string;
}) {
  const nomorStr     = String(nomor).padStart(3, "0");
  const layananLabel = layanan === "CS" ? "Customer Service" : "Teller";
  const statusMap    = { menunggu: ["Menunggu", "chip-orange"], dipanggil: ["Dipanggil", "chip-blue"], selesai: ["Selesai", "chip-green"], batal: ["Dibatalkan", "chip-red"] } as Record<string, string[]>;
  const [statusLabel, statusKelas] = statusMap[status] ?? [status, "chip-orange"];

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Tiket Antrian ${nomorStr} — FUND BANK</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Poppins',sans-serif;background:#fff7f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:24px;padding:36px 28px 32px;max-width:360px;width:100%;box-shadow:0 8px 40px rgba(249,115,22,.10);text-align:center;position:relative;overflow:hidden}
    .card::before{content:'';position:absolute;top:-48px;right:-48px;width:160px;height:160px;border-radius:50%;background:#fff7f0;pointer-events:none}

    /* Logo */
    .logo-wrap{display:flex;flex-direction:column;align-items:center;margin-bottom:24px}
    .logo-img{width:64px;height:64px;object-fit:contain;margin-bottom:10px}
    .bank-name{font-size:17px;font-weight:700;color:#292524;letter-spacing:.02em}
    .bank-sub{font-size:10.5px;color:#a8a29e;margin-top:2px;letter-spacing:.04em;text-transform:uppercase}

    /* Nomor */
    .nomor-label{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#a8a29e;margin-bottom:6px}
    .nomor{font-size:80px;font-weight:800;color:#F97316;line-height:1;letter-spacing:-3px}
    .chips-row{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;flex-wrap:wrap}
    .chip{display:inline-flex;align-items:center;padding:4px 13px;border-radius:20px;font-size:11px;font-weight:700}
    .chip-orange{background:#FFF7ED;color:#EA580C}
    .chip-blue{background:#EFF6FF;color:#2563EB}
    .chip-green{background:#F0FDF4;color:#16A34A}
    .chip-red{background:#FEF2F2;color:#DC2626}

    /* Divider */
    hr{border:none;border-top:1.5px dashed #f0e8e1;margin:22px 0}

    /* Info rows */
    .info{display:flex;flex-direction:column;gap:0;text-align:left}
    .info-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #fdf5f0}
    .info-row.single{grid-template-columns:1fr}
    .info-row:last-child{border-bottom:none}
    .lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#a8a29e;margin-bottom:3px}
    .val{font-size:12.5px;font-weight:600;color:#292524;line-height:1.45}
    .val-small{font-size:11px;font-weight:400;color:#78716c;margin-top:2px}

    /* Footer */
    .note{font-size:11.5px;color:#78716c;line-height:1.7;margin-top:4px}
    .ticket-id{font-size:9px;color:#d6d3d1;margin-top:10px;letter-spacing:.05em}

    @media print{
      body{background:#fff;padding:0}
      .card{box-shadow:none;border-radius:0;max-width:none}
    }
  </style>
</head>
<body>
<div class="card">

  <!-- Logo -->
  <div class="logo-wrap">
    <img src="/images/logo.png" alt="FUND BANK" class="logo-img"/>
    <div class="bank-name">FUND BANK</div>
    <div class="bank-sub">Tiket Antrian</div>
  </div>

  <!-- Nomor -->
  <div class="nomor-label">Nomor Antrian Anda</div>
  <div class="nomor">${nomorStr}</div>
  <div class="chips-row">
    <span class="chip chip-orange">${layananLabel}</span>
    ${keperluan ? `<span class="chip chip-blue">${escHtml(keperluan)}</span>` : ""}
    <span class="chip ${statusKelas}">${statusLabel}</span>
  </div>

  <hr/>

  <!-- Info -->
  <div class="info">
    <div class="info-row">
      <div>
        <div class="lbl">Nama</div>
        <div class="val">${escHtml(nama)}</div>
      </div>
      <div>
        <div class="lbl">Layanan</div>
        <div class="val">${layananLabel}</div>
      </div>
    </div>
    ${keperluan ? `
    <div class="info-row single">
      <div>
        <div class="lbl">Keperluan</div>
        <div class="val">${escHtml(keperluan)}</div>
      </div>
    </div>` : ""}
    ${cabangNama ? `
    <div class="info-row single">
      <div>
        <div class="lbl">Cabang</div>
        <div class="val">${escHtml(cabangNama)}</div>
        ${cabangAlamat ? `<div class="val-small">${escHtml(cabangAlamat)}</div>` : ""}
      </div>
    </div>` : ""}
    <div class="info-row single">
      <div>
        <div class="lbl">Waktu Ambil</div>
        <div class="val">${waktu}</div>
      </div>
    </div>
  </div>

  <hr/>

  <p class="note">Harap menunggu di ruang tunggu bank.<br/>Notifikasi akan dikirim saat giliran Anda mendekati.</p>
  <p class="ticket-id">${antrianId}</p>

</div>
</body>
</html>`;
}

function escHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ============================================================
// GET /api/mobile/jadwal?cabang_id=X
// Publik — tidak perlu login
// Mengembalikan jadwal operasional cabang + status buka hari ini
// ============================================================
export async function jadwalCabangMobile(req: Request, res: Response): Promise<void> {
  const cabang_id = Number(req.query.cabang_id);
  if (!cabang_id) {
    res.status(400).json({ success: false, message: "cabang_id wajib diisi", data: {} });
    return;
  }

  try {
    const { data: jadwal, error } = await supabaseAdmin
      .from("jadwal_operasional")
      .select("hari, jam_buka, jam_tutup, is_buka")
      .eq("cabang_id", cabang_id)
      .order("hari");

    if (error) throw error;

    // Hitung hari ini (1=Senin … 7=Minggu, sama dengan isian admin)
    const now   = new Date();
    // getDay(): 0=Minggu,1=Senin,...,6=Sabtu → konversi ke 1=Senin,...,7=Minggu
    const jsDay = now.getDay();
    const hariIniNum = jsDay === 0 ? 7 : jsDay;

    const jadwalHariIni = (jadwal ?? []).find(j => j.hari === hariIniNum) ?? null;

    // Cek apakah sekarang dalam rentang jam buka–tutup
    let sedang_buka = false;
    if (jadwalHariIni?.is_buka && jadwalHariIni.jam_buka && jadwalHariIni.jam_tutup) {
      const [bH, bM] = jadwalHariIni.jam_buka.split(":").map(Number);
      const [tH, tM] = jadwalHariIni.jam_tutup.split(":").map(Number);
      const nowMin   = now.getHours() * 60 + now.getMinutes();
      const bukaMin  = bH * 60 + bM;
      const tutupMin = tH * 60 + tM;
      sedang_buka    = nowMin >= bukaMin && nowMin < tutupMin;
    }

    const NAMA_HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

    res.json({
      success: true,
      message: "Jadwal operasional berhasil diambil",
      data: {
        cabang_id,
        sedang_buka,
        hari_ini: jadwalHariIni
          ? {
              hari:      jadwalHariIni.hari,
              nama_hari: NAMA_HARI[jadwalHariIni.hari] ?? "",
              is_buka:   jadwalHariIni.is_buka,
              jam_buka:  jadwalHariIni.jam_buka,
              jam_tutup: jadwalHariIni.jam_tutup,
            }
          : null,
        jadwal: (jadwal ?? []).map(j => ({
          hari:      j.hari,
          nama_hari: NAMA_HARI[j.hari] ?? "",
          is_buka:   j.is_buka,
          jam_buka:  j.jam_buka,
          jam_tutup: j.jam_tutup,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil jadwal: " + (err?.message ?? ""),
      data: {},
    });
  }
}

// ============================================================
// GET /api/mobile/cabang — Daftar cabang aktif (tanpa auth — publik)
// ============================================================
export async function listCabangMobile(_req: Request, res: Response): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from("cabang")
      .select("id, nama, kode, alamat")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      message: "Daftar cabang berhasil diambil",
      data: { cabang: data ?? [] },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar cabang: " + (err?.message ?? ""),
      data: {},
    });
  }
}

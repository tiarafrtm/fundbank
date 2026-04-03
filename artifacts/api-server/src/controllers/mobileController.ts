import { type Request, type Response } from "express";
import { supabase, supabaseAdmin } from "../config/supabase";
import { getNomorAntrian } from "../services/antrianService";

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
// Field: layanan ("Teller" | "CS"), onesignal_player_id (opsional)
// ============================================================
export async function ambilAntrianMobile(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { layanan: layananRaw, keperluan: keperluanRaw, onesignal_player_id } = req.body;

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

  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  // Cek antrian aktif hari ini
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
      message: "Anda sudah memiliki antrian aktif hari ini",
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

  // Dapatkan nomor antrian berikutnya
  const nomorAntrian = await getNomorAntrian(layanan);

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .insert({
      user_id: user.id,
      nomor_antrian: nomorAntrian,
      layanan,
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
    message: `Antrian ${layanan} nomor ${nomorAntrian} berhasil dibuat`,
    data: { antrian, nomor_antrian: nomorAntrian },
  });
}

// ============================================================
// GET /api/mobile/antrian/status — Status antrian aktif nasabah
// ============================================================
export async function statusAntrianMobile(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const { data: antrian } = await supabaseAdmin
    .from("antrian")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["menunggu", "dipanggil"])
    .gte("created_at", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!antrian) {
    res.status(404).json({
      success: false,
      message: "Tidak ada antrian aktif hari ini",
      data: {},
    });
    return;
  }

  // Hitung posisi (berapa orang di depan)
  const { count: posisiDepan } = await supabaseAdmin
    .from("antrian")
    .select("*", { count: "exact", head: true })
    .eq("status", "menunggu")
    .eq("layanan", antrian.layanan)
    .lt("nomor_antrian", antrian.nomor_antrian);

  res.json({
    success: true,
    message: "Status antrian",
    data: {
      antrian,
      posisi: (posisiDepan ?? 0) + 1,
      antrian_di_depan: posisiDepan ?? 0,
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
// GET /api/mobile/antrian/tiket/:id — Tiket antrian (HTML, dapat dicetak)
// ============================================================
export async function tiketAntrian(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { id } = req.params;
  const meta = user.user_metadata ?? {};
  const userEmail: string = user.email ?? "";
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
    email: userEmail,
    waktu,
    status: antrian.status,
    antrianId: antrian.id,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

// ============================================================
// HTML tiket yang dapat dicetak / disimpan sebagai PDF
// ============================================================
function generateTiketHTML({ nomor, layanan, keperluan, nama, email, waktu, status, antrianId }: {
  nomor: number; layanan: string; keperluan: string | null; nama: string; email: string;
  waktu: string; status: string; antrianId: string;
}) {
  const layananLabel = layanan === "CS" ? "Customer Service" : layanan;
  const statusKelas = { menunggu: "chip-orange", dipanggil: "chip-blue", selesai: "chip-green", batal: "chip-red" }[status] ?? "chip-orange";
  const statusLabel = { menunggu: "Menunggu", dipanggil: "Dipanggil", selesai: "Selesai", batal: "Dibatalkan" }[status] ?? status;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Tiket Antrian ${nomor} — ${layananLabel}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Poppins',sans-serif;background:#f5f5f4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .wrap{background:#fff;border-radius:20px;padding:36px 28px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.1);position:relative;overflow:hidden}
    .wrap::before{content:'';position:absolute;top:-40px;right:-40px;width:140px;height:140px;border-radius:50%;background:#FFF7ED;pointer-events:none}
    .logo-box{width:52px;height:52px;background:#F97316;border-radius:13px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
    .bank{font-size:17px;font-weight:700;color:#292524;text-align:center}
    .sub{font-size:11px;color:#a8a29e;text-align:center;margin-bottom:28px}
    hr{border:none;border-top:1px dashed #e7e5e4;margin:20px 0}
    .label-sm{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#a8a29e;margin-bottom:6px;text-align:center}
    .number{font-size:84px;font-weight:800;color:#F97316;line-height:1;letter-spacing:-5px;text-align:center}
    .chip{display:inline-block;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700}
    .chip-orange{background:#FFF7ED;color:#EA580C}
    .chip-blue{background:#EFF6FF;color:#2563EB}
    .chip-green{background:#F0FDF4;color:#16A34A}
    .chip-red{background:#FEF2F2;color:#DC2626}
    .center{text-align:center;margin-bottom:6px}
    .info{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}
    .info-item .lbl{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#a8a29e;margin-bottom:3px}
    .info-item .val{font-size:13px;font-weight:600;color:#292524;word-break:break-all}
    .note{font-size:11.5px;color:#78716c;text-align:center;line-height:1.7;margin-top:4px}
    .btn-print{display:block;width:100%;margin-top:20px;padding:13px;background:#F97316;color:#fff;border:none;border-radius:10px;font-family:'Poppins',sans-serif;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.01em}
    .btn-print:hover{background:#EA580C}
    @media print{
      body{background:#fff;padding:0}
      .wrap{box-shadow:none;border-radius:0;max-width:none}
      .btn-print{display:none}
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="logo-box">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-4 0v2"/>
      <path d="M12 12v4"/><path d="M9 12h6"/>
    </svg>
  </div>
  <p class="bank">Bank ABC</p>
  <p class="sub">Cabang Sudirman &nbsp;·&nbsp; Tiket Antrian</p>

  <p class="label-sm">Nomor Antrian Anda</p>
  <p class="number">${nomor}</p>
  <div class="center" style="margin-top:8px">
    <span class="chip chip-orange">${layananLabel}</span>
    ${keperluan ? `<span class="chip chip-blue" style="margin-left:6px">${escHtml(keperluan)}</span>` : ""}
  </div>

  <hr/>

  <div class="info">
    <div class="info-item">
      <div class="lbl">Nama</div>
      <div class="val">${escHtml(nama)}</div>
    </div>
    <div class="info-item">
      <div class="lbl">Keperluan</div>
      <div class="val">${escHtml(keperluan ?? "-")}</div>
    </div>
    <div class="info-item">
      <div class="lbl">Waktu Ambil</div>
      <div class="val">${waktu}</div>
    </div>
    <div class="info-item">
      <div class="lbl">Status</div>
      <div><span class="chip ${statusKelas}">${statusLabel}</span></div>
    </div>
  </div>

  <hr/>
  <p class="note">Harap menunggu di ruang tunggu bank.<br/>Notifikasi WhatsApp akan dikirim saat giliran Anda mendekati.</p>
  <button class="btn-print" onclick="window.print()">🖨&nbsp; Cetak Tiket</button>
</div>
</body>
</html>`;
}

function escHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

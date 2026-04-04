import { type Request, type Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { logger } from "../lib/logger";

function actLog(req: Request, action: string, detail: Record<string, any> = {}) {
  const nama = (req as any).userNama ?? "admin";
  const user = (req as any).user;
  logger.info({ actor: nama, role: "admin", userId: user?.id, action, ...detail }, `[ADMIN] ${action}`);
}

// ===========================================================
// GET /api/admin/statistik — statistik semua cabang hari ini
// ===========================================================
export async function getAdminStatistik(_req: Request, res: Response): Promise<void> {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  try {
    const [antrianRes, cabangRes, staffRes] = await Promise.all([
      supabaseAdmin
        .from("antrian")
        .select("status, layanan, cabang_id, called_at, finished_at")
        .gte("created_at", todayStart),

      supabaseAdmin
        .from("cabang")
        .select("id, nama, kode")
        .eq("is_active", true)
        .order("id"),

      supabaseAdmin
        .from("profiles")
        .select("id, cabang_id")
        .in("role", ["teller", "cs"]),
    ]);

    if (antrianRes.error) throw antrianRes.error;
    if (cabangRes.error)  throw cabangRes.error;

    const antrian = antrianRes.data ?? [];
    const cabangs = cabangRes.data ?? [];
    const staffs  = staffRes.data  ?? [];

    // Total keseluruhan
    const total     = antrian.length;
    const menunggu  = antrian.filter(a => a.status === "menunggu").length;
    const dipanggil = antrian.filter(a => a.status === "dipanggil").length;
    const selesai   = antrian.filter(a => a.status === "selesai").length;
    const batal     = antrian.filter(a => a.status === "batal").length;

    // Per cabang
    const perCabang = cabangs.map(cb => {
      const antrianCb = antrian.filter(a => a.cabang_id === cb.id);
      const staffCb   = staffs.filter(s => s.cabang_id === cb.id);
      const selesaiCb = antrianCb.filter(a => a.status === "selesai");

      // Rata-rata waktu layanan per nasabah (menit)
      const durasi = selesaiCb
        .filter(a => a.called_at && a.finished_at)
        .map(a => (new Date(a.finished_at).getTime() - new Date(a.called_at).getTime()) / 60000)
        .filter(d => d > 0 && d < 120);

      const avgMenit = durasi.length
        ? Math.round(durasi.reduce((s, d) => s + d, 0) / durasi.length)
        : null;

      return {
        cabang_id  : cb.id,
        cabang_nama: cb.nama,
        cabang_kode: cb.kode,
        total      : antrianCb.length,
        menunggu   : antrianCb.filter(a => a.status === "menunggu").length,
        dipanggil  : antrianCb.filter(a => a.status === "dipanggil").length,
        selesai    : selesaiCb.length,
        batal      : antrianCb.filter(a => a.status === "batal").length,
        total_staff: staffCb.length,
        avg_layanan_menit: avgMenit,
      };
    });

    res.json({
      success: true,
      message: "Statistik admin berhasil diambil",
      data: { total, menunggu, dipanggil, selesai, batal, per_cabang: perCabang },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal mengambil statistik: " + (err?.message ?? ""), data: {} });
  }
}

// ===========================================================
// CRUD CABANG
// ===========================================================

export async function listAdminCabang(_req: Request, res: Response): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("cabang")
    .select("id, nama, kode, alamat, is_active, created_at")
    .order("id");

  if (error) { res.status(500).json({ success: false, message: error.message, data: {} }); return; }
  res.json({ success: true, message: "Daftar cabang", data: { cabang: data ?? [] } });
}

export async function createAdminCabang(req: Request, res: Response): Promise<void> {
  const { nama, kode, alamat } = req.body;
  if (!nama || !kode) {
    res.status(400).json({ success: false, message: "Nama dan kode cabang wajib diisi", data: {} });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("cabang")
    .insert({ nama, kode: kode.toUpperCase(), alamat: alamat ?? null, is_active: true })
    .select()
    .single();

  if (error) {
    const msg = error.message.includes("unique") ? `Kode cabang "${kode}" sudah digunakan` : error.message;
    res.status(400).json({ success: false, message: msg, data: {} });
    return;
  }

  actLog(req, "create_cabang", { nama, kode });
  res.status(201).json({ success: true, message: `Cabang ${nama} berhasil dibuat`, data: { cabang: data } });
}

export async function updateAdminCabang(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { nama, kode, alamat, is_active } = req.body;

  const updateData: Record<string, any> = {};
  if (nama      !== undefined) updateData.nama      = nama;
  if (kode      !== undefined) updateData.kode      = kode.toUpperCase();
  if (alamat    !== undefined) updateData.alamat    = alamat;
  if (is_active !== undefined) updateData.is_active = is_active;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ success: false, message: "Tidak ada data yang diubah", data: {} });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("cabang")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(400).json({ success: false, message: error?.message ?? "Cabang tidak ditemukan", data: {} });
    return;
  }

  actLog(req, "update_cabang", { id, ...updateData });
  res.json({ success: true, message: `Cabang berhasil diperbarui`, data: { cabang: data } });
}

// ===========================================================
// CRUD STAFF
// ===========================================================

export async function listAdminStaff(_req: Request, res: Response): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, nama, no_hp, role, cabang_id, loket_number, created_at, cabang:cabang_id(nama, kode)")
    .in("role", ["teller", "cs"])
    .order("cabang_id", { ascending: true, nullsFirst: false })
    .order("nama");

  if (error) { res.status(500).json({ success: false, message: error.message, data: {} }); return; }

  // Ambil email dari Supabase Auth untuk masing-masing staff
  // (batch: max 50 per listUsers call — cukup untuk kebanyakan kasus)
  let staffWithEmail = (data ?? []).map(s => ({ ...s, email: null as string | null }));
  try {
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const emailMap: Record<string, string> = {};
    for (const u of (authList?.users ?? [])) emailMap[u.id] = u.email ?? "";
    staffWithEmail = staffWithEmail.map(s => ({ ...s, email: emailMap[s.id] ?? null }));
  } catch { /* email tidak kritis — lanjut tanpa */ }

  res.json({ success: true, message: "Daftar staff", data: { staff: staffWithEmail } });
}

export async function createAdminStaff(req: Request, res: Response): Promise<void> {
  const { nama, email, no_hp, password, role, cabang_id } = req.body;

  if (!nama || !email || !password || !role) {
    res.status(400).json({ success: false, message: "Nama, email, password, dan jabatan wajib diisi", data: {} });
    return;
  }
  if (!["teller", "cs"].includes(role)) {
    res.status(400).json({ success: false, message: "Jabatan harus teller atau cs", data: {} });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ success: false, message: "Password minimal 8 karakter", data: {} });
    return;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: { nama, no_hp, role },
    app_metadata: { role },
  });

  if (authError || !authData.user) {
    const msg = authError?.message?.includes("already registered")
      ? "Email sudah terdaftar"
      : (authError?.message ?? "Gagal membuat akun");
    res.status(400).json({ success: false, message: msg, data: {} });
    return;
  }

  const profileInsert: Record<string, any> = { id: authData.user.id, nama, no_hp: no_hp ?? null, role };
  if (cabang_id) profileInsert.cabang_id = Number(cabang_id);

  await supabaseAdmin.from("profiles").insert(profileInsert);

  actLog(req, "create_staff", { email, nama, role, cabang_id });
  res.status(201).json({
    success: true,
    message: `Akun ${role.toUpperCase()} ${nama} berhasil dibuat`,
    data: { id: authData.user.id, nama, email: email.toLowerCase().trim(), role, cabang_id },
  });
}

export async function updateAdminStaff(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { nama, role, cabang_id, no_hp } = req.body;

  const profileUpdate: Record<string, any> = {};
  if (nama    !== undefined) profileUpdate.nama    = nama;
  if (no_hp   !== undefined) profileUpdate.no_hp   = no_hp;
  if (role    !== undefined && ["teller", "cs"].includes(role)) profileUpdate.role = role;
  if (cabang_id !== undefined) profileUpdate.cabang_id = cabang_id ? Number(cabang_id) : null;

  if (Object.keys(profileUpdate).length === 0) {
    res.status(400).json({ success: false, message: "Tidak ada data yang diubah", data: {} });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ success: false, message: error?.message ?? "Staff tidak ditemukan", data: {} });
    return;
  }

  // Sinkronkan role ke Supabase Auth metadata jika role diubah
  if (profileUpdate.role) {
    await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: { role: profileUpdate.role },
      user_metadata: { role: profileUpdate.role },
    }).catch(() => {/* non-fatal */});
  }

  actLog(req, "update_staff", { id, ...profileUpdate });
  res.json({ success: true, message: `Data staff berhasil diperbarui`, data: { staff: data } });
}

export async function resetPasswordAdminStaff(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { password_baru } = req.body;

  if (!password_baru || (password_baru as string).length < 8) {
    res.status(400).json({ success: false, message: "Password baru minimal 8 karakter", data: {} });
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password: password_baru as string,
  });

  if (error) {
    res.status(400).json({ success: false, message: "Gagal reset password: " + error.message, data: {} });
    return;
  }

  // Ambil profile untuk log
  const { data: prof } = await supabaseAdmin.from("profiles").select("nama").eq("id", id).maybeSingle();
  actLog(req, "reset_password_staff", { staffId: id, staffNama: prof?.nama });
  res.json({ success: true, message: `Password ${prof?.nama ?? "staff"} berhasil direset`, data: {} });
}

export async function deleteAdminStaff(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  // Hapus dari Supabase Auth (profiles akan tetap sebagai histori)
  const { data: prof } = await supabaseAdmin.from("profiles").select("nama, role").eq("id", id).maybeSingle();

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) {
    res.status(400).json({ success: false, message: "Gagal menghapus akun: " + error.message, data: {} });
    return;
  }

  actLog(req, "delete_staff", { staffId: id, staffNama: prof?.nama });
  res.json({ success: true, message: `Akun ${prof?.nama ?? "staff"} berhasil dihapus`, data: {} });
}

// ===========================================================
// LAPORAN ANTRIAN
// ===========================================================

export async function getLaporan(req: Request, res: Response): Promise<void> {
  const {
    dari,      // YYYY-MM-DD
    sampai,    // YYYY-MM-DD
    cabang_id,
    layanan,
    status,
    format,    // "csv" untuk export
    limit: limitRaw,
    offset: offsetRaw,
  } = req.query;

  const limitVal  = Math.min(Number(limitRaw ?? 100), 500);
  const offsetVal = Number(offsetRaw ?? 0);

  // Tentukan rentang tanggal
  const dariStr   = dari   ? `${dari}T00:00:00.000Z`   : new Date(new Date().setHours(0,0,0,0)).toISOString();
  const sampaiStr = sampai ? `${sampai}T23:59:59.999Z` : new Date(new Date().setHours(23,59,59,999)).toISOString();

  try {
    let query = supabaseAdmin
      .from("antrian")
      .select(`
        id, nomor_antrian, layanan, keperluan, status, cabang_id,
        loket_number, notif_sent, created_at, called_at, finished_at,
        nama_nasabah, no_hp_nasabah,
        profiles (nama, no_hp),
        cabang:cabang_id (nama, kode)
      `, { count: "exact" })
      .gte("created_at", dariStr)
      .lte("created_at", sampaiStr)
      .order("created_at", { ascending: false });

    if (cabang_id) query = query.eq("cabang_id", Number(cabang_id));
    if (layanan)   query = query.eq("layanan", layanan as string);
    if (status)    query = query.eq("status", status as string);

    if (format !== "csv") {
      query = query.range(offsetVal, offsetVal + limitVal - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    if (format === "csv") {
      const rows = data ?? [];
      const header = ["ID","Nomor","Layanan","Keperluan","Status","Cabang","Loket","Nama","No HP","Waktu Ambil","Waktu Panggil","Waktu Selesai"];
      const csvRows = rows.map(r => [
        r.id,
        r.nomor_antrian,
        r.layanan,
        r.keperluan ?? "",
        r.status,
        (r as any).cabang?.nama ?? "",
        r.loket_number ?? "",
        (r as any).profiles?.nama ?? r.nama_nasabah ?? "",
        (r as any).profiles?.no_hp ?? r.no_hp_nasabah ?? "",
        r.created_at  ? new Date(r.created_at).toLocaleString("id-ID")  : "",
        r.called_at   ? new Date(r.called_at).toLocaleString("id-ID")   : "",
        r.finished_at ? new Date(r.finished_at).toLocaleString("id-ID") : "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

      const csv = [header.join(","), ...csvRows].join("\n");
      const tanggal = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="laporan-antrian-${tanggal}.csv"`);
      res.send("\uFEFF" + csv); // BOM untuk Excel
      return;
    }

    res.json({
      success: true,
      message: "Laporan antrian berhasil diambil",
      data: {
        antrian: data,
        total: count ?? 0,
        limit: limitVal,
        offset: offsetVal,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal mengambil laporan: " + (err?.message ?? ""), data: {} });
  }
}

// ===========================================================
// GET /api/admin/staff/:id/monitor — data dashboard live staff
// ===========================================================
export async function getStaffMonitor(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  // Ambil profil staff
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("profiles")
    .select("id, nama, role, loket_number, no_hp, cabang_id, cabang:cabang_id(id, nama, kode)")
    .eq("id", id)
    .in("role", ["teller", "cs"])
    .single();

  if (staffErr || !staff) {
    res.status(404).json({ success: false, message: "Staff tidak ditemukan", data: {} });
    return;
  }

  // Tentukan filter layanan berdasarkan role
  const layananFilter = (staff.role as string) === "teller" ? "Teller" : "CS";

  // Ambil semua antrian hari ini untuk loket staff ini
  let antrianQuery = supabaseAdmin
    .from("antrian")
    .select(`
      id, nomor_antrian, layanan, keperluan, status,
      created_at, called_at, finished_at,
      loket_number,
      profiles:user_id(nama, no_hp),
      nama_nasabah, no_hp_nasabah
    `)
    .eq("layanan", layananFilter)
    .gte("created_at", todayStart)
    .order("created_at", { ascending: true });

  // Filter cabang (kalau loket_number null maka cukup filter layanan + cabang)
  if (staff.cabang_id) antrianQuery = antrianQuery.eq("cabang_id", staff.cabang_id);
  if (staff.loket_number) antrianQuery = antrianQuery.eq("loket_number", staff.loket_number);

  const { data: antrian, error: antrianErr } = await antrianQuery;
  if (antrianErr) {
    res.status(500).json({ success: false, message: antrianErr.message, data: {} });
    return;
  }

  const list = antrian ?? [];
  const stats = {
    total:     list.length,
    menunggu:  list.filter(a => a.status === "menunggu").length,
    dipanggil: list.filter(a => a.status === "dipanggil").length,
    selesai:   list.filter(a => a.status === "selesai").length,
    batal:     list.filter(a => a.status === "batal").length,
  };

  // Nomor yang sedang dilayani sekarang
  const nowServing = list.find(a => a.status === "dipanggil") ?? null;

  res.json({
    success: true,
    message: "Data monitor staff",
    data: { staff, antrian: list, stats, nowServing },
  });
}

// ===========================================================
// Buat akun admin pertama — dilindungi SESSION_SECRET
// POST /api/admin/bootstrap
// ===========================================================
export async function bootstrapAdmin(req: Request, res: Response): Promise<void> {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.SESSION_SECRET) {
    res.status(403).json({ success: false, message: "Akses ditolak", data: {} });
    return;
  }

  const { nama, email, no_hp, password } = req.body;
  if (!nama || !email || !password) {
    res.status(400).json({ success: false, message: "nama, email, password wajib diisi", data: {} });
    return;
  }
  if ((password as string).length < 8) {
    res.status(400).json({ success: false, message: "Password minimal 8 karakter", data: {} });
    return;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: (email as string).toLowerCase().trim(),
    password: password as string,
    email_confirm: true,
    user_metadata: { nama, no_hp, role: "admin" },
    app_metadata: { role: "admin" },
  });

  if (authError || !authData.user) {
    const msg = authError?.message?.includes("already registered")
      ? "Email sudah terdaftar"
      : (authError?.message ?? "Gagal membuat akun admin");
    res.status(400).json({ success: false, message: msg, data: {} });
    return;
  }

  await supabaseAdmin.from("profiles").upsert({
    id: authData.user.id,
    nama: nama as string,
    no_hp: no_hp ?? null,
    role: "admin",
    cabang_id: null,
  });

  logger.info({ email, nama, id: authData.user.id }, "[ADMIN] Akun admin berhasil dibuat via bootstrap");
  res.status(201).json({
    success: true,
    message: `Akun admin ${nama} berhasil dibuat. Silakan login di /login`,
    data: { id: authData.user.id, email, nama, role: "admin" },
  });
}

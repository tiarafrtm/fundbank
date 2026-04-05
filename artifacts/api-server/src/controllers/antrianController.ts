import { type Request, type Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { logger } from "../lib/logger";
import {
  getNomorAntrian,
  getAntrianMenunggu,
  panggilBerikutnya,
} from "../services/antrianService";
import { sendPushNotification } from "../services/onesignalService";
import { sendWhatsAppMessage } from "../services/waService";

// Map role → layanan yang diizinkan
const ROLE_LAYANAN: Record<string, string> = {
  teller: "Teller",
  cs: "CS",
};

function actLog(req: Request, action: string, detail: Record<string, any> = {}) {
  const role  = (req as any).userRole ?? "unknown";
  const nama  = (req as any).userNama ?? "unknown";
  const user  = (req as any).user;
  logger.info({ actor: nama, role, userId: user?.id, action, ...detail }, `[AKTIVITAS] ${action}`);
}

// Helper: ambil profil staff berikut info cabang sekaligus
async function getStaffProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("loket_number, layanan, cabang_id, cabang:cabang_id(id, nama, kode)")
    .eq("id", userId)
    .maybeSingle();
  return data as (Record<string, any> | null);
}

// Statistik antrian hari ini — difilter per cabang staff
export async function getStatistik(req: Request, res: Response): Promise<void> {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const user = (req as any).user;

  try {
    const staffProfile = await getStaffProfile(user.id);
    const cabangId: number | null = staffProfile?.cabang_id ?? null;

    let query = supabaseAdmin
      .from("antrian")
      .select("status, layanan")
      .gte("created_at", todayStart);

    if (cabangId != null) query = query.eq("cabang_id", cabangId);

    const { data, error } = await query;
    if (error) throw error;

    const items = data ?? [];
    const total      = items.length;
    const menunggu   = items.filter(i => i.status === "menunggu").length;
    const dipanggil  = items.filter(i => i.status === "dipanggil").length;
    const selesai    = items.filter(i => i.status === "selesai").length;
    const batal      = items.filter(i => i.status === "batal").length;

    const semuaLayanan = [...new Set(items.map(i => i.layanan))];
    const urutan = ["Teller", "CS", "Tabungan", "Kredit", "Umum"];
    const layananTerurut = [
      ...urutan.filter(l => semuaLayanan.includes(l)),
      ...semuaLayanan.filter(l => !urutan.includes(l)),
    ];
    const perLayanan = layananTerurut.map(l => ({
      layanan: l,
      total:    items.filter(i => i.layanan === l).length,
      selesai:  items.filter(i => i.layanan === l && i.status === "selesai").length,
      menunggu: items.filter(i => i.layanan === l && i.status === "menunggu").length,
    }));

    res.json({
      success: true,
      message: "Statistik antrian hari ini",
      data: { total, menunggu, dipanggil, selesai, batal, per_layanan: perLayanan },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Gagal mengambil statistik: " + (error?.message ?? ""), data: {} });
  }
}

// CS/Teller/Nasabah membuat nomor antrian
export async function ambilAntrian(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { layanan, nama, no_hp, onesignal_player_id } = req.body;

  if (!layanan) {
    res.status(400).json({ success: false, message: "Layanan wajib diisi", data: {} });
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, cabang_id").eq("id", user.id).single();
  const isStaff  = ["cs", "teller"].includes(profile?.role ?? "");
  const cabangId: number | null = profile?.cabang_id ?? null;

  if (!isStaff) {
    const { data: existingAntrian } = await supabaseAdmin
      .from("antrian").select("*")
      .eq("user_id", user.id)
      .in("status", ["menunggu", "dipanggil"])
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .single();

    if (existingAntrian) {
      res.status(400).json({ success: false, message: "Anda sudah memiliki antrian aktif hari ini", data: { antrian: existingAntrian } });
      return;
    }
  }

  if (onesignal_player_id && !isStaff) {
    await supabaseAdmin.from("profiles").update({ onesignal_player_id }).eq("id", user.id);
  }

  const nomorAntrian = await getNomorAntrian(layanan, cabangId);

  const insertData: Record<string, any> = {
    user_id: isStaff ? null : user.id,
    nomor_antrian: nomorAntrian,
    layanan,
    status: "menunggu",
    notif_sent: false,
  };
  if (cabangId != null) insertData.cabang_id = cabangId;
  if (isStaff && nama) insertData.nama_nasabah = nama;
  if (isStaff && no_hp) insertData.no_hp_nasabah = no_hp;

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian").insert(insertData).select().single();

  if (error || !antrian) {
    res.status(500).json({ success: false, message: "Gagal membuat nomor antrian: " + (error?.message ?? ""), data: {} });
    return;
  }

  actLog(req, "ambil_antrian", { layanan, nomor: nomorAntrian, cabang: cabangId });
  res.status(201).json({ success: true, message: `Nomor antrian ${nomorAntrian} berhasil dibuat`, data: { antrian, nomor_antrian: nomorAntrian } });
}

// Nasabah mengecek posisi antrian
export async function statusAntrian(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian").select("*")
    .eq("user_id", user.id)
    .in("status", ["menunggu", "dipanggil"])
    .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    .order("created_at", { ascending: false })
    .limit(1).single();

  if (error || !antrian) {
    res.status(404).json({ success: false, message: "Tidak ada antrian aktif untuk Anda hari ini", data: {} });
    return;
  }

  const { count: posisiDepan } = await supabaseAdmin
    .from("antrian").select("*", { count: "exact", head: true })
    .eq("status", "menunggu").eq("layanan", antrian.layanan)
    .lt("nomor_antrian", antrian.nomor_antrian);

  res.json({ success: true, message: "Status antrian berhasil diambil", data: { antrian, posisi_saat_ini: (posisiDepan ?? 0) + 1, antrian_di_depan: posisiDepan ?? 0 } });
}

// Teller/CS melihat daftar antrian
export async function listAntrian(req: Request, res: Response): Promise<void> {
  const { layanan, status, all } = req.query;
  const user = (req as any).user;
  const showAll = all === "true";
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  try {
    // Ambil profil staff: loket_number, layanan, cabang_id + nama cabang (join)
    const staffProfile = await getStaffProfile(user.id);
    const myLoketNumber: number | null = staffProfile?.loket_number ?? null;
    const cabangId: number | null      = staffProfile?.cabang_id ?? null;
    const cabangInfo: any              = staffProfile?.cabang ?? null;

    // Ambil loket_terpakai — hanya dari staff ROLE SAMA di cabang yang sama
    // (Teller dan CS punya loket terpisah — loket Teller tidak konflik dengan loket CS)
    const myRole = (req as any).userRole as string;
    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select("id, loket_number")
      .eq("role", myRole)
      .not("loket_number", "is", null);

    if (cabangId != null) profilesQuery = profilesQuery.eq("cabang_id", cabangId);

    const { data: allProfiles } = await profilesQuery;

    const loketTerpakai: number[] = (allProfiles ?? [])
      .filter((p: any) => p.id !== user.id && p.loket_number != null)
      .map((p: any) => p.loket_number as number);

    let query = supabaseAdmin
      .from("antrian")
      .select(`*, profiles (nama, no_hp)`)
      .gte("created_at", todayStart)
      .order("nomor_antrian", { ascending: true });

    if (cabangId != null) query = query.eq("cabang_id", cabangId);

    if (showAll) {
      if (status) query = query.eq("status", status as string);
    } else {
      query = query.eq("status", "menunggu");
    }

    if (layanan) query = query.eq("layanan", layanan as string);

    const { data, error } = await query;
    if (error) throw error;

    if (showAll) {
      res.json({ success: true, message: "Daftar antrian berhasil diambil", data: { antrian: data, total: data?.length ?? 0 } });
      return;
    }

    // "Sedang dilayani" = antrian dipanggil di loket SAYA (kalau loket sudah diset)
    let dipanggilQuery = supabaseAdmin
      .from("antrian").select(`*, profiles (nama, no_hp)`)
      .eq("status", "dipanggil")
      .gte("created_at", todayStart)
      .order("called_at", { ascending: false });

    if (layanan) dipanggilQuery = dipanggilQuery.eq("layanan", layanan as string);
    if (cabangId != null) dipanggilQuery = dipanggilQuery.eq("cabang_id", cabangId);

    const { data: semuaDipanggil } = await dipanggilQuery;

    let sedangDilayaniLoketIni = null;
    if (myLoketNumber != null && semuaDipanggil) {
      sedangDilayaniLoketIni = semuaDipanggil.find((a: any) => a.loket_number === myLoketNumber) ?? null;
    } else {
      sedangDilayaniLoketIni = semuaDipanggil?.[0] ?? null;
    }

    const loketAktifMap: Record<number, any> = {};
    if (semuaDipanggil) {
      for (const a of semuaDipanggil) {
        if (a.loket_number != null && !loketAktifMap[a.loket_number]) {
          loketAktifMap[a.loket_number] = a;
        }
      }
    }

    res.json({
      success: true,
      message: "Daftar antrian berhasil diambil",
      data: {
        my_loket_number:  myLoketNumber,
        my_cabang:        cabangInfo,
        loket_terpakai:   loketTerpakai,
        sedang_dilayani:  sedangDilayaniLoketIni,
        semua_loket_aktif: loketAktifMap,
        antrian_dipanggil: semuaDipanggil ?? [],
        antrian_menunggu:  data,
        total_menunggu:    data?.length ?? 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Gagal mengambil daftar antrian: " + (error?.message ?? ""), data: {} });
  }
}

// Teller/CS menetapkan nomor loket mereka
export async function setLoket(req: Request, res: Response): Promise<void> {
  const user    = (req as any).user;
  const role    = (req as any).userRole as string;
  const { loket_number } = req.body;

  if (!loket_number || typeof loket_number !== "number" || loket_number < 1 || loket_number > 4) {
    res.status(400).json({
      success: false,
      message: "Nomor loket tidak valid (harus angka 1–4)",
      data: {},
    });
    return;
  }

  const layanan = ROLE_LAYANAN[role] ?? null;

  // Ambil cabang staff yang sedang login
  const staffProfile = await getStaffProfile(user.id);
  const cabangId = staffProfile?.cabang_id ?? null;

  // Cek konflik: apakah loket sudah dipakai staff lain dengan role yang sama di cabang yang sama
  let conflictQuery = supabaseAdmin
    .from("profiles")
    .select("id, nama")
    .eq("role", role)
    .eq("loket_number", loket_number)
    .neq("id", user.id);

  if (cabangId != null) conflictQuery = conflictQuery.eq("cabang_id", cabangId);

  const { data: conflict } = await conflictQuery.maybeSingle();
  if (conflict) {
    res.status(409).json({
      success: false,
      message: `Loket ${loket_number} sudah dipakai oleh ${conflict.nama}. Pilih nomor lain.`,
      data: {},
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ loket_number, layanan })
    .eq("id", user.id)
    .select("id, nama, loket_number, layanan, cabang_id")
    .single();

  if (error || !data) {
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan nomor loket: " + (error?.message ?? ""),
      data: {},
    });
    return;
  }

  actLog(req, "set_loket", { loket_number, layanan });
  res.json({
    success: true,
    message: `Loket ${loket_number} berhasil ditetapkan`,
    data: { loket_number: data.loket_number, layanan: data.layanan },
  });
}

// Teller/CS memilih cabang tempat mereka bertugas hari ini
export async function setCabang(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  const { cabang_id } = req.body;

  if (!cabang_id || typeof cabang_id !== "number" || cabang_id < 1) {
    res.status(400).json({ success: false, message: "cabang_id tidak valid", data: {} });
    return;
  }

  // Verifikasi cabang ada dan aktif
  const { data: cabang, error: cabangErr } = await supabaseAdmin
    .from("cabang")
    .select("id, nama, kode, alamat")
    .eq("id", cabang_id)
    .eq("is_active", true)
    .single();

  if (cabangErr || !cabang) {
    res.status(404).json({ success: false, message: "Cabang tidak ditemukan atau tidak aktif", data: {} });
    return;
  }

  // Simpan cabang_id ke profil, reset loket_number (loket lama tidak valid di cabang baru)
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ cabang_id, loket_number: null })
    .eq("id", user.id);

  if (error) {
    res.status(500).json({ success: false, message: "Gagal menyimpan cabang: " + (error?.message ?? ""), data: {} });
    return;
  }

  actLog(req, "set_cabang", { cabang_id, cabang_nama: cabang.nama });
  res.json({
    success: true,
    message: `Cabang ${cabang.nama} berhasil dipilih`,
    data: { cabang },
  });
}

// Teller/CS memanggil nomor antrian berikutnya
export async function panggilAntrian(req: Request, res: Response): Promise<void> {
  const { layanan } = req.body;
  const user = (req as any).user;
  const role = (req as any).userRole as string;

  const allowedLayanan = ROLE_LAYANAN[role];
  if (allowedLayanan && layanan && layanan !== allowedLayanan) {
    res.status(403).json({
      success: false,
      message: `Anda hanya bisa memanggil antrian ${allowedLayanan}`,
      data: {},
    });
    return;
  }

  const targetLayanan = allowedLayanan ?? layanan;

  // Ambil loket_number dan cabang_id dari profil staff
  const staffProfile = await getStaffProfile(user.id);
  const loketNumber: number | null = staffProfile?.loket_number ?? null;
  const cabangId: number | null    = staffProfile?.cabang_id ?? null;

  try {
    const { antrian, notifDikirim } = await panggilBerikutnya(targetLayanan, loketNumber, cabangId);

    actLog(req, "panggil_antrian", { layanan: targetLayanan, nomor: antrian.nomor_antrian, loket: loketNumber, cabang: cabangId, id: antrian.id });

    res.json({
      success: true,
      message: `Nomor ${antrian.nomor_antrian} dipanggil ke Loket ${loketNumber ?? "?"}${notifDikirim ? ". Notifikasi dikirim ke antrian berikutnya" : ""}`,
      data: { antrian, notif_dikirim: notifDikirim, loket_number: loketNumber },
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Tidak ada antrian") ? 404 : 500;
    res.status(statusCode).json({ success: false, message: error?.message ?? "Gagal memanggil antrian", data: {} });
  }
}

// Teller/CS menandai antrian sebagai selesai
export async function selesaiAntrian(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = (req as any).user;
  const role = (req as any).userRole as string;

  const { data: existing, error: checkErr } = await supabaseAdmin
    .from("antrian").select("status, nomor_antrian, layanan, loket_number, cabang_id").eq("id", id).single();

  if (checkErr || !existing) {
    res.status(404).json({ success: false, message: "Antrian tidak ditemukan", data: {} });
    return;
  }

  if (existing.status === "selesai") {
    res.status(400).json({ success: false, message: "Antrian sudah ditandai selesai sebelumnya", data: {} });
    return;
  }
  if (existing.status === "batal") {
    res.status(400).json({ success: false, message: "Antrian sudah dibatalkan, tidak bisa diselesaikan", data: {} });
    return;
  }

  const allowedLayanan = ROLE_LAYANAN[role];
  if (allowedLayanan && existing.layanan !== allowedLayanan) {
    res.status(403).json({
      success: false,
      message: `Anda tidak bisa menyelesaikan antrian layanan ${existing.layanan}`,
      data: {},
    });
    return;
  }

  // Validasi loket DAN cabang
  const staffProfile = await getStaffProfile(user.id);
  const myLoket   = staffProfile?.loket_number ?? null;
  const myCabangId = staffProfile?.cabang_id ?? null;

  if (myLoket && existing.loket_number && myLoket !== existing.loket_number) {
    res.status(403).json({
      success: false,
      message: `Antrian ini sedang dilayani Loket ${existing.loket_number}, bukan Loket ${myLoket} Anda`,
      data: {},
    });
    return;
  }

  if (myCabangId && existing.cabang_id && myCabangId !== existing.cabang_id) {
    res.status(403).json({
      success: false,
      message: `Antrian ini bukan milik cabang Anda`,
      data: {},
    });
    return;
  }

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .update({ status: "selesai", finished_at: new Date().toISOString() })
    .eq("id", id)
    .select().single();

  if (error || !antrian) {
    res.status(500).json({ success: false, message: "Gagal memperbarui antrian", data: {} });
    return;
  }

  actLog(req, "selesai_antrian", { layanan: antrian.layanan, nomor: antrian.nomor_antrian, id });
  res.json({ success: true, message: `Antrian nomor ${antrian.nomor_antrian} telah selesai`, data: { antrian } });
}

// Membatalkan/skip antrian
export async function batalAntrian(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = (req as any).user;
  const role = (req as any).userRole as string;
  const isStaff = ["teller", "cs"].includes(role);

  const { data: existing } = await supabaseAdmin
    .from("antrian").select("status, nomor_antrian, layanan, user_id, loket_number, cabang_id").eq("id", id).single();

  if (!existing) {
    res.status(404).json({ success: false, message: "Antrian tidak ditemukan", data: {} });
    return;
  }

  const allowedLayanan = ROLE_LAYANAN[role];
  if (isStaff && allowedLayanan && existing.layanan !== allowedLayanan) {
    res.status(403).json({
      success: false,
      message: `Anda tidak bisa membatalkan antrian layanan ${existing.layanan}`,
      data: {},
    });
    return;
  }

  if (isStaff) {
    const staffProfile = await getStaffProfile(user.id);
    const myLoket    = staffProfile?.loket_number ?? null;
    const myCabangId = staffProfile?.cabang_id ?? null;

    // Validasi loket (hanya untuk antrian yang sudah dipanggil)
    if (existing.status === "dipanggil" && existing.loket_number && myLoket && myLoket !== existing.loket_number) {
      res.status(403).json({
        success: false,
        message: `Antrian ini sedang dilayani Loket ${existing.loket_number}, bukan Loket ${myLoket} Anda`,
        data: {},
      });
      return;
    }

    // Validasi cabang
    if (myCabangId && existing.cabang_id && myCabangId !== existing.cabang_id) {
      res.status(403).json({
        success: false,
        message: `Antrian ini bukan milik cabang Anda`,
        data: {},
      });
      return;
    }
  }

  let query = supabaseAdmin
    .from("antrian")
    .update({ status: "batal" })
    .eq("id", id)
    .in("status", ["menunggu", "dipanggil"]);

  if (!isStaff) query = query.eq("user_id", user.id);

  const { data: antrian, error } = await query.select().single();

  if (error || !antrian) {
    res.status(404).json({ success: false, message: "Antrian tidak dapat dibatalkan", data: {} });
    return;
  }

  actLog(req, "batal_antrian", { layanan: antrian.layanan, nomor: antrian.nomor_antrian, id });

  // Kirim notifikasi ke nasabah yang diskip — jalankan async
  (async () => {
    try {
      // Ambil nama cabang untuk pesan WA
      let cabangNama = "FUND BANK";
      if (antrian.cabang_id) {
        const { data: cb } = await supabaseAdmin.from("cabang").select("nama").eq("id", antrian.cabang_id).maybeSingle();
        if (cb?.nama) cabangNama = `FUND BANK, ${cb.nama}`;
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("nama, no_hp, onesignal_player_id")
        .eq("id", antrian.user_id)
        .maybeSingle();

      const namaNasabah    = profile?.nama ?? antrian.nama_nasabah ?? "Nasabah";
      const noHp           = profile?.no_hp ?? antrian.no_hp_nasabah;
      const layananDisplay = antrian.layanan === "CS" ? "Customer Service" : antrian.layanan;

      if (profile?.onesignal_player_id) {
        try {
          await sendPushNotification(profile.onesignal_player_id, antrian.nomor_antrian, "skip");
          logger.info({ nomor: antrian.nomor_antrian }, "Push skip terkirim");
        } catch (e: any) {
          logger.warn({ error: e?.message }, "Push skip gagal");
        }
      }

      if (noHp) {
        const pesanWA =
          `Halo, ${namaNasabah}!\n\n` +
          `⚠️ Nomor antrian *${antrian.nomor_antrian}* (${layananDisplay}) Anda telah *dilewati* karena tidak hadir saat dipanggil.\n\n` +
          `Mohon diperhatikan: Jika ada notifikasi WhatsApp dari kami, *segera datang ke loket* agar tidak dilewati kembali.\n\n` +
          `Lihat status atau ambil antrian baru:\n` +
          `https://antrianbank.site/tiket?ticket=${antrian.nomor_antrian}\n\n` +
          `— ${cabangNama}`;

        try {
          await sendWhatsAppMessage(noHp, pesanWA);
          logger.info({ noHp, nomor: antrian.nomor_antrian }, "WA skip terkirim");
        } catch (e: any) {
          logger.error({ noHp, error: e?.message }, "WA skip GAGAL");
        }
      }
    } catch (e: any) {
      logger.error({ error: e?.message }, "Notif skip error (non-fatal)");
    }
  })();

  res.json({ success: true, message: `Antrian nomor ${antrian.nomor_antrian} berhasil dibatalkan`, data: { antrian } });
}

// Restore antrian dari 'batal' ke 'menunggu' (undo skip dalam 60 detik)
export async function restoreAntrian(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = (req as any).user;
  const role = (req as any).userRole as string;
  const isStaff = ["teller", "cs"].includes(role);

  if (!isStaff) {
    res.status(403).json({ success: false, message: "Hanya staf yang bisa restore antrian", data: {} });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("antrian").select("status, nomor_antrian, layanan, updated_at, cabang_id").eq("id", id).single();

  if (!existing || existing.status !== "batal") {
    res.status(400).json({ success: false, message: "Antrian tidak dalam status batal", data: {} });
    return;
  }

  const cancelledAt = new Date(existing.updated_at).getTime();
  const secondsElapsed = (Date.now() - cancelledAt) / 1000;
  if (secondsElapsed > 60) {
    res.status(400).json({ success: false, message: "Waktu undo sudah habis (maks 60 detik)", data: {} });
    return;
  }

  const allowedLayanan = ROLE_LAYANAN[role];
  if (allowedLayanan && existing.layanan !== allowedLayanan) {
    res.status(403).json({ success: false, message: `Tidak bisa restore antrian layanan ${existing.layanan}`, data: {} });
    return;
  }

  // Validasi cabang
  const staffProfile = await getStaffProfile(user.id);
  const myCabangId = staffProfile?.cabang_id ?? null;
  if (myCabangId && existing.cabang_id && myCabangId !== existing.cabang_id) {
    res.status(403).json({ success: false, message: `Antrian ini bukan milik cabang Anda`, data: {} });
    return;
  }

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .update({ status: "menunggu" })
    .eq("id", id).eq("status", "batal")
    .select().single();

  if (error || !antrian) {
    res.status(500).json({ success: false, message: "Gagal merestore antrian", data: {} });
    return;
  }

  actLog(req, "restore_antrian", { layanan: antrian.layanan, nomor: antrian.nomor_antrian, id });
  res.json({ success: true, message: `Antrian nomor ${antrian.nomor_antrian} berhasil dipulihkan`, data: { antrian } });
}

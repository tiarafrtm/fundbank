import { type Request, type Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import {
  getNomorAntrian,
  getAntrianMenunggu,
  panggilBerikutnya,
} from "../services/antrianService";

// Nasabah mengambil nomor antrian
export async function ambilAntrian(
  req: Request,
  res: Response,
): Promise<void> {
  const user = (req as any).user;
  const { layanan, onesignal_player_id } = req.body;

  if (!layanan) {
    res.status(400).json({
      success: false,
      message: "Layanan wajib diisi (Tabungan/Kredit/Umum)",
      data: {},
    });
    return;
  }

  // Cek apakah nasabah sudah punya antrian aktif hari ini
  const { data: existingAntrian } = await supabaseAdmin
    .from("antrian")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["menunggu", "dipanggil"])
    .gte(
      "created_at",
      new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    )
    .single();

  if (existingAntrian) {
    res.status(400).json({
      success: false,
      message: "Anda sudah memiliki antrian aktif hari ini",
      data: { antrian: existingAntrian },
    });
    return;
  }

  // Update onesignal_player_id jika diberikan
  if (onesignal_player_id) {
    await supabaseAdmin
      .from("profiles")
      .update({ onesignal_player_id })
      .eq("id", user.id);
  }

  // Dapatkan nomor antrian berikutnya
  const nomorAntrian = await getNomorAntrian(layanan);

  // Buat record antrian baru
  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .insert({
      user_id: user.id,
      nomor_antrian: nomorAntrian,
      layanan,
      status: "menunggu",
      notif_sent: false,
    })
    .select()
    .single();

  if (error || !antrian) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil nomor antrian: " + (error?.message ?? ""),
      data: {},
    });
    return;
  }

  res.status(201).json({
    success: true,
    message: `Nomor antrian Anda adalah ${nomorAntrian}`,
    data: { antrian },
  });
}

// Nasabah mengecek posisi antrian mereka
export async function statusAntrian(
  req: Request,
  res: Response,
): Promise<void> {
  const user = (req as any).user;

  // Ambil antrian aktif nasabah hari ini
  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["menunggu", "dipanggil"])
    .gte(
      "created_at",
      new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !antrian) {
    res.status(404).json({
      success: false,
      message: "Tidak ada antrian aktif untuk Anda hari ini",
      data: {},
    });
    return;
  }

  // Hitung berapa orang yang masih di depan
  const { count: posisiDepan } = await supabaseAdmin
    .from("antrian")
    .select("*", { count: "exact", head: true })
    .eq("status", "menunggu")
    .eq("layanan", antrian.layanan)
    .lt("nomor_antrian", antrian.nomor_antrian);

  res.json({
    success: true,
    message: "Status antrian berhasil diambil",
    data: {
      antrian,
      posisi_saat_ini: (posisiDepan ?? 0) + 1,
      antrian_di_depan: posisiDepan ?? 0,
    },
  });
}

// Teller melihat semua antrian yang menunggu
export async function listAntrian(req: Request, res: Response): Promise<void> {
  const { layanan } = req.query;

  try {
    let query = supabaseAdmin
      .from("antrian")
      .select(
        `
        *,
        profiles (nama, no_hp)
      `,
      )
      .eq("status", "menunggu")
      .order("nomor_antrian", { ascending: true });

    if (layanan) {
      query = query.eq("layanan", layanan as string);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Ambil nomor yang sedang dilayani saat ini
    const { data: sedangDilayani } = await supabaseAdmin
      .from("antrian")
      .select(
        `
        *,
        profiles (nama, no_hp)
      `,
      )
      .eq("status", "dipanggil")
      .order("called_at", { ascending: false })
      .limit(1)
      .single();

    res.json({
      success: true,
      message: "Daftar antrian berhasil diambil",
      data: {
        sedang_dilayani: sedangDilayani ?? null,
        antrian_menunggu: data,
        total_menunggu: data?.length ?? 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar antrian: " + (error?.message ?? ""),
      data: {},
    });
  }
}

// Teller memanggil nomor antrian berikutnya
export async function panggilAntrian(
  req: Request,
  res: Response,
): Promise<void> {
  const { layanan } = req.body;

  try {
    const { antrian, notifDikirim } = await panggilBerikutnya(layanan);

    res.json({
      success: true,
      message: `Nomor ${antrian.nomor_antrian} dipanggil${notifDikirim ? ". Notifikasi dikirim ke antrian berikutnya" : ""}`,
      data: { antrian, notif_dikirim: notifDikirim },
    });
  } catch (error: any) {
    const statusCode =
      error?.message === "Tidak ada antrian yang menunggu" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error?.message ?? "Gagal memanggil antrian",
      data: {},
    });
  }
}

// Teller menandai antrian sebagai selesai
export async function selesaiAntrian(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .update({ status: "selesai" })
    .eq("id", id)
    .select()
    .single();

  if (error || !antrian) {
    res.status(404).json({
      success: false,
      message: "Antrian tidak ditemukan atau gagal diperbarui",
      data: {},
    });
    return;
  }

  res.json({
    success: true,
    message: `Antrian nomor ${antrian.nomor_antrian} telah selesai`,
    data: { antrian },
  });
}

// Membatalkan antrian (oleh nasabah atau teller)
export async function batalAntrian(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const user = (req as any).user;

  const { data: antrian, error } = await supabaseAdmin
    .from("antrian")
    .update({ status: "batal" })
    .eq("id", id)
    .eq("user_id", user.id) // Pastikan hanya pemilik yang bisa batal
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

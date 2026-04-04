import { type Request, type Response } from "express";
import { supabaseAdmin } from "../config/supabase";

// GET /api/antrian/cabang   — untuk dashboard staff (perlu auth)
// GET /api/mobile/cabang    — untuk mobile nasabah (tanpa auth, public)
export async function listCabang(_req: Request, res: Response): Promise<void> {
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

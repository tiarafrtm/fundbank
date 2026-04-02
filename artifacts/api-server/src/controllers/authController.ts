import { type Request, type Response } from "express";
import { supabase, supabaseAdmin } from "../config/supabase";

// Mendaftarkan nasabah baru
export async function register(req: Request, res: Response): Promise<void> {
  const { nama, email, password, no_hp } = req.body;

  if (!nama || !email || !password || !no_hp) {
    res.status(400).json({
      success: false,
      message: "Nama, email, password, dan no_hp wajib diisi",
      data: {},
    });
    return;
  }

  // Daftarkan user ke Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nama, no_hp },
    },
  });

  if (authError || !authData.user) {
    res.status(400).json({
      success: false,
      message: authError?.message ?? "Gagal mendaftarkan akun",
      data: {},
    });
    return;
  }

  // Buat profil nasabah di tabel profiles
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: authData.user.id,
    nama,
    no_hp,
    role: "nasabah",
  });

  if (profileError) {
    res.status(500).json({
      success: false,
      message: "Akun dibuat tapi gagal membuat profil: " + profileError.message,
      data: {},
    });
    return;
  }

  res.status(201).json({
    success: true,
    message: "Registrasi berhasil. Silakan login.",
    data: { user: { id: authData.user.id, email, nama, no_hp } },
  });
}

// Login dan mendapatkan JWT token
export async function login(req: Request, res: Response): Promise<void> {
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
    email,
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

  // Ambil data profil user
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  res.json({
    success: true,
    message: "Login berhasil",
    data: {
      token: data.session.access_token,
      user: profile ?? { id: data.user.id, email: data.user.email },
    },
  });
}

// Mendapatkan profil user yang sedang login
export async function getMe(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    res.status(404).json({
      success: false,
      message: "Profil tidak ditemukan",
      data: {},
    });
    return;
  }

  res.json({
    success: true,
    message: "Data profil berhasil diambil",
    data: { profile },
  });
}

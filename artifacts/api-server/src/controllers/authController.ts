import { type Request, type Response } from "express";
import { supabase, supabaseAdmin } from "../config/supabase";
import { logger } from "../lib/logger";

const VALID_ROLES = ["cs", "teller"];

function buildUserProfile(supabaseUser: any, dbProfile: any) {
  const meta = supabaseUser?.user_metadata ?? {};
  const appMeta = supabaseUser?.app_metadata ?? {};
  return {
    id: supabaseUser?.id,
    email: supabaseUser?.email,
    nama: dbProfile?.nama ?? meta?.nama ?? "Pengguna",
    no_hp: dbProfile?.no_hp ?? meta?.no_hp ?? null,
    role: dbProfile?.role ?? appMeta?.role ?? meta?.role ?? "cs",
    onesignal_player_id: dbProfile?.onesignal_player_id ?? null,
    created_at: dbProfile?.created_at ?? supabaseUser?.created_at,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { nama, email, password, no_hp, role } = req.body;

  if (!nama || !email || !password || !no_hp) {
    res.status(400).json({
      success: false,
      message: "Nama lengkap, email, no HP, dan password wajib diisi",
      data: {},
    });
    return;
  }

  const assignedRole: string = VALID_ROLES.includes(role) ? role : "cs";

  const ROLE_DOMAIN: Record<string, string> = { cs: "@cs.com", teller: "@teller.com" };
  const requiredDomain = ROLE_DOMAIN[assignedRole];
  if (!email.toLowerCase().endsWith(requiredDomain)) {
    res.status(400).json({
      success: false,
      message: `Jabatan ${assignedRole.toUpperCase()} hanya boleh menggunakan email dengan domain ${requiredDomain}`,
      data: {},
    });
    return;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama, no_hp, role: assignedRole },
    app_metadata: { role: assignedRole },
  });

  if (authError || !authData.user) {
    res.status(400).json({
      success: false,
      message: authError?.message ?? "Gagal mendaftarkan akun",
      data: {},
    });
    return;
  }

  await supabaseAdmin.from("profiles").insert({
    id: authData.user.id,
    nama,
    no_hp,
    role: assignedRole,
  });

  res.status(201).json({
    success: true,
    message: `Registrasi berhasil sebagai ${assignedRole.toUpperCase()}. Silakan login.`,
    data: { user: { id: authData.user.id, email, nama, no_hp, role: assignedRole } },
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: "Email dan password wajib diisi", data: {} });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    // Log error detail dari Supabase untuk debugging
    logger.warn({
      loginEmail : email,
      supabaseError: error?.message,
      supabaseCode : error?.status,
    }, "Login gagal — detail error Supabase");

    res.status(401).json({
      success: false,
      message: "Email atau password salah",
      debug  : process.env.NODE_ENV !== "production" ? error?.message : undefined,
      data   : {},
    });
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  const userProfile = buildUserProfile(data.user, profile);

  res.json({
    success: true,
    message: "Login berhasil",
    data: { token: data.session.access_token, user: userProfile },
  });
}

// ================================================================
// POST /api/auth/admin/reset-password
// Hanya admin (service key) yang bisa memanggil ini via curl
// Ganti password staf yang lupa password
// ================================================================
export async function adminResetPassword(req: Request, res: Response): Promise<void> {
  const { email, password_baru } = req.body;

  // Validasi secret header — harus cocok dengan SESSION_SECRET
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.SESSION_SECRET) {
    res.status(403).json({ success: false, message: "Akses ditolak", data: {} });
    return;
  }

  if (!email || !password_baru) {
    res.status(400).json({ success: false, message: "email dan password_baru wajib diisi", data: {} });
    return;
  }
  if ((password_baru as string).length < 8) {
    res.status(400).json({ success: false, message: "Password minimal 8 karakter", data: {} });
    return;
  }

  // Cari user berdasarkan email
  const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
  const target = userList?.users?.find((u: any) => u.email?.toLowerCase() === (email as string).toLowerCase());

  if (!target) {
    res.status(404).json({ success: false, message: `Akun ${email} tidak ditemukan`, data: {} });
    return;
  }

  // Update password via admin API (tidak perlu tahu password lama)
  const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
    password: password_baru as string,
  });

  if (error) {
    logger.error({ error: error.message }, "Gagal reset password");
    res.status(500).json({ success: false, message: error.message, data: {} });
    return;
  }

  logger.info({ email, resetBy: "admin" }, "Password berhasil direset");
  res.json({
    success: true,
    message: `Password untuk ${email} berhasil diubah. Silakan login dengan password baru.`,
    data: { email },
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const supabaseUser = (req as any).user;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", supabaseUser.id)
    .single();

  const userProfile = buildUserProfile(supabaseUser, profile);

  res.json({
    success: true,
    message: "Data profil berhasil diambil",
    data: { profile: userProfile },
  });
}

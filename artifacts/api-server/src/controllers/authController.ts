import { type Request, type Response } from "express";
import { supabase, supabaseAdmin } from "../config/supabase";

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
    res.status(401).json({ success: false, message: "Email atau password salah", data: {} });
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

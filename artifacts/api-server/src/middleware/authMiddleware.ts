import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Token tidak ditemukan", data: {} });
    return;
  }

  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ success: false, message: "Token tidak valid atau kadaluarsa", data: {} });
    return;
  }

  (req as any).user = user;
  (req as any).token = token;
  next();
}

export async function tellerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await authMiddleware(req, res, async () => {
    const user = (req as any).user;

    // Cek dari tabel profiles dulu
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role =
      profile?.role ??
      user.app_metadata?.role ??
      user.user_metadata?.role;

    if (role !== "teller") {
      res.status(403).json({
        success: false,
        message: "Akses ditolak. Hanya teller yang diizinkan",
        data: {},
      });
      return;
    }

    next();
  });
}

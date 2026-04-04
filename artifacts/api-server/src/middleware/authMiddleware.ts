import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";

async function resolveUser(req: Request, res: Response): Promise<any | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Token tidak ditemukan", data: {} });
    return null;
  }
  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ success: false, message: "Token tidak valid atau kadaluarsa", data: {} });
    return null;
  }
  (req as any).user = user;
  (req as any).token = token;
  return user;
}

async function resolveRole(req: Request, user: any): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, nama")
    .eq("id", user.id)
    .single();
  const role = profile?.role ?? user.app_metadata?.role ?? user.user_metadata?.role ?? "";
  (req as any).userRole = role;
  (req as any).userNama = profile?.nama ?? user.email ?? "—";
  return role;
}

export async function authMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req, res);
  if (user) next();
}

export async function tellerMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req, res);
  if (!user) return;
  const role = await resolveRole(req, user);
  if (role !== "teller") {
    res.status(403).json({ success: false, message: "Akses ditolak. Hanya Teller yang diizinkan", data: {} });
    return;
  }
  next();
}

export async function csMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req, res);
  if (!user) return;
  const role = await resolveRole(req, user);
  if (role !== "cs") {
    res.status(403).json({ success: false, message: "Akses ditolak. Hanya CS yang diizinkan", data: {} });
    return;
  }
  next();
}

export async function anyStaffMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req, res);
  if (!user) return;
  const role = await resolveRole(req, user);
  if (!["teller", "cs"].includes(role)) {
    res.status(403).json({ success: false, message: "Akses ditolak. Login sebagai Teller atau CS", data: {} });
    return;
  }
  next();
}

export async function adminMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req, res);
  if (!user) return;
  const role = await resolveRole(req, user);
  if (role !== "admin") {
    res.status(403).json({ success: false, message: "Akses ditolak. Hanya Admin yang diizinkan", data: {} });
    return;
  }
  next();
}

export async function nasabahMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req, res);
  if (!user) return;
  const role = user.app_metadata?.role ?? user.user_metadata?.role ?? "";
  if (role !== "nasabah") {
    res.status(403).json({
      success: false,
      message: "Akses ditolak. Endpoint ini hanya untuk pengguna aplikasi mobile",
      data: {},
    });
    return;
  }
  next();
}

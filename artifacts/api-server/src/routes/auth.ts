import { Router, type IRouter } from "express";
import { register, login, getMe, adminResetPassword } from "../controllers/authController";
import { authMiddleware } from "../middleware/authMiddleware";

const router: IRouter = Router();

// POST /api/auth/register - Daftarkan staf baru
router.post("/register", register);

// POST /api/auth/login - Login dan dapatkan token
router.post("/login", login);

// GET /api/auth/me - Ambil profil user yang sedang login
router.get("/me", authMiddleware, getMe);

// POST /api/auth/admin/reset-password - Reset password staf (butuh x-admin-secret header)
router.post("/admin/reset-password", adminResetPassword);

export default router;

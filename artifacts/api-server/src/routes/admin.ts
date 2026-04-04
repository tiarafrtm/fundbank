import { Router, type IRouter } from "express";
import {
  getAdminStatistik,
  listAdminCabang,
  createAdminCabang,
  updateAdminCabang,
  listAdminStaff,
  createAdminStaff,
  updateAdminStaff,
  resetPasswordAdminStaff,
  deleteAdminStaff,
  getLaporan,
  getStaffMonitor,
  bootstrapAdmin,
} from "../controllers/adminController";
import { adminMiddleware } from "../middleware/authMiddleware";

const router: IRouter = Router();

// Bootstrap — tidak perlu adminMiddleware, pakai SESSION_SECRET header
router.post("/bootstrap", bootstrapAdmin);

// Semua route di bawah butuh adminMiddleware
router.get("/statistik",                    adminMiddleware, getAdminStatistik);
router.get("/cabang",                        adminMiddleware, listAdminCabang);
router.post("/cabang",                       adminMiddleware, createAdminCabang);
router.put("/cabang/:id",                    adminMiddleware, updateAdminCabang);
router.get("/staff",                         adminMiddleware, listAdminStaff);
router.post("/staff",                        adminMiddleware, createAdminStaff);
router.put("/staff/:id",                     adminMiddleware, updateAdminStaff);
router.post("/staff/:id/reset-password",     adminMiddleware, resetPasswordAdminStaff);
router.delete("/staff/:id",                  adminMiddleware, deleteAdminStaff);
router.get("/staff/:id/monitor",             adminMiddleware, getStaffMonitor);
router.get("/laporan",                       adminMiddleware, getLaporan);

export default router;

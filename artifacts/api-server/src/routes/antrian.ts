import { Router, type IRouter } from "express";
import {
  ambilAntrian,
  statusAntrian,
  listAntrian,
  panggilAntrian,
  selesaiAntrian,
  batalAntrian,
  restoreAntrian,
  getStatistik,
} from "../controllers/antrianController";
import {
  authMiddleware,
  anyStaffMiddleware,
} from "../middleware/authMiddleware";

const router: IRouter = Router();

router.get("/statistik",        anyStaffMiddleware, getStatistik);
router.post("/ambil",           anyStaffMiddleware, ambilAntrian);
router.get("/status",           authMiddleware,     statusAntrian);
router.get("/list",             anyStaffMiddleware, listAntrian);
router.put("/panggil",          anyStaffMiddleware, panggilAntrian);    // Fix: CS juga bisa panggil
router.put("/selesai/:id",      anyStaffMiddleware, selesaiAntrian);    // Fix: CS juga bisa selesai
router.put("/batal/:id",        anyStaffMiddleware, batalAntrian);
router.put("/restore/:id",      anyStaffMiddleware, restoreAntrian);    // Baru: undo skip 60 detik

export default router;

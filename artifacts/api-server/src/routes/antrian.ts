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
  setLoket,
} from "../controllers/antrianController";
import { listCabang } from "../controllers/cabangController";
import {
  authMiddleware,
  anyStaffMiddleware,
} from "../middleware/authMiddleware";

const router: IRouter = Router();

router.get("/statistik",        anyStaffMiddleware, getStatistik);
router.post("/ambil",           anyStaffMiddleware, ambilAntrian);
router.get("/status",           authMiddleware,     statusAntrian);
router.get("/list",             anyStaffMiddleware, listAntrian);
router.put("/panggil",          anyStaffMiddleware, panggilAntrian);
router.put("/selesai/:id",      anyStaffMiddleware, selesaiAntrian);
router.put("/batal/:id",        anyStaffMiddleware, batalAntrian);
router.put("/restore/:id",      anyStaffMiddleware, restoreAntrian);
router.put("/loket",            anyStaffMiddleware, setLoket);
router.get("/cabang",           anyStaffMiddleware, listCabang);  // Daftar cabang untuk staff

export default router;

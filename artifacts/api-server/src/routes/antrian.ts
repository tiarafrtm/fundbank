import { Router, type IRouter } from "express";
import {
  ambilAntrian,
  statusAntrian,
  listAntrian,
  panggilAntrian,
  selesaiAntrian,
  batalAntrian,
  getStatistik,
} from "../controllers/antrianController";
import {
  authMiddleware,
  tellerMiddleware,
  anyStaffMiddleware,
} from "../middleware/authMiddleware";

const router: IRouter = Router();

router.get("/statistik",     anyStaffMiddleware, getStatistik);
router.post("/ambil",        anyStaffMiddleware, ambilAntrian);
router.get("/status",        authMiddleware,     statusAntrian);
router.get("/list",          anyStaffMiddleware, listAntrian);
router.put("/panggil",       tellerMiddleware,   panggilAntrian);
router.put("/selesai/:id",   tellerMiddleware,   selesaiAntrian);
router.put("/batal/:id",     anyStaffMiddleware, batalAntrian);

export default router;

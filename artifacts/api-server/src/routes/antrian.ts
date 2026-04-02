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
} from "../middleware/authMiddleware";

const router: IRouter = Router();

router.get("/statistik",     tellerMiddleware, getStatistik);
router.post("/ambil",        authMiddleware,   ambilAntrian);
router.get("/status",        authMiddleware,   statusAntrian);
router.get("/list",          tellerMiddleware, listAntrian);
router.put("/panggil",       tellerMiddleware, panggilAntrian);
router.put("/selesai/:id",   tellerMiddleware, selesaiAntrian);
router.put("/batal/:id",     tellerMiddleware, batalAntrian);

export default router;

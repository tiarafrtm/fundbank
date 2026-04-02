import { Router, type IRouter } from "express";
import {
  ambilAntrian,
  statusAntrian,
  listAntrian,
  panggilAntrian,
  selesaiAntrian,
  batalAntrian,
} from "../controllers/antrianController";
import {
  authMiddleware,
  tellerMiddleware,
} from "../middleware/authMiddleware";

const router: IRouter = Router();

// POST /api/antrian/ambil - Nasabah ambil nomor antrian
router.post("/ambil", authMiddleware, ambilAntrian);

// GET /api/antrian/status - Nasabah cek posisi antrian mereka
router.get("/status", authMiddleware, statusAntrian);

// GET /api/antrian/list - Teller lihat semua antrian yang menunggu
router.get("/list", tellerMiddleware, listAntrian);

// PUT /api/antrian/panggil - Teller panggil nomor berikutnya (auto notif)
router.put("/panggil", tellerMiddleware, panggilAntrian);

// PUT /api/antrian/selesai/:id - Teller tandai antrian selesai
router.put("/selesai/:id", tellerMiddleware, selesaiAntrian);

// DELETE /api/antrian/batal/:id - Nasabah batalkan antrian mereka
router.delete("/batal/:id", authMiddleware, batalAntrian);

export default router;

import { Router, type IRouter } from "express";
import {
  daftar,
  masuk,
  getSaya,
  ambilAntrianMobile,
  statusAntrianMobile,
  batalAntrianMobile,
  riwayatAntrianMobile,
  tiketAntrian,
  listCabangMobile,
} from "../controllers/mobileController";
import { nasabahMiddleware } from "../middleware/authMiddleware";

const router: IRouter = Router();

// Auth nasabah (tidak perlu token)
router.post("/daftar", daftar);
router.post("/masuk",  masuk);

// Cabang publik — tidak perlu login (untuk dropdown pilih cabang saat ambil antrian)
router.get("/cabang", listCabangMobile);

// Endpoint yang butuh login nasabah
router.get("/saya",                   nasabahMiddleware, getSaya);
router.post("/antrian/ambil",         nasabahMiddleware, ambilAntrianMobile);
router.get("/antrian/status",         nasabahMiddleware, statusAntrianMobile);
router.get("/antrian/riwayat",        nasabahMiddleware, riwayatAntrianMobile);
router.delete("/antrian/:id",         nasabahMiddleware, batalAntrianMobile);
router.get("/antrian/tiket/:id",      nasabahMiddleware, tiketAntrian);

export default router;

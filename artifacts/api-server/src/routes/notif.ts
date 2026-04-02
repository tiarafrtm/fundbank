import { Router, type IRouter } from "express";
import {
  testPushNotif,
  testWhatsApp,
  statusNotif,
  getWaQR,
  disconnectWa,
  pairingCode,
} from "../controllers/notifController";
import { tellerMiddleware, anyStaffMiddleware } from "../middleware/authMiddleware";

const router: IRouter = Router();

// Bisa diakses Teller DAN CS
router.get("/status",           anyStaffMiddleware, statusNotif);
router.post("/test-push",       anyStaffMiddleware, testPushNotif);
router.post("/test-wa",         anyStaffMiddleware, testWhatsApp);

// Khusus Teller (manajemen koneksi WhatsApp)
router.get("/wa/qr",            tellerMiddleware, getWaQR);
router.post("/wa/disconnect",   tellerMiddleware, disconnectWa);
router.post("/wa/pairing-code", tellerMiddleware, pairingCode);

export default router;

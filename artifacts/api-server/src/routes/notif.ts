import { Router, type IRouter } from "express";
import {
  testPushNotif,
  testWhatsApp,
  statusNotif,
} from "../controllers/notifController";
import { tellerMiddleware } from "../middleware/authMiddleware";

const router: IRouter = Router();

// GET /api/notif/status - Cek status koneksi notifikasi
router.get("/status", tellerMiddleware, statusNotif);

// POST /api/notif/test-push - Uji push notification (khusus teller)
router.post("/test-push", tellerMiddleware, testPushNotif);

// POST /api/notif/test-wa - Uji pesan WhatsApp (khusus teller)
router.post("/test-wa", tellerMiddleware, testWhatsApp);

export default router;

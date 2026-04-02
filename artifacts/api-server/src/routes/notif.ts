import { Router, type IRouter } from "express";
import {
  testPushNotif,
  testWhatsApp,
  statusNotif,
  getWaQR,
  disconnectWa,
  pairingCode,
} from "../controllers/notifController";
import { tellerMiddleware } from "../middleware/authMiddleware";

const router: IRouter = Router();

router.get("/status",           tellerMiddleware, statusNotif);
router.get("/wa/qr",            tellerMiddleware, getWaQR);
router.post("/wa/disconnect",   tellerMiddleware, disconnectWa);
router.post("/wa/pairing-code", tellerMiddleware, pairingCode);
router.post("/test-push",       tellerMiddleware, testPushNotif);
router.post("/test-wa",         tellerMiddleware, testWhatsApp);

export default router;

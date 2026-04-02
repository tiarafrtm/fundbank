import { Router, type IRouter } from "express";
import {
  testPushNotif,
  testWhatsApp,
  statusNotif,
  getWaQR,
  disconnectWa,
} from "../controllers/notifController";
import { tellerMiddleware } from "../middleware/authMiddleware";

const router: IRouter = Router();

router.get("/status",        tellerMiddleware, statusNotif);
router.get("/wa/qr",         tellerMiddleware, getWaQR);
router.post("/wa/disconnect", tellerMiddleware, disconnectWa);
router.post("/test-push",    tellerMiddleware, testPushNotif);
router.post("/test-wa",      tellerMiddleware, testWhatsApp);

export default router;

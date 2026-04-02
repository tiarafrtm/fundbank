import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import antrianRouter from "./antrian";
import notifRouter from "./notif";

const router: IRouter = Router();

// Health check
router.use(healthRouter);

// Auth routes: /api/auth/*
router.use("/auth", authRouter);

// Antrian routes: /api/antrian/*
router.use("/antrian", antrianRouter);

// Notif routes: /api/notif/*
router.use("/notif", notifRouter);

export default router;

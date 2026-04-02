import { type Request, type Response } from "express";
import { sendPushNotification } from "../services/onesignalService";
import {
  sendWhatsAppMessage,
  isWhatsAppConnected,
  getWhatsAppQR,
  disconnectWhatsApp,
} from "../services/waService";

export async function testPushNotif(req: Request, res: Response): Promise<void> {
  const { player_id, nomor_antrian, title, body } = req.body;

  if (!player_id) {
    res.status(400).json({ success: false, message: "player_id wajib diisi", data: {} });
    return;
  }

  const nomorForNotif = nomor_antrian ?? 0;
  const berhasil = await sendPushNotification(player_id, Number(nomorForNotif));

  res.json({
    success: berhasil,
    message: berhasil ? "Push notification berhasil dikirim" : "Gagal mengirim push notification",
    data: {},
  });
}

export async function testWhatsApp(req: Request, res: Response): Promise<void> {
  const { no_hp, pesan, phone, message } = req.body;
  const targetPhone = no_hp ?? phone;
  const targetPesan = pesan ?? message;

  if (!targetPhone || !targetPesan) {
    res.status(400).json({ success: false, message: "Nomor HP dan pesan wajib diisi", data: {} });
    return;
  }

  const berhasil = await sendWhatsAppMessage(targetPhone, targetPesan);

  res.json({
    success: berhasil,
    message: berhasil
      ? "Pesan WhatsApp berhasil dikirim"
      : "Gagal mengirim pesan WhatsApp (pastikan WhatsApp sudah terkoneksi)",
    data: {},
  });
}

export async function statusNotif(req: Request, res: Response): Promise<void> {
  const connected = isWhatsAppConnected();
  const qr = getWhatsAppQR();

  res.json({
    success: true,
    message: "Status notifikasi",
    data: {
      whatsapp_connected: connected,
      whatsapp_qr: connected ? null : qr,
      onesignal_configured: !!process.env.ONESIGNAL_APP_ID && !!process.env.ONESIGNAL_API_KEY,
    },
  });
}

export async function getWaQR(req: Request, res: Response): Promise<void> {
  const connected = isWhatsAppConnected();
  if (connected) {
    res.json({ success: true, data: { connected: true, qr: null } });
    return;
  }
  const qr = getWhatsAppQR();
  res.json({
    success: true,
    data: { connected: false, qr },
  });
}

export async function disconnectWa(req: Request, res: Response): Promise<void> {
  await disconnectWhatsApp();
  res.json({ success: true, message: "WhatsApp disconnected, QR baru akan muncul segera" });
}

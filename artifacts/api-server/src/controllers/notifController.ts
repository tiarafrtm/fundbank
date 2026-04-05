import { type Request, type Response } from "express";
import { sendPushNotification } from "../services/onesignalService";
import {
  sendWhatsAppMessage,
  isWhatsAppConnected,
  getWhatsAppQR,
  getWhatsAppStatus,
  disconnectWhatsApp,
  requestPairingCode,
} from "../services/waService";

export async function testPushNotif(req: Request, res: Response): Promise<void> {
  const { player_id, nomor_antrian } = req.body;

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
  const waStatus = getWhatsAppStatus();

  res.json({
    success: true,
    message: "Status notifikasi",
    data: {
      whatsapp_connected: connected,
      whatsapp_qr: connected ? null : qr,
      whatsapp_status: waStatus.status,
      whatsapp_error: waStatus.error,
      onesignal_configured: !!process.env.ONESIGNAL_APP_ID && !!process.env.ONESIGNAL_API_KEY,
    },
  });
}

export async function getWaQR(req: Request, res: Response): Promise<void> {
  const connected = isWhatsAppConnected();
  if (connected) {
    res.json({ success: true, data: { connected: true, qr: null, status: "connected", error: null } });
    return;
  }
  const qr = getWhatsAppQR();
  const waStatus = getWhatsAppStatus();
  res.json({
    success: true,
    data: {
      connected: false,
      qr,
      status: waStatus.status,
      error: waStatus.error,
    },
  });
}

export async function disconnectWa(req: Request, res: Response): Promise<void> {
  await disconnectWhatsApp();
  res.json({ success: true, message: "WhatsApp disconnected, QR baru akan muncul segera" });
}

export async function pairingCode(req: Request, res: Response): Promise<void> {
  const { phone_number } = req.body;
  if (!phone_number) {
    res.status(400).json({ success: false, message: "phone_number wajib diisi (contoh: 628123456789)", data: {} });
    return;
  }
  try {
    const code = await requestPairingCode(phone_number.replace(/\D/g, ""));
    res.json({ success: true, message: "Pairing code berhasil dibuat", data: { code } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membuat pairing code: ${err?.message}`, data: {} });
  }
}

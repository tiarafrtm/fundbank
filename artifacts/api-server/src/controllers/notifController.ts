import { type Request, type Response } from "express";
import { sendPushNotification } from "../services/onesignalService";
import { sendWhatsAppMessage, isWhatsAppConnected } from "../services/waService";

// Endpoint untuk menguji push notification (khusus teller)
export async function testPushNotif(
  req: Request,
  res: Response,
): Promise<void> {
  const { player_id, nomor_antrian } = req.body;

  if (!player_id || !nomor_antrian) {
    res.status(400).json({
      success: false,
      message: "player_id dan nomor_antrian wajib diisi",
      data: {},
    });
    return;
  }

  const berhasil = await sendPushNotification(player_id, Number(nomor_antrian));

  res.json({
    success: berhasil,
    message: berhasil
      ? "Push notification berhasil dikirim"
      : "Gagal mengirim push notification",
    data: {},
  });
}

// Endpoint untuk menguji pesan WhatsApp (khusus teller)
export async function testWhatsApp(
  req: Request,
  res: Response,
): Promise<void> {
  const { no_hp, pesan } = req.body;

  if (!no_hp || !pesan) {
    res.status(400).json({
      success: false,
      message: "no_hp dan pesan wajib diisi",
      data: {},
    });
    return;
  }

  const berhasil = await sendWhatsAppMessage(no_hp, pesan);

  res.json({
    success: berhasil,
    message: berhasil
      ? "Pesan WhatsApp berhasil dikirim"
      : "Gagal mengirim pesan WhatsApp (pastikan WhatsApp sudah terkoneksi)",
    data: {},
  });
}

// Mengecek status koneksi notifikasi
export async function statusNotif(
  req: Request,
  res: Response,
): Promise<void> {
  res.json({
    success: true,
    message: "Status notifikasi",
    data: {
      whatsapp_connected: isWhatsAppConnected(),
      onesignal_configured:
        !!process.env.ONESIGNAL_APP_ID && !!process.env.ONESIGNAL_API_KEY,
    },
  });
}

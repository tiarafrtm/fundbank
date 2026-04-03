import { onesignalConfig } from "../config/onesignal";
import { logger } from "../lib/logger";

// Tipe notifikasi
type NotifTipe = "normal" | "skip";

// Mengirim push notification ke nasabah via OneSignal
// tipe "normal" → segera bersiap dipanggil
// tipe "skip"   → antrian dilewati, tampilkan modal di Android
export async function sendPushNotification(
  playerId: string,
  nomorAntrian: number,
  tipe: NotifTipe = "normal",
): Promise<boolean> {
  try {
    const isSkip = tipe === "skip";

    const payload = {
      app_id: onesignalConfig.appId,
      include_player_ids: [playerId],

      headings: {
        en: isSkip ? "Antrian Anda Dilewati" : "Segera Bersiap!",
        id: isSkip ? "Antrian Anda Dilewati" : "Segera Bersiap!",
      },
      contents: {
        en: isSkip
          ? `Nomor antrian ${nomorAntrian} telah dilewati. Segera datang ke loket jika ingin dilayani.`
          : `Antrian Anda nomor ${nomorAntrian} akan segera dipanggil. Silakan menuju ruang tunggu.`,
        id: isSkip
          ? `Nomor antrian ${nomorAntrian} telah dilewati. Segera datang ke loket jika ingin dilayani.`
          : `Antrian Anda nomor ${nomorAntrian} akan segera dipanggil. Silakan menuju ruang tunggu.`,
      },

      // Data tambahan — ditangkap Android di notificationOpenedHandler
      // Android membaca "tipe" untuk menampilkan modal yang sesuai
      data: {
        tipe,                        // "normal" atau "skip"
        nomor_antrian: nomorAntrian, // nomor antrian yang bersangkutan
      },

      // Push langsung — jangan batching
      priority: 10,
      ttl: 60, // detik — notif kadaluarsa setelah 1 menit (relevansi antrian)
    };

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${onesignalConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as any;

    if (!response.ok) {
      logger.error({ result }, "Gagal mengirim push notification OneSignal");
      return false;
    }

    logger.info({ playerId, nomorAntrian, tipe }, "Push notification berhasil dikirim");
    return true;
  } catch (error) {
    logger.error({ error }, "Error saat mengirim push notification");
    return false;
  }
}

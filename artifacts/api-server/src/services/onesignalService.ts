import { onesignalConfig } from "../config/onesignal";
import { logger } from "../lib/logger";

// Mengirim push notification ke nasabah via OneSignal
export async function sendPushNotification(
  playerId: string,
  nomorAntrian: number,
): Promise<boolean> {
  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${onesignalConfig.apiKey}`,
      },
      body: JSON.stringify({
        app_id: onesignalConfig.appId,
        include_player_ids: [playerId],
        headings: { en: "Segera Bersiap!", id: "Segera Bersiap!" },
        contents: {
          en: `Antrian Anda nomor ${nomorAntrian} akan segera dipanggil. Silakan menuju ruang tunggu.`,
          id: `Antrian Anda nomor ${nomorAntrian} akan segera dipanggil. Silakan menuju ruang tunggu.`,
        },
      }),
    });

    const result = (await response.json()) as any;

    if (!response.ok) {
      logger.error({ result }, "Gagal mengirim push notification OneSignal");
      return false;
    }

    logger.info(
      { playerId, nomorAntrian },
      "Push notification berhasil dikirim",
    );
    return true;
  } catch (error) {
    logger.error({ error }, "Error saat mengirim push notification");
    return false;
  }
}

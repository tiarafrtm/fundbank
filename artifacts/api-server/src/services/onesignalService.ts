import { onesignalConfig } from "../config/onesignal";
import { logger } from "../lib/logger";

// Tipe notifikasi
// "normal"    → nasabah bersiap (dalam 3 posisi ke depan)
// "dipanggil" → giliran nasabah sekarang! segera ke loket
// "skip"      → antrian nasabah dilewati → tampilkan modal di Android
export type NotifTipe = "normal" | "dipanggil" | "skip";

export async function sendPushNotification(
  playerId: string,
  nomorAntrian: number,
  tipe: NotifTipe = "normal",
  layanan?: string,                    // untuk pesan "dipanggil" yang lebih spesifik
  loketNumber?: number | null,         // nomor loket — dikirim ke Android via additional data
): Promise<boolean> {
  try {
    const layananLabel = layanan === "CS" ? "Customer Service" : (layanan ?? "Loket");
    const loketLabel   = loketNumber != null ? `Loket ${loketNumber}` : "loket";

    const config: Record<NotifTipe, { heading: string; content: string }> = {
      normal: {
        heading : "Segera Bersiap!",
        content : `Antrian Anda nomor ${nomorAntrian} akan segera dipanggil. Silakan menuju ruang tunggu.`,
      },
      dipanggil: {
        heading : "🔔 Giliran Anda Sekarang!",
        content : `Nomor antrian ${nomorAntrian} dipanggil ke ${loketLabel}. Segera menuju ${layananLabel}!`,
      },
      skip: {
        heading : "Antrian Anda Dilewati",
        content : `Nomor antrian ${nomorAntrian} telah dilewati. Segera datang ke loket jika ingin dilayani.`,
      },
    };

    const { heading, content } = config[tipe];

    const payload = {
      app_id            : onesignalConfig.appId,
      include_player_ids: [playerId],
      headings          : { en: heading, id: heading },
      contents          : { en: content, id: content },
      // Data tambahan — dibaca Android untuk tampilkan UI yang sesuai
      data: {
        tipe,
        nomor_antrian : nomorAntrian,
        layanan       : layanan     ?? null,
        loket_number  : loketNumber ?? null,
      },
      priority : 10,
      ttl      : tipe === "dipanggil" ? 120 : 60,  // "dipanggil" lebih lama: 2 menit
    };

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method  : "POST",
      headers : {
        "Content-Type" : "application/json",
        Authorization  : `Key ${onesignalConfig.apiKey}`,
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

import { supabaseAdmin } from "../config/supabase";
import { sendPushNotification } from "./onesignalService";
import { sendWhatsAppMessage } from "./waService";
import { logger } from "../lib/logger";

// Mengambil nomor antrian berikutnya untuk layanan tertentu
export async function getNomorAntrian(layanan: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("antrian")
    .select("nomor_antrian")
    .eq("layanan", layanan)
    .gte(
      "created_at",
      new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    ) // Hanya antrian hari ini
    .order("nomor_antrian", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return 1; // Mulai dari nomor 1 jika belum ada antrian hari ini
  }

  return data[0].nomor_antrian + 1;
}

// Mengambil daftar antrian yang masih menunggu
export async function getAntrianMenunggu() {
  const { data, error } = await supabaseAdmin
    .from("antrian")
    .select(
      `
      *,
      profiles (nama, no_hp)
    `,
    )
    .eq("status", "menunggu")
    .order("nomor_antrian", { ascending: true });

  if (error) throw error;
  return data;
}

// Memanggil nomor antrian berikutnya dan mengirim notifikasi ke antrian ke-3
export async function panggilBerikutnya(layanan?: string): Promise<{
  antrian: any;
  notifDikirim: boolean;
}> {
  // Ambil antrian pertama yang masih menunggu
  let query = supabaseAdmin
    .from("antrian")
    .select(
      `
      *,
      profiles (nama, no_hp, onesignal_player_id)
    `,
    )
    .eq("status", "menunggu")
    .order("nomor_antrian", { ascending: true })
    .limit(1);

  if (layanan) {
    query = query.eq("layanan", layanan);
  }

  const { data: antrian, error } = await query;

  if (error) throw error;
  if (!antrian || antrian.length === 0) {
    throw new Error("Tidak ada antrian yang menunggu");
  }

  const currentAntrian = antrian[0];

  // Update status antrian menjadi 'dipanggil'
  const { error: updateError } = await supabaseAdmin
    .from("antrian")
    .update({ status: "dipanggil", called_at: new Date().toISOString() })
    .eq("id", currentAntrian.id);

  if (updateError) throw updateError;

  // Cari nasabah yang posisinya 3 nomor di depan (perlu diberitahu bersiap)
  let notifQuery = supabaseAdmin
    .from("antrian")
    .select(
      `
      *,
      profiles (nama, no_hp, onesignal_player_id)
    `,
    )
    .eq("status", "menunggu")
    .eq("notif_sent", false)
    .order("nomor_antrian", { ascending: true })
    .limit(1);

  if (layanan) {
    notifQuery = notifQuery.eq("layanan", layanan);
  }

  const { data: antrianNotif } = await notifQuery;

  let notifDikirim = false;

  // Kirim notifikasi jika ditemukan nasabah yang perlu diberitahu (posisi ke-3 dari yang dipanggil)
  if (antrianNotif && antrianNotif.length > 0) {
    const targetNotif = antrianNotif[0];
    const selisihNomor =
      targetNotif.nomor_antrian - currentAntrian.nomor_antrian;

    // Kirim notifikasi jika nasabah berada 3 posisi di depan antrian yang dipanggil
    if (selisihNomor <= 3) {
      const profile = targetNotif.profiles as any;
      const nomorAntrian = targetNotif.nomor_antrian;

      // Kirim push notification via OneSignal
      if (profile?.onesignal_player_id) {
        await sendPushNotification(profile.onesignal_player_id, nomorAntrian);
      }

      // Kirim pesan WhatsApp via Baileys
      if (profile?.no_hp) {
        const pesanWA = `Halo ${profile.nama}, antrian Anda nomor *${nomorAntrian}* akan segera dipanggil. Mohon segera menuju ruang tunggu bank. Terima kasih.`;
        await sendWhatsAppMessage(profile.no_hp, pesanWA);
      }

      // Tandai bahwa notifikasi sudah dikirim
      await supabaseAdmin
        .from("antrian")
        .update({ notif_sent: true })
        .eq("id", targetNotif.id);

      notifDikirim = true;
      logger.info(
        { targetNomor: nomorAntrian },
        "Notifikasi bersiap berhasil dikirim",
      );
    }
  }

  return { antrian: currentAntrian, notifDikirim };
}

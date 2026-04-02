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
    )
    .order("nomor_antrian", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return 1;
  }

  return data[0].nomor_antrian + 1;
}

// Mengambil daftar antrian yang masih menunggu
export async function getAntrianMenunggu() {
  const { data, error } = await supabaseAdmin
    .from("antrian")
    .select(`*, profiles (nama, no_hp)`)
    .eq("status", "menunggu")
    .order("nomor_antrian", { ascending: true });

  if (error) throw error;
  return data;
}

// Memanggil nomor antrian berikutnya — dengan atomic update untuk mencegah race condition
export async function panggilBerikutnya(layanan?: string): Promise<{
  antrian: any;
  notifDikirim: boolean;
}> {
  // STEP 1: Ambil antrian pertama yang masih menunggu
  let query = supabaseAdmin
    .from("antrian")
    .select(`*, profiles (nama, no_hp, onesignal_player_id)`)
    .eq("status", "menunggu")
    .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    .order("nomor_antrian", { ascending: true })
    .limit(1);

  if (layanan) query = query.eq("layanan", layanan);

  const { data: antrianList, error } = await query;
  if (error) throw error;
  if (!antrianList || antrianList.length === 0) {
    throw new Error("Tidak ada antrian yang menunggu");
  }

  const currentAntrian = antrianList[0];

  // STEP 2: Atomic update — hanya update kalau status MASIH 'menunggu'
  // Ini mencegah dua loket mengambil nomor yang sama (race condition)
  const { data: updateResult, error: updateError } = await supabaseAdmin
    .from("antrian")
    .update({ status: "dipanggil", called_at: new Date().toISOString() })
    .eq("id", currentAntrian.id)
    .eq("status", "menunggu") // ← Kunci: hanya sukses kalau masih menunggu
    .select();

  if (updateError) throw updateError;

  // Kalau tidak ada baris yang terupdate → antrian sudah diambil loket lain
  if (!updateResult || updateResult.length === 0) {
    throw new Error("Antrian sudah dipanggil oleh loket lain. Silakan coba lagi.");
  }

  logger.info(
    { nomor: currentAntrian.nomor_antrian, layanan, id: currentAntrian.id },
    "Antrian berhasil dipanggil (atomic update OK)",
  );

  // STEP 3: Cari nasabah yang perlu notifikasi (3 posisi ke depan)
  let notifQuery = supabaseAdmin
    .from("antrian")
    .select(`*, profiles (nama, no_hp, onesignal_player_id)`)
    .eq("status", "menunggu")
    .eq("notif_sent", false)
    .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    .order("nomor_antrian", { ascending: true })
    .limit(1);

  if (layanan) notifQuery = notifQuery.eq("layanan", layanan);

  const { data: antrianNotif } = await notifQuery;

  let notifDikirim = false;

  if (antrianNotif && antrianNotif.length > 0) {
    const targetNotif = antrianNotif[0];
    const selisihNomor = targetNotif.nomor_antrian - currentAntrian.nomor_antrian;

    if (selisihNomor <= 3) {
      // Verifikasi ulang status masih 'menunggu' sebelum kirim notif
      // Mencegah WA ke nasabah yang sudah diskip/selesai
      const { data: freshCheck } = await supabaseAdmin
        .from("antrian")
        .select("status, notif_sent")
        .eq("id", targetNotif.id)
        .single();

      if (freshCheck?.status === "menunggu" && !freshCheck?.notif_sent) {
        const profile = targetNotif.profiles as any;
        const nomorAntrian = targetNotif.nomor_antrian;

        // Kirim push notification via OneSignal
        if (profile?.onesignal_player_id) {
          try {
            await sendPushNotification(profile.onesignal_player_id, nomorAntrian);
          } catch (e: any) {
            logger.warn({ error: e?.message }, "OneSignal push gagal, lanjut WA");
          }
        }

        // Kirim pesan WhatsApp via Baileys
        const noHp = profile?.no_hp ?? targetNotif.no_hp_nasabah;
        const namaNasabah = profile?.nama ?? targetNotif.nama_nasabah ?? "Nasabah";
        const layananDisplay =
          targetNotif.layanan === "CS" ? "Customer Service" : targetNotif.layanan;

        if (noHp) {
          const pesanWA =
            `Halo, ${namaNasabah}!\n\n` +
            `Kami informasikan bahwa nomor antrian Anda *${nomorAntrian}* ` +
            `di layanan ${layananDisplay} akan segera dipanggil.\n\n` +
            `Harap segera menuju loket yang tersedia.\n\n` +
            `Klik untuk lihat status antrian:\n` +
            `bankantrian://queue?ticket=${nomorAntrian}\n\n` +
            `— Bank ABC, Cabang Sudirman`;

          try {
            await sendWhatsAppMessage(noHp, pesanWA);
            logger.info({ noHp, nomorAntrian }, "WA notifikasi terkirim");
          } catch (e: any) {
            logger.error({ noHp, error: e?.message }, "WA notifikasi GAGAL");
          }
        }

        // Tandai notif sudah dikirim — cegah kirim ulang
        await supabaseAdmin
          .from("antrian")
          .update({ notif_sent: true })
          .eq("id", targetNotif.id)
          .eq("status", "menunggu"); // Hanya update kalau masih menunggu

        notifDikirim = true;
      }
    }
  }

  return { antrian: currentAntrian, notifDikirim };
}

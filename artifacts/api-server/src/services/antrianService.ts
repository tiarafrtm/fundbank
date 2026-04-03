import { supabaseAdmin } from "../config/supabase";
import { sendPushNotification } from "./onesignalService";
import { sendWhatsAppMessage } from "./waService";
import { logger } from "../lib/logger";

// Mutex sederhana per-layanan untuk mencegah race condition nomor antrian
const layananLocks: Map<string, Promise<void>> = new Map();

async function withLayananLock<T>(layanan: string, fn: () => Promise<T>): Promise<T> {
  const prev = layananLocks.get(layanan) ?? Promise.resolve();
  let resolveLock!: () => void;
  const lock = new Promise<void>((resolve) => { resolveLock = resolve; });
  layananLocks.set(layanan, prev.then(() => lock));
  await prev;
  try {
    return await fn();
  } finally {
    resolveLock();
    // Bersihkan map kalau tidak ada yang menunggu lagi
    if (layananLocks.get(layanan) === lock) layananLocks.delete(layanan);
  }
}

// Mengambil nomor antrian berikutnya — atomic via lock per layanan
export async function getNomorAntrian(layanan: string): Promise<number> {
  return withLayananLock(layanan, async () => {
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
  });
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

  // STEP 1B: Auto-selesaikan antrian "dipanggil" sebelumnya untuk layanan ini
  // Skenario: teller langsung tekan "Panggil Berikutnya" tanpa klik "Selesai"
  // → nasabah sebelumnya harus dianggap selesai agar statusnya tidak stuck
  let autoSelesaiQuery = supabaseAdmin
    .from("antrian")
    .update({ status: "selesai", finished_at: new Date().toISOString() })
    .eq("status", "dipanggil")
    .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  if (layanan) autoSelesaiQuery = autoSelesaiQuery.eq("layanan", layanan);

  const { data: autoSelesai, error: autoSelesaiError } = await autoSelesaiQuery.select("id, nomor_antrian");
  if (autoSelesaiError) {
    logger.warn({ error: autoSelesaiError.message }, "Gagal auto-selesai antrian sebelumnya (non-fatal)");
  } else if (autoSelesai && autoSelesai.length > 0) {
    logger.info(
      { nomorList: autoSelesai.map((a: any) => a.nomor_antrian) },
      "Auto-selesai antrian sebelumnya sebelum panggil berikutnya",
    );
  }

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

  // STEP 2B: Kirim push "Giliran Anda!" ke nasabah yang BARU DIPANGGIL
  const profileDipanggil = currentAntrian.profiles as any;
  if (profileDipanggil?.onesignal_player_id) {
    try {
      await sendPushNotification(
        profileDipanggil.onesignal_player_id,
        currentAntrian.nomor_antrian,
        "dipanggil",
        currentAntrian.layanan,
      );
      logger.info({ nomor: currentAntrian.nomor_antrian }, "Push 'dipanggil' terkirim ke nasabah");
    } catch (e: any) {
      logger.warn({ error: e?.message }, "Push 'dipanggil' gagal (non-fatal)");
    }
  }

  // STEP 3: Cari SEMUA nasabah dalam 3 posisi ke depan yang belum dapat notif
  let notifQuery = supabaseAdmin
    .from("antrian")
    .select(`*, profiles (nama, no_hp, onesignal_player_id)`)
    .eq("status", "menunggu")
    .eq("notif_sent", false)
    .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    .gt("nomor_antrian", currentAntrian.nomor_antrian)                          // hanya yang di belakang
    .lte("nomor_antrian", currentAntrian.nomor_antrian + 3)                     // max 3 posisi ke depan
    .order("nomor_antrian", { ascending: true });

  if (layanan) notifQuery = notifQuery.eq("layanan", layanan);

  const { data: antrianNotif } = await notifQuery;

  let notifDikirim = false;

  // Kirim notif ke SEMUA nasabah dalam jarak 3 posisi
  if (antrianNotif && antrianNotif.length > 0) {
    for (const targetNotif of antrianNotif) {
      // Verifikasi ulang status masih 'menunggu' sebelum kirim notif
      const { data: freshCheck } = await supabaseAdmin
        .from("antrian")
        .select("status, notif_sent")
        .eq("id", targetNotif.id)
        .single();

      if (freshCheck?.status !== "menunggu" || freshCheck?.notif_sent) continue;

      const profile      = targetNotif.profiles as any;
      const nomorAntrian = targetNotif.nomor_antrian;
      const posisiDiDepan = nomorAntrian - currentAntrian.nomor_antrian; // 1, 2, atau 3

      // Kirim push notification via OneSignal
      if (profile?.onesignal_player_id) {
        try {
          await sendPushNotification(profile.onesignal_player_id, nomorAntrian);
        } catch (e: any) {
          logger.warn({ error: e?.message }, "OneSignal push gagal, lanjut WA");
        }
      }

      // Kirim pesan WhatsApp via Baileys
      const noHp          = profile?.no_hp ?? targetNotif.no_hp_nasabah;
      const namaNasabah   = profile?.nama  ?? targetNotif.nama_nasabah ?? "Nasabah";
      const layananDisplay = targetNotif.layanan === "CS" ? "Customer Service" : targetNotif.layanan;

      if (noHp) {
        // Pesan berbeda berdasarkan jarak antrian
        const keteranganPosisi = posisiDiDepan === 1
          ? `Anda adalah antrian *berikutnya*! Harap segera menuju loket.`
          : `Anda berada di posisi ke-*${posisiDiDepan}* dari depan. Harap bersiap-siap.`;

        const pesanWA =
          `Halo, ${namaNasabah}!\n\n` +
          `Nomor antrian Anda: *${nomorAntrian}* (${layananDisplay})\n` +
          `${keteranganPosisi}\n\n` +
          `Klik untuk lihat status antrian:\n` +
          `https://antrianbank.site/tiket?ticket=${nomorAntrian}\n\n` +
          `— FUND BANK, Cabang Sudirman`;

        try {
          await sendWhatsAppMessage(noHp, pesanWA);
          logger.info({ noHp, nomorAntrian, posisiDiDepan }, "WA notifikasi terkirim");
        } catch (e: any) {
          logger.error({ noHp, error: e?.message }, "WA notifikasi GAGAL");
        }
      }

      // Tandai notif sudah dikirim — cegah kirim ulang
      await supabaseAdmin
        .from("antrian")
        .update({ notif_sent: true })
        .eq("id", targetNotif.id)
        .eq("status", "menunggu");

      notifDikirim = true;
      logger.info({ nomorAntrian, posisiDiDepan }, `Notif dikirim ke antrian ${nomorAntrian} (posisi ${posisiDiDepan} dari depan)`);
    }
  }

  return { antrian: currentAntrian, notifDikirim };
}

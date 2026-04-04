import { supabaseAdmin } from "../config/supabase";
import { sendPushNotification } from "./onesignalService";
import { sendWhatsAppMessage } from "./waService";
import { logger } from "../lib/logger";

// Mutex sederhana per-layanan PER-CABANG untuk mencegah race condition nomor antrian
const layananLocks: Map<string, Promise<void>> = new Map();

async function withLayananLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = layananLocks.get(key) ?? Promise.resolve();
  let resolveLock!: () => void;
  const lock = new Promise<void>((resolve) => { resolveLock = resolve; });
  layananLocks.set(key, prev.then(() => lock));
  await prev;
  try {
    return await fn();
  } finally {
    resolveLock();
    if (layananLocks.get(key) === lock) layananLocks.delete(key);
  }
}

// Mengambil nomor antrian berikutnya — atomic via lock per layanan+cabang
export async function getNomorAntrian(layanan: string, cabangId?: number | null): Promise<number> {
  const lockKey = cabangId != null ? `${layanan}:${cabangId}` : layanan;
  return withLayananLock(lockKey, async () => {
    let query = supabaseAdmin
      .from("antrian")
      .select("nomor_antrian")
      .eq("layanan", layanan)
      .gte(
        "created_at",
        new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      )
      .order("nomor_antrian", { ascending: false })
      .limit(1);

    if (cabangId != null) query = query.eq("cabang_id", cabangId);

    const { data, error } = await query;

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
// loketNumber: nomor loket teller/CS yang sedang memanggil (opsional, untuk multi-loket)
// cabangId: ID cabang yang dilayani (filter agar tidak lintas cabang)
export async function panggilBerikutnya(
  layanan?: string,
  loketNumber?: number | null,
  cabangId?: number | null,
): Promise<{
  antrian: any;
  notifDikirim: boolean;
}> {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  // Ambil nama cabang untuk pesan WA yang dinamis
  let cabangNama = "FUND BANK";
  if (cabangId != null) {
    const { data: cabangData } = await supabaseAdmin
      .from("cabang")
      .select("nama")
      .eq("id", cabangId)
      .maybeSingle();
    if (cabangData?.nama) cabangNama = `FUND BANK, ${cabangData.nama}`;
  }

  // STEP 1: Ambil antrian pertama yang masih menunggu
  let query = supabaseAdmin
    .from("antrian")
    .select(`*, profiles (nama, no_hp, onesignal_player_id)`)
    .eq("status", "menunggu")
    .gte("created_at", todayStart)
    .order("nomor_antrian", { ascending: true })
    .limit(1);

  if (layanan)   query = query.eq("layanan", layanan);
  if (cabangId != null) query = query.eq("cabang_id", cabangId);

  const { data: antrianList, error } = await query;
  if (error) throw error;
  if (!antrianList || antrianList.length === 0) {
    throw new Error("Tidak ada antrian yang menunggu");
  }

  const currentAntrian = antrianList[0];

  // STEP 1B: Auto-selesaikan antrian "dipanggil" sebelumnya untuk LOKET INI saja
  let autoSelesaiQuery = supabaseAdmin
    .from("antrian")
    .update({ status: "selesai", finished_at: new Date().toISOString() })
    .eq("status", "dipanggil")
    .gte("created_at", todayStart);

  if (layanan) autoSelesaiQuery = autoSelesaiQuery.eq("layanan", layanan);
  if (cabangId != null) autoSelesaiQuery = autoSelesaiQuery.eq("cabang_id", cabangId);
  if (loketNumber != null) {
    autoSelesaiQuery = autoSelesaiQuery.eq("loket_number", loketNumber);
  }

  const { data: autoSelesai, error: autoSelesaiError } = await autoSelesaiQuery.select("id, nomor_antrian");
  if (autoSelesaiError) {
    logger.warn({ error: autoSelesaiError.message }, "Gagal auto-selesai antrian sebelumnya (non-fatal)");
  } else if (autoSelesai && autoSelesai.length > 0) {
    logger.info(
      { nomorList: autoSelesai.map((a: any) => a.nomor_antrian), loket: loketNumber },
      "Auto-selesai antrian sebelumnya sebelum panggil berikutnya",
    );
  }

  // STEP 2: Atomic update — hanya update kalau status MASIH 'menunggu'
  const updatePayload: Record<string, any> = {
    status: "dipanggil",
    called_at: new Date().toISOString(),
  };
  if (loketNumber != null) updatePayload.loket_number = loketNumber;

  const { data: updateResult, error: updateError } = await supabaseAdmin
    .from("antrian")
    .update(updatePayload)
    .eq("id", currentAntrian.id)
    .eq("status", "menunggu")
    .select();

  if (updateError) throw updateError;

  if (!updateResult || updateResult.length === 0) {
    throw new Error("Antrian sudah dipanggil oleh loket lain. Silakan coba lagi.");
  }

  logger.info(
    { nomor: currentAntrian.nomor_antrian, layanan, cabangId, id: currentAntrian.id },
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
    .gt("nomor_antrian", currentAntrian.nomor_antrian)
    .lte("nomor_antrian", currentAntrian.nomor_antrian + 3)
    .order("nomor_antrian", { ascending: true });

  if (layanan) notifQuery = notifQuery.eq("layanan", layanan);
  if (cabangId != null) notifQuery = notifQuery.eq("cabang_id", cabangId);

  const { data: antrianNotif } = await notifQuery;

  let notifDikirim = false;

  if (antrianNotif && antrianNotif.length > 0) {
    for (const targetNotif of antrianNotif) {
      const { data: freshCheck } = await supabaseAdmin
        .from("antrian")
        .select("status, notif_sent")
        .eq("id", targetNotif.id)
        .single();

      if (freshCheck?.status !== "menunggu" || freshCheck?.notif_sent) continue;

      const profile      = targetNotif.profiles as any;
      const nomorAntrian = targetNotif.nomor_antrian;
      const posisiDiDepan = nomorAntrian - currentAntrian.nomor_antrian;

      if (profile?.onesignal_player_id) {
        try {
          await sendPushNotification(profile.onesignal_player_id, nomorAntrian);
        } catch (e: any) {
          logger.warn({ error: e?.message }, "OneSignal push gagal, lanjut WA");
        }
      }

      const noHp          = profile?.no_hp ?? targetNotif.no_hp_nasabah;
      const namaNasabah   = profile?.nama  ?? targetNotif.nama_nasabah ?? "Nasabah";
      const layananDisplay = targetNotif.layanan === "CS" ? "Customer Service" : targetNotif.layanan;

      if (noHp) {
        const keteranganPosisi = posisiDiDepan === 1
          ? `Anda adalah antrian *berikutnya*! Harap segera menuju loket.`
          : `Anda berada di posisi ke-*${posisiDiDepan}* dari depan. Harap bersiap-siap.`;

        const pesanWA =
          `Halo, ${namaNasabah}!\n\n` +
          `Nomor antrian Anda: *${nomorAntrian}* (${layananDisplay})\n` +
          `${keteranganPosisi}\n\n` +
          `Klik untuk lihat status antrian:\n` +
          `https://antrianbank.site/tiket?ticket=${nomorAntrian}\n\n` +
          `— ${cabangNama}`;

        try {
          await sendWhatsAppMessage(noHp, pesanWA);
          logger.info({ noHp, nomorAntrian, posisiDiDepan }, "WA notifikasi terkirim");
        } catch (e: any) {
          logger.error({ noHp, error: e?.message }, "WA notifikasi GAGAL");
        }
      }

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

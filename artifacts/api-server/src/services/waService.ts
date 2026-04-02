import { logger } from "../lib/logger";

// WhatsApp socket instance (di-set setelah koneksi berhasil)
let waSocket: any = null;
let waConnected = false;

// Inisialisasi koneksi WhatsApp menggunakan Baileys
export async function initWhatsApp(): Promise<void> {
  try {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } =
      await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");
    const path = await import("path");
    const qrcode = await import("qrcode-terminal").catch(() => null);

    // Simpan sesi auth agar tidak perlu scan QR ulang setiap restart
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(process.cwd(), "wa_session"),
    );

    const sock = makeWASocket({
      auth: state,
      // Tidak menggunakan printQRInTerminal (deprecated di v7), handle manual
    });

    // Simpan credentials saat ada perubahan
    sock.ev.on("creds.update", saveCreds);

    // Pantau status koneksi dan tampilkan QR code jika belum login
    sock.ev.on(
      "connection.update",
      async (update: {
        connection?: string;
        lastDisconnect?: { error?: unknown };
        qr?: string;
      }) => {
        const { connection, lastDisconnect, qr } = update;

        // Tampilkan QR code di terminal untuk di-scan dengan WhatsApp
        if (qr) {
          logger.info("=== SCAN QR CODE INI DENGAN WHATSAPP ===");
          if (qrcode) {
            // Gunakan qrcode-terminal jika tersedia
            qrcode.default.generate(qr, { small: true }, (qrText: string) => {
              console.log(qrText);
            });
          } else {
            // Fallback: tampilkan teks QR mentah
            console.log("QR CODE:", qr);
          }
          logger.info("========================================");
        }

        if (connection === "close") {
          const boom = lastDisconnect?.error as InstanceType<typeof Boom>;
          const shouldReconnect =
            boom?.output?.statusCode !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            logger.info("WhatsApp terputus, mencoba reconnect dalam 5 detik...");
            waConnected = false;
            waSocket = null;
            setTimeout(() => initWhatsApp(), 5000);
          } else {
            logger.warn(
              "WhatsApp logout. Hapus folder wa_session dan restart server untuk scan ulang QR",
            );
            waConnected = false;
            waSocket = null;
          }
        } else if (connection === "open") {
          logger.info("WhatsApp berhasil terhubung!");
          waSocket = sock;
          waConnected = true;
        }
      },
    );
  } catch (error) {
    logger.error({ error }, "Gagal menginisialisasi WhatsApp");
  }
}

// Mengirim pesan WhatsApp ke nomor tertentu
export async function sendWhatsAppMessage(
  noHp: string,
  pesan: string,
): Promise<boolean> {
  if (!waConnected || !waSocket) {
    logger.warn("WhatsApp belum terhubung, pesan tidak bisa dikirim");
    return false;
  }

  try {
    // Format nomor: ubah awalan 0 menjadi 62 (kode negara Indonesia)
    const nomor = noHp.startsWith("0")
      ? "62" + noHp.slice(1) + "@s.whatsapp.net"
      : noHp.replace(/\D/g, "") + "@s.whatsapp.net";

    await waSocket.sendMessage(nomor, { text: pesan });
    logger.info({ nomor }, "Pesan WhatsApp berhasil dikirim");
    return true;
  } catch (error) {
    logger.error({ error }, "Gagal mengirim pesan WhatsApp");
    return false;
  }
}

// Cek status koneksi WhatsApp
export function isWhatsAppConnected(): boolean {
  return waConnected;
}

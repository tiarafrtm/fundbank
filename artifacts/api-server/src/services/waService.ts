import { logger } from "../lib/logger";

let waSocket: any = null;
let waConnected = false;
let currentQRDataUrl: string | null = null;

export async function initWhatsApp(): Promise<void> {
  try {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } =
      await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");
    const path = await import("path");
    const QRCode = await import("qrcode");

    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(process.cwd(), "wa_session"),
    );

    const sock = makeWASocket({ auth: state });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on(
      "connection.update",
      async (update: {
        connection?: string;
        lastDisconnect?: { error?: unknown };
        qr?: string;
      }) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          logger.info("QR Code baru diterima, generate data URL...");
          try {
            currentQRDataUrl = await QRCode.default.toDataURL(qr, {
              width: 280,
              margin: 2,
              color: { dark: "#111827", light: "#ffffff" },
            });
            logger.info("QR Code siap di-scan melalui dashboard");
          } catch (err) {
            logger.error({ err }, "Gagal generate QR data URL");
          }
        }

        if (connection === "close") {
          const boom = lastDisconnect?.error as InstanceType<typeof Boom>;
          const shouldReconnect =
            boom?.output?.statusCode !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            logger.info("WhatsApp terputus, reconnect dalam 5 detik...");
            waConnected = false;
            waSocket = null;
            setTimeout(() => initWhatsApp(), 5000);
          } else {
            logger.warn("WhatsApp logout. Hapus wa_session dan restart untuk scan ulang.");
            waConnected = false;
            waSocket = null;
            currentQRDataUrl = null;
          }
        } else if (connection === "open") {
          logger.info("WhatsApp berhasil terhubung!");
          waSocket = sock;
          waConnected = true;
          currentQRDataUrl = null;
        }
      },
    );
  } catch (error) {
    logger.error({ error }, "Gagal menginisialisasi WhatsApp");
  }
}

export async function sendWhatsAppMessage(
  noHp: string,
  pesan: string,
): Promise<boolean> {
  if (!waConnected || !waSocket) {
    logger.warn("WhatsApp belum terhubung");
    return false;
  }
  try {
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

export async function disconnectWhatsApp(): Promise<void> {
  try {
    if (waSocket) await waSocket.logout();
  } catch {}
  waSocket = null;
  waConnected = false;
  currentQRDataUrl = null;

  // Hapus sesi agar QR baru muncul saat koneksi ulang
  const fs = await import("fs");
  const path = await import("path");
  const sessionDir = path.join(process.cwd(), "wa_session");
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }

  setTimeout(() => initWhatsApp(), 1000);
}

export function isWhatsAppConnected(): boolean {
  return waConnected;
}

export function getWhatsAppQR(): string | null {
  return currentQRDataUrl;
}

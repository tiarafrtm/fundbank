import { logger } from "../lib/logger";

let sockInstance: any = null;       // socket aktif (sebelum/sesudah connect)
let waSocket: any = null;           // hanya saat connection === 'open'
let waConnected = false;
let currentQRDataUrl: string | null = null;
let connectionStatus: "connecting" | "qr_ready" | "connected" | "error" = "connecting";
let connectionError: string | null = null;
let reconnectDelay = 5000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export async function initWhatsApp(): Promise<void> {
  try {
    connectionStatus = "connecting";
    connectionError = null;

    const {
      default: makeWASocket,
      DisconnectReason,
      useMultiFileAuthState,
      Browsers,
      fetchLatestBaileysVersion,
    } = await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");
    const path = await import("path");
    const QRCode = await import("qrcode");

    const sessionDir = process.env["WA_SESSION_PATH"] ?? path.join(process.cwd(), "wa_session");
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ version, isLatest }, "Versi WhatsApp Web digunakan");

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu("Dashboard Bank"),
      printQRInTerminal: false,
    });

    sockInstance = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info("QR Code diterima — generate data URL...");
        reconnectDelay = 5000;
        connectionStatus = "qr_ready";
        try {
          currentQRDataUrl = await QRCode.default.toDataURL(qr, {
            width: 280,
            margin: 2,
            color: { dark: "#111827", light: "#ffffff" },
          });
          logger.info("QR Code siap ditampilkan di dashboard");
        } catch (err) {
          logger.error({ err }, "Gagal generate QR data URL");
        }
      }

      if (connection === "close") {
        const boom = lastDisconnect?.error as InstanceType<typeof Boom>;
        const statusCode = boom?.output?.statusCode;
        waConnected = false;
        waSocket = null;
        sockInstance = null;

        if (statusCode === DisconnectReason.loggedOut) {
          logger.warn("WhatsApp logout — hapus wa_session untuk scan ulang.");
          currentQRDataUrl = null;
          connectionStatus = "error";
          connectionError = "Logged out dari WhatsApp. Klik Disconnect & Reset QR untuk scan ulang.";
          return;
        }

        // Exponential backoff: max 60 detik
        reconnectDelay = Math.min(reconnectDelay * 1.5, 60000);
        const delaySec = Math.round(reconnectDelay / 1000);

        if (statusCode === 405 || statusCode === 403) {
          connectionStatus = "error";
          connectionError = `WhatsApp menolak koneksi dari server ini (kode: ${statusCode}). Gunakan Kode Pairing di bawah, atau deploy ke server lain.`;
          logger.warn(`WhatsApp menolak koneksi (${statusCode}). Retry dalam ${delaySec} detik...`);
        } else {
          connectionStatus = "connecting";
          connectionError = null;
          logger.info(`WhatsApp terputus (${statusCode ?? "unknown"}), reconnect dalam ${delaySec} detik...`);
        }

        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => initWhatsApp(), reconnectDelay);

      } else if (connection === "open") {
        logger.info("WhatsApp berhasil terhubung!");
        waSocket = sock;
        waConnected = true;
        currentQRDataUrl = null;
        connectionStatus = "connected";
        connectionError = null;
        reconnectDelay = 5000;
      }
    });
  } catch (error: any) {
    logger.error({ error }, "Gagal menginisialisasi WhatsApp");
    connectionStatus = "error";
    connectionError = error?.message ?? "Terjadi kesalahan tidak diketahui";
    sockInstance = null;

    reconnectDelay = Math.min(reconnectDelay * 1.5, 60000);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => initWhatsApp(), reconnectDelay);
  }
}

export async function requestPairingCode(phoneNumber: string): Promise<string> {
  // Pairing code harus diminta sebelum koneksi terbuka, menggunakan sockInstance
  const s = sockInstance;
  if (!s) throw new Error("Socket WhatsApp belum siap. Tunggu beberapa detik lalu coba lagi.");

  // Sesuai docs: cek apakah credentials belum registered
  if (s.authState?.creds?.registered) {
    throw new Error("Akun sudah terdaftar / sudah login.");
  }

  const clean = phoneNumber.replace(/\D/g, "");
  logger.info({ clean }, "Meminta pairing code untuk nomor...");
  const code = await s.requestPairingCode(clean);
  logger.info({ code }, "Pairing code diterima dari WA");
  return code;
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
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { if (waSocket) await waSocket.logout(); } catch {}
  try { if (sockInstance) sockInstance.end(undefined); } catch {}

  sockInstance = null;
  waSocket = null;
  waConnected = false;
  currentQRDataUrl = null;
  connectionStatus = "connecting";
  connectionError = null;
  reconnectDelay = 5000;

  const fs = await import("fs");
  const path = await import("path");
  const sessionDir = process.env["WA_SESSION_PATH"] ?? path.join(process.cwd(), "wa_session");
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }

  reconnectTimer = setTimeout(() => initWhatsApp(), 1500);
}

export function isWhatsAppConnected(): boolean { return waConnected; }
export function getWhatsAppQR(): string | null { return currentQRDataUrl; }
export function getWhatsAppStatus(): { status: string; error: string | null } {
  return { status: connectionStatus, error: connectionError };
}

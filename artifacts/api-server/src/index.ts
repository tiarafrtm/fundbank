import app from "./app";
import { logger } from "./lib/logger";
import { initWhatsApp } from "./services/waService";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Inisialisasi koneksi WhatsApp saat server mulai
  // Scan QR code yang muncul di terminal untuk menghubungkan WhatsApp
  logger.info("Menginisialisasi koneksi WhatsApp...");
  await initWhatsApp();
});

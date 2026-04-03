import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===========================
// Static assets (CSS, JS, gambar)
// ===========================
app.use("/css", express.static(path.join(publicDir, "css")));
app.use("/js",  express.static(path.join(publicDir, "js")));

// ===========================
// Android App Links — harus bisa diakses di:
// https://antrianbank.site/.well-known/assetlinks.json
// send/express tidak serve dotdir secara default, jadi baca file manual
// ===========================
app.get("/.well-known/assetlinks.json", (_req, res) => {
  const filePath = path.join(publicDir, ".well-known", "assetlinks.json");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(content);
  } catch {
    res.status(404).json({ error: "assetlinks.json not found" });
  }
});

// ===========================
// API Routes — semua endpoint backend
// ===========================
app.use("/api", router);

// ===========================
// Web Pages — masing-masing halaman punya file HTML sendiri
// ===========================

// Redirect root ke halaman login
app.get("/", (_req, res) => res.redirect("/login"));

// Halaman login (juga register — dalam satu file)
app.get("/login", (_req, res) =>
  res.sendFile(path.join(publicDir, "login.html"))
);

// Dashboard Teller — tiga halaman, satu file HTML
// Navigasi antar halaman diurus oleh teller.js di sisi browser
app.get("/dashboard", (_req, res) =>
  res.sendFile(path.join(publicDir, "teller.html"))
);
app.get("/antrian", (_req, res) =>
  res.sendFile(path.join(publicDir, "teller.html"))
);
app.get("/notif", (_req, res) =>
  res.sendFile(path.join(publicDir, "teller.html"))
);

// Dashboard CS — semua halaman diarahkan ke cs.html, navigasi diurus cs.js
app.get("/cs",         (_req, res) => res.sendFile(path.join(publicDir, "cs.html")));
app.get("/cs/antrian", (_req, res) => res.sendFile(path.join(publicDir, "cs.html")));
app.get("/cs/notif",   (_req, res) => res.sendFile(path.join(publicDir, "cs.html")));
app.get("/cs/buat",    (_req, res) => res.sendFile(path.join(publicDir, "cs.html")));

// Halaman fallback untuk App Links — dibuka browser jika app belum terinstall
// URL: https://antrianbank.site/tiket?ticket=17
app.get("/tiket", (_req, res) => res.sendFile(path.join(publicDir, "tiket.html")));

export default app;

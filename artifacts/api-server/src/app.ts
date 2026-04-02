import express, { type Express } from "express";
import cors from "cors";
import path from "path";
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

// Dashboard CS — dua halaman, satu file HTML
// Navigasi antar halaman diurus oleh cs.js di sisi browser
app.get("/cs",      (_req, res) =>
  res.sendFile(path.join(publicDir, "cs.html"))
);
app.get("/cs/buat", (_req, res) =>
  res.sendFile(path.join(publicDir, "cs.html"))
);

export default app;

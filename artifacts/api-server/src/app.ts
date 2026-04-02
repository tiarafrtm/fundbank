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

// Static assets
app.use("/css", express.static(path.join(publicDir, "css")));
app.use("/js",  express.static(path.join(publicDir, "js")));

// API routes
app.use("/api", router);

// Web pages
const sendPage = (_req: express.Request, res: express.Response) =>
  res.sendFile(path.join(publicDir, "index.html"));

app.get("/",          (_req, res) => res.redirect("/login"));
app.get("/login",     sendPage);
app.get("/dashboard", sendPage);
app.get("/antrian",   sendPage);
app.get("/notif",     sendPage);

export default app;

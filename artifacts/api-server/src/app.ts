import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// serverless-http consegna il body come Buffer: express.json() lo salterebbe e ogni POST arriverebbe vuoto.
app.use((req, res, next) => {
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString("utf8");
    const contentType = String(req.headers["content-type"] ?? "");
    try {
      if (!raw) req.body = {};
      else if (contentType.includes("json")) req.body = JSON.parse(raw);
      else if (contentType.includes("urlencoded")) req.body = Object.fromEntries(new URLSearchParams(raw));
      else req.body = {};
    } catch {
      res.status(400).json({ error: "Body JSON non valido" });
      return;
    }
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/fiscale/api", router);

// Serve Chrome extension ZIP for easy download
app.get("/api/download/extension", (_req, res) => {
  const zipPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../extension/scontrini-extension.zip",
  );
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=\"scontrini-extension.zip\"");
  res.sendFile(zipPath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "Estensione non disponibile" });
    }
  });
});

export default app;

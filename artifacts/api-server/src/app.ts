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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

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

import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
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
  const zipPath = path.resolve(process.cwd(), "../../chrome-extension");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=\"scontrini-extension.zip\"");
  // Zip on the fly using archiver
  const { execSync } = require("child_process");
  try {
    const buf = execSync(`cd ${path.resolve(process.cwd(), "../..")} && zip -r - chrome-extension`, { maxBuffer: 10 * 1024 * 1024 });
    res.send(buf);
  } catch (e) {
    res.status(500).send("Errore generazione ZIP");
  }
});

export default app;

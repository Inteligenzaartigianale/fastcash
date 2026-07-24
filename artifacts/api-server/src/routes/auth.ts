import { Router, type IRouter } from "express";
import { loginWithSiampe } from "../lib/siampe-login.js";
import {
  setSession,
  getSession,
  clearSession,
  isSessionValid,
} from "../lib/session.js";
import { LoginBody, LoginResponse, GetAuthStatusResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger.js";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

// ── Async login job store ─────────────────────────────────────────────────────
// The SIAMPE login takes 30-60 s via Puppeteer, which exceeds the Replit proxy
// timeout (~30 s). We fire the login in the background and return a jobId that
// the frontend can poll every 2 s.

type LoginJobStatus = "pending" | "success" | "error";

interface LoginJob {
  status: LoginJobStatus;
  error?: string;
  result?: {
    ragioneSociale: string;
    partitaIva: string;
    codiceFiscale: string;
  };
  createdAt: Date;
}

const loginJobs = new Map<string, LoginJob>();

// Clean up jobs older than 10 minutes
function pruneOldJobs() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of loginJobs) {
    if (job.createdAt.getTime() < cutoff) loginJobs.delete(id);
  }
}

// ── POST /auth/login — starts login job, returns jobId immediately ────────────
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { codiceFiscale, password, pin } = parsed.data;
  pruneOldJobs();

  const jobId = randomUUID();
  const job: LoginJob = { status: "pending", createdAt: new Date() };
  loginJobs.set(jobId, job);

  req.log.info({ codiceFiscale, jobId }, "Starting async SIAMPE login job");

  // Fire and forget — do NOT await
  (async () => {
    try {
      const loginResult = await loginWithSiampe({ codiceFiscale, password, pin });

      setSession({
        cookies: loginResult.cookieHeader,
        ragioneSociale: loginResult.ragioneSociale,
        partitaIva: loginResult.partitaIva,
        codiceFiscale: loginResult.codiceFiscale,
        indirizzo: "",
        numeroCivico: "",
        cap: "",
        comune: "",
        provincia: "",
        defAliquotaIVA: "22",
        credentials: { codiceFiscale, password, pin },
        createdAt: new Date(),
      });

      job.status = "success";
      job.result = {
        ragioneSociale: loginResult.ragioneSociale,
        partitaIva: loginResult.partitaIva,
        codiceFiscale: loginResult.codiceFiscale,
      };
      logger.info({ jobId }, "Async login job completed successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      logger.error({ err, jobId }, "Async login job failed");
      job.status = "error";
      job.error = message;
    }
  })();

  res.json({ jobId });
});

// ── GET /auth/login/poll/:jobId — poll login job status ──────────────────────
router.get("/auth/login/poll/:jobId", (req, res): void => {
  const { jobId } = req.params;
  const job = loginJobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }

  if (job.status === "pending") {
    res.json({ status: "pending" });
    return;
  }

  if (job.status === "error") {
    // Return the error and clean up
    loginJobs.delete(jobId);
    const message = job.error ?? "Login failed";
    const isCredErr =
      message.toLowerCase().includes("credenziali") ||
      message.toLowerCase().includes("password") ||
      message.toLowerCase().includes("pin");

    res.status(isCredErr ? 401 : 500).json({
      status: "error",
      error: isCredErr ? "Credenziali non valide" : "Errore durante il login. Riprova tra qualche secondo.",
      details: message,
    });
    return;
  }

  // success
  loginJobs.delete(jobId);
  const result = LoginResponse.parse({
    success: true,
    ragioneSociale: job.result?.ragioneSociale ?? "",
    partitaIva: job.result?.partitaIva ?? "",
    codiceFiscale: job.result?.codiceFiscale,
  });
  res.json({ status: "success", ...result });
});

// ── GET /auth/status ──────────────────────────────────────────────────────────
router.get("/auth/status", async (req, res): Promise<void> => {
  const session = getSession();
  const authenticated = isSessionValid();

  const result = GetAuthStatusResponse.parse({
    authenticated,
    ragioneSociale: authenticated ? session?.ragioneSociale ?? null : null,
    partitaIva: authenticated ? session?.partitaIva ?? null : null,
    expiresAt: authenticated
      ? new Date(
          (session?.createdAt?.getTime() ?? 0) + 4 * 60 * 60 * 1000,
        ).toISOString()
      : null,
  });

  res.json(result);
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post("/auth/logout", async (req, res): Promise<void> => {
  clearSession();
  req.log.info("Session cleared");
  res.json({ success: true });
});

export default router;

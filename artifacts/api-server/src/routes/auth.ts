import { Router, type IRouter } from "express";
import { loginWithSiampe } from "../lib/siampe-login.js";
import { validateDcoCookies } from "./ae.js";
import {
  setSession,
  getSession,
  clearSession,
  isSessionValid,
} from "../lib/session.js";
import { LoginBody, LoginResponse, GetAuthStatusResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger.js";
import { fetchMeAndUpdateSession } from "./ae.js";
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

  const rawIdentifier = parsed.data.identificativo ?? parsed.data.codiceFiscale ?? "";
  const identificativo = normalizeIdentifier(rawIdentifier);
  if (!isValidIdentifier(identificativo)) {
    res.status(400).json({
      error: "Identificativo non valido",
      details: "Inserisci un codice fiscale di 16 caratteri oppure una Partita IVA di 11 cifre.",
    });
    return;
  }
  const { password, pin } = parsed.data;
  pruneOldJobs();

  const jobId = randomUUID();
  const job: LoginJob = { status: "pending", createdAt: new Date() };
  loginJobs.set(jobId, job);

  req.log.info({ identificativoTipo: identifierType(identificativo), jobId }, "Starting async ADE login job");

  // Fire and forget — do NOT await
  (async () => {
    try {
      const loginResult = await loginWithSiampe({ identificativo, password, pin });
      if (!(await validateDcoCookies(loginResult.cookieHeader))) {
        throw new Error("Login completato, ma la sessione del servizio DCO non è valida. Usa l'estensione Chrome per collegare i cookie ADE.");
      }

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
        credentials: { codiceFiscale: identificativo, password, pin },
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
    const lowerMessage = message.toLowerCase();
    const isCredErr =
      (lowerMessage.includes("credenziali") ||
        lowerMessage.includes("password") ||
        lowerMessage.includes("pin")) &&
      !lowerMessage.includes("dco") &&
      !lowerMessage.includes("non autorizzato") &&
      !lowerMessage.includes("servizio");
    const isDcoAuthorizationError =
      lowerMessage.includes("dco") ||
      lowerMessage.includes("non autorizzato") ||
      lowerMessage.includes("servizio documenti commerciali");

    res.status(isCredErr ? 401 : isDcoAuthorizationError ? 403 : 500).json({
      status: "error",
      error: isCredErr
        ? "Credenziali non valide"
        : isDcoAuthorizationError
          ? "Accesso ADE riuscito, ma il servizio DCO non è autorizzato"
          : "Errore durante il login. Riprova tra qualche secondo.",
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
  let authenticated = isSessionValid();

  // A locally stored session can be younger than four hours while ADE has
  // already invalidated its cookies.  The POS must never treat that state as
  // logged in, otherwise the user reaches the checkout and only then sees a
  // misleading DCO error.
  if (authenticated && session) {
    try {
      authenticated = await validateDcoCookies(session.cookies);
      if (!authenticated) clearSession();
    } catch (err) {
      req.log.warn({ err }, "Unable to validate ADE session status");
      authenticated = false;
    }
  }

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

// ── POST /auth/cookie — manual cookie paste (bypasses Puppeteer SSO) ─────────
// The user logs in on their real browser, copies cookie header from DevTools,
// and pastes it here. We store it directly in the session without Puppeteer.
router.post("/auth/cookie", async (req, res): Promise<void> => {
  const { cookieHeader, identificativo: rawIdentifier, codiceFiscale: legacyIdentifier } = req.body as {
    cookieHeader?: string;
    identificativo?: string;
    codiceFiscale?: string;
  };

  if (!cookieHeader || typeof cookieHeader !== "string" || cookieHeader.trim().length < 20) {
    res.status(400).json({ error: "Stringa cookie non valida o troppo corta" });
    return;
  }

  // CF is optional — /ae/me will populate it on first load
  const identificativo = normalizeIdentifier(rawIdentifier ?? legacyIdentifier ?? "");
  if (identificativo && !isValidIdentifier(identificativo)) {
    res.status(400).json({
      error: "Identificativo non valido",
      details: "Inserisci un codice fiscale di 16 caratteri oppure una Partita IVA di 11 cifre.",
    });
    return;
  }
  const normalizedCookies = cookieHeader.trim();

  if (!(await validateDcoCookies(normalizedCookies))) {
    res.status(401).json({
      error: "Cookie ADE non validi per il servizio DCO",
      details: "Apri il servizio Documenti Commerciali Online in Chrome, poi riconnetti l'estensione.",
    });
    return;
  }

  setSession({
    cookies: normalizedCookies,
    ragioneSociale: "",
    partitaIva: /^\d{11}$/.test(identificativo) ? identificativo : "",
    codiceFiscale: /^[A-Z0-9]{16}$/.test(identificativo) ? identificativo : "",
    indirizzo: "",
    numeroCivico: "",
    cap: "",
    comune: "",
    provincia: "",
    defAliquotaIVA: "22",
    credentials: { codiceFiscale: identificativo, password: "", pin: "" },
    createdAt: new Date(),
  });

  req.log.info({ identificativoTipo: identifierType(identificativo), cookieLen: cookieHeader.length }, "Manual ADE cookie session created");
  res.json({ success: true });

  // Popola i dati fiscali in background senza bloccare la conferma
  // dell'estensione: il suo stato "connesso" è quello mostrato nell'app.
  fetchMeAndUpdateSession(normalizedCookies).catch((err) => {
    logger.warn({ err }, "Background fetchMeAndUpdateSession failed (non-fatal)");
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post("/auth/logout", async (req, res): Promise<void> => {
  clearSession();
  req.log.info("Session cleared");
  res.json({ success: true });
});

export default router;

function normalizeIdentifier(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  return normalized.startsWith("IT") ? normalized.slice(2) : normalized;
}

function isValidIdentifier(value: string): boolean {
  return /^\d{11}$/.test(value) || /^[A-Z0-9]{16}$/.test(value);
}

function identifierType(value: string): "partita_iva" | "codice_fiscale" | "non_specificato" {
  if (/^\d{11}$/.test(value)) return "partita_iva";
  if (/^[A-Z0-9]{16}$/.test(value)) return "codice_fiscale";
  return "non_specificato";
}

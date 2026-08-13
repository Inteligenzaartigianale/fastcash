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
import { randomUUID, randomInt } from "node:crypto";
import { issueToken, clearAllTokens, clearToken } from "../lib/device-auth.js";

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
  const {
    cookieHeader,
    cookieNames,
    identificativo: rawIdentifier,
    codiceFiscale: legacyIdentifier,
  } = req.body as {
    cookieHeader?: string;
    cookieNames?: unknown;
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
    const names = Array.isArray(cookieNames)
      ? cookieNames.filter((name): name is string => typeof name === "string")
      : [];
    const dcoNames = names.filter((name) => name === "FATSC" || name === "JSESSIONID");
    res.status(401).json({
      error: "Cookie ADE non validi per il servizio DCO",
      details: dcoNames.length > 0
        ? `Cookie DCO rilevati: ${dcoNames.join(", ")}. Apri il servizio Documenti Commerciali Online in Chrome, poi riconnetti l'estensione.`
        : "Non sono stati rilevati cookie FATSC/JSESSIONID. Apri il servizio Documenti Commerciali Online in Chrome, poi riconnetti l'estensione.",
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
  clearAllTokens(); // invalidate all issued desktop/mobile tokens
  req.log.info("Session cleared — all device tokens revoked");
  res.json({ success: true });
});

// POST /auth/device-logout — mobile-only self-logout.
// Removes ONLY the calling device's token; leaves the ADE session intact
// so other devices and the desktop remain connected.
router.post("/auth/device-logout", (req, res): void => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    clearToken(token);
    req.log.info({ token: token.slice(0, 8) + "…" }, "Device token self-revoked (device-logout)");
  }
  res.json({ success: true });
});

// ── GET /auth/app-token — desktop gets its device token ───────────────────────
// The browser calls this after detecting an active ADE session.  The returned
// token must be sent as `Authorization: Bearer <token>` on all protected routes.
// Each call issues a new token; previous ones remain valid until logout.
router.get("/auth/app-token", (req, res): void => {
  if (!isSessionValid()) {
    res.status(401).json({ error: "Nessuna sessione ADE attiva" });
    return;
  }
  const token = issueToken("desktop");
  req.log.info({ token: token.slice(0, 8) + "…" }, "Desktop app token issued");
  res.json({ token });
});

// ── QR Session Transfer ───────────────────────────────────────────────────────
// Security model: single-user server with a global ADE session.
//
// The QR pairing uses a two-factor approach to prevent relay attacks:
//   1. Desktop calls /auth/qr/generate → receives { token, pin }.
//      The PIN is displayed on the desktop screen only; it is NOT embedded
//      in the QR code.
//   2. Mobile scans the QR → reads { server, token } from the code → then asks
//      the operator to type the 4-digit PIN shown on the desktop screen.
//   3. Mobile calls /auth/qr/consume with { token, pin }.
//      The server validates both values match and expire the pair.
//
// An attacker who can call the API can obtain { token, pin } from the generate
// response, but they would need physical access to the desktop screen to read
// the PIN if they only capture the QR image (e.g. from a photo).  Rate-limiting
// (max 5 active pairs at a time) further limits automated abuse.

const QR_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QR_MAX_ACTIVE = 5; // prevent token flooding

interface QrTokenEntry {
  pin: string;           // 4-digit string shown on desktop only, NOT in QR payload
  createdAt: Date;
  failedAttempts: number; // token is deleted after QR_MAX_PIN_ATTEMPTS wrong PINs
}

const qrTokens = new Map<string, QrTokenEntry>();

function pruneQrTokens() {
  const cutoff = Date.now() - QR_TOKEN_TTL_MS;
  for (const [tok, entry] of qrTokens) {
    if (entry.createdAt.getTime() < cutoff) qrTokens.delete(tok);
  }
}

const QR_MAX_PIN_ATTEMPTS = 3; // token deleted after this many wrong PINs

function randomPin(): string {
  // Cryptographically random 4-digit PIN (0000–9999), zero-padded.
  // Math.random() is intentionally avoided here — crypto.randomInt gives
  // uniform distribution with no modulo bias.
  return String(randomInt(10000)).padStart(4, "0");
}

// POST /auth/qr/generate — requires active ADE session, returns one-time {token, pin}.
// The PIN must be shown to the operator on the desktop screen; it is NOT included
// in the QR code itself, providing a second factor that only someone physically
// present at the desktop can supply.
router.post("/auth/qr/generate", (req, res): void => {
  if (!isSessionValid()) {
    res.status(401).json({ error: "Nessuna sessione attiva sul server" });
    return;
  }
  pruneQrTokens();
  if (qrTokens.size >= QR_MAX_ACTIVE) {
    res.status(429).json({ error: "Troppi codici QR attivi — attendi la scadenza o ricarica la pagina" });
    return;
  }
  const token = randomUUID();
  const pin = randomPin();
  qrTokens.set(token, { pin, createdAt: new Date(), failedAttempts: 0 });
  const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_MS).toISOString();
  req.log.info({ token: token.slice(0, 8) + "…" }, "QR session token generated");
  // pin is returned to the desktop UI only — the desktop must display it on screen.
  res.json({ token, pin, expiresAt });
});

// POST /auth/qr/consume — mobile sends { token, pin }; both must match.
router.post("/auth/qr/consume", (req, res): void => {
  const { token, pin } = req.body as { token?: string; pin?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token mancante" });
    return;
  }
  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN mancante o non valido (deve essere 4 cifre)" });
    return;
  }
  const entry = qrTokens.get(token);
  if (!entry) {
    res.status(404).json({ error: "Token non valido o scaduto" });
    return;
  }
  if (Date.now() - entry.createdAt.getTime() > QR_TOKEN_TTL_MS) {
    qrTokens.delete(token);
    res.status(410).json({ error: "Token scaduto — genera un nuovo QR" });
    return;
  }
  if (entry.pin !== pin) {
    entry.failedAttempts++;
    if (entry.failedAttempts >= QR_MAX_PIN_ATTEMPTS) {
      qrTokens.delete(token);
      req.log.warn({ token: token.slice(0, 8) + "…" }, "QR consume: max PIN attempts reached — token revoked");
      res.status(429).json({ error: "Troppi tentativi errati — genera un nuovo QR" });
    } else {
      const remaining = QR_MAX_PIN_ATTEMPTS - entry.failedAttempts;
      req.log.warn({ token: token.slice(0, 8) + "…", attempts: entry.failedAttempts }, "QR consume: wrong PIN");
      res.status(401).json({
        error: `PIN non corretto (${remaining} tentativ${remaining === 1 ? "o" : "i"} rimanent${remaining === 1 ? "e" : "i"})`,
      });
    }
    return;
  }
  if (!isSessionValid()) {
    qrTokens.delete(token);
    res.status(401).json({ error: "La sessione desktop non è più valida" });
    return;
  }
  qrTokens.delete(token); // one-time use
  const session = getSession()!;
  const deviceToken = issueToken("mobile"); // bound credential for this device
  req.log.info({ token: token.slice(0, 8) + "…" }, "QR session token consumed — mobile device token issued");
  res.json({
    success: true,
    ragioneSociale: session.ragioneSociale,
    partitaIva: session.partitaIva,
    deviceToken, // stored by the mobile app; sent as Authorization: Bearer on all calls
  });
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

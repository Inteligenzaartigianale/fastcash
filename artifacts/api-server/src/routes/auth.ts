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

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { codiceFiscale, password, pin } = parsed.data;

  try {
    req.log.info({ codiceFiscale }, "Starting SIAMPE login");
    const loginResult = await loginWithSiampe({ codiceFiscale, password, pin });

    setSession({
      cookies: loginResult.cookieHeader,
      ragioneSociale: loginResult.ragioneSociale,
      partitaIva: loginResult.partitaIva,
      codiceFiscale: loginResult.codiceFiscale,
      credentials: { codiceFiscale, password, pin },
      createdAt: new Date(),
    });

    const result = LoginResponse.parse({
      success: true,
      ragioneSociale: loginResult.ragioneSociale,
      partitaIva: loginResult.partitaIva,
      codiceFiscale: loginResult.codiceFiscale,
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    req.log.error({ err }, "SIAMPE login error");

    if (
      message.toLowerCase().includes("credenziali") ||
      message.toLowerCase().includes("password") ||
      message.toLowerCase().includes("pin")
    ) {
      res.status(401).json({ error: "Credenziali non valide" });
    } else {
      res.status(500).json({
        error: "Errore durante il login. Riprova tra qualche secondo.",
        details: message,
      });
    }
  }
});

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

router.post("/auth/logout", async (req, res): Promise<void> => {
  clearSession();
  req.log.info("Session cleared");
  res.json({ success: true });
});

export default router;

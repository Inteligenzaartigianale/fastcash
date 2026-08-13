/**
 * Device / app token store + Express middleware.
 *
 * All tokens — desktop "app tokens" and mobile "device tokens" — live here.
 * They are opaque UUIDs; validity is checked server-side.
 *
 * Lifecycle:
 *   - Desktop: token issued via GET /auth/app-token (ADE session required)
 *   - Mobile:  token issued via POST /auth/qr/consume (QR+PIN pairing required)
 *   - Both:    tokens are cleared on logout or when the ADE session expires
 *
 * Protected routes must call requireDeviceToken middleware.
 * Auth routes (/auth/*) and health remain unprotected.
 */

import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { isSessionValid } from "./session.js";

type TokenType = "desktop" | "mobile";

interface TokenEntry {
  type: TokenType;
  createdAt: Date;
}

const tokens = new Map<string, TokenEntry>();

// ── Token management ─────────────────────────────────────────────────────────

export function issueToken(type: TokenType): string {
  const token = randomUUID();
  tokens.set(token, { type, createdAt: new Date() });
  return token;
}

export function isValidToken(token: string): boolean {
  return tokens.has(token);
}

/** Called on logout or ADE session expiry to invalidate all issued tokens. */
export function clearAllTokens(): void {
  tokens.clear();
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Requires BOTH a valid ADE session AND a valid device/app token.
 * Token must be sent as `Authorization: Bearer <token>`.
 * Apply to all fiscal-operation routes (ae, catalog, documenti, chat).
 */
export function requireDeviceToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // ADE session is the outer gate
  if (!isSessionValid()) {
    clearAllTokens(); // lazy cleanup on session expiry
    res.status(401).json({
      error: "Sessione ADE scaduta. Riconnetti l'estensione Chrome o rinnova la sessione.",
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error:
        "Token dispositivo mancante. Accedi dall'app desktop o ripeti l'abbinamento QR.",
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!isValidToken(token)) {
    res.status(401).json({
      error: "Token dispositivo non valido o scaduto. Riesegui l'accesso.",
    });
    return;
  }

  next();
}

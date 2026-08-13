/**
 * Device / app token store + Express middleware.
 *
 * Tokens are persisted in PostgreSQL (table: device_tokens) so that
 * server restarts and production deploys do NOT invalidate mobile sessions.
 * Mobile devices stay paired without re-scanning the QR code.
 *
 * The in-memory Map is authoritative during the process lifetime;
 * the DB is written fire-and-forget on every change (non-fatal on failure).
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
import pg from "pg";
import type { Request, Response, NextFunction } from "express";
import { isSessionValid } from "./session.js";

const { Pool } = pg;

type TokenType = "desktop" | "mobile";

interface TokenEntry {
  type: TokenType;
  createdAt: Date;
  expiresAt: Date;
}

// ── DB pool ────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
});

// ── TTL ────────────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS: Record<TokenType, number> = {
  mobile:  30 * 24 * 60 * 60 * 1000, // 30 giorni
  desktop:  1 * 24 * 60 * 60 * 1000, // 1 giorno
};

// ── Ensure table exists ────────────────────────────────────────────────────────

pool.query(`
  CREATE TABLE IF NOT EXISTS device_tokens (
    token      TEXT PRIMARY KEY,
    type       TEXT NOT NULL DEFAULT 'mobile',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )
`).catch((err: unknown) => {
  console.error("[device-auth] Could not ensure device_tokens table:", err);
});

// ── In-memory cache ────────────────────────────────────────────────────────────

const tokens = new Map<string, TokenEntry>();

// ── Bootstrap: load valid tokens from DB on startup ───────────────────────────

pool.query<{ token: string; type: string; created_at: string; expires_at: string }>(
  "SELECT token, type, created_at, expires_at FROM device_tokens WHERE expires_at > NOW()"
).then((result) => {
  for (const r of result.rows) {
    tokens.set(r.token, {
      type:      r.type as TokenType,
      createdAt: new Date(r.created_at),
      expiresAt: new Date(r.expires_at),
    });
  }
  // Pulizia dei token scaduti (best-effort)
  pool.query("DELETE FROM device_tokens WHERE expires_at <= NOW()").catch(() => {});
  console.log(`[device-auth] Restored ${result.rows.length} device token(s) from DB`);
}).catch((err: unknown) => {
  console.error("[device-auth] Could not load tokens from DB:", err);
});

// ── Token management ──────────────────────────────────────────────────────────

export function issueToken(type: TokenType): string {
  const token = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TOKEN_TTL_MS[type]);

  tokens.set(token, { type, createdAt, expiresAt });

  // Fire-and-forget persist
  pool.query(
    `INSERT INTO device_tokens (token, type, created_at, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO NOTHING`,
    [token, type, createdAt, expiresAt]
  ).catch((err: unknown) => {
    console.error("[device-auth] Failed to persist token to DB:", err);
  });

  return token;
}

export function isValidToken(token: string): boolean {
  const entry = tokens.get(token);
  if (!entry) return false;
  if (entry.expiresAt < new Date()) {
    // Scaduto: rimuovi
    tokens.delete(token);
    pool.query("DELETE FROM device_tokens WHERE token = $1", [token]).catch(() => {});
    return false;
  }
  return true;
}

/** Revoca tutti i token (logout globale o scadenza sessione ADE). */
export function clearAllTokens(): void {
  tokens.clear();
  pool.query("DELETE FROM device_tokens").catch((err: unknown) => {
    console.error("[device-auth] Failed to clear all tokens from DB:", err);
  });
}

/**
 * Rimuove solo un token specifico (logout mobile self-service).
 * Non tocca la sessione ADE — gli altri dispositivi rimangono connessi.
 */
export function clearToken(token: string): void {
  tokens.delete(token);
  pool.query("DELETE FROM device_tokens WHERE token = $1", [token]).catch((err: unknown) => {
    console.error("[device-auth] Failed to delete token from DB:", err);
  });
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

/**
 * Session store for AE cookies.
 *
 * Persisted to PostgreSQL so that server restarts and production deploys
 * do NOT require re-authenticating via the Chrome extension.
 *
 * Uses the same pg.Pool as @workspace/db (node-postgres) to avoid
 * version conflicts with drizzle-orm peer deps.
 *
 * The in-memory cache is authoritative during the process lifetime;
 * the DB is written fire-and-forget on every change (non-fatal on failure).
 */

import pg from "pg";

const { Pool } = pg;

export interface AeSession {
  cookies: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  indirizzo: string;
  numeroCivico: string;
  cap: string;
  comune: string;
  provincia: string;
  defAliquotaIVA: string;
  credentials: { codiceFiscale: string; password: string; pin: string };
  createdAt: Date;
}

// ── DB pool ────────────────────────────────────────────────────────────────────
// DATABASE_URL is injected at runtime by Replit — no need to configure it.

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
});

// ── Ensure table exists (CREATE IF NOT EXISTS on every startup) ────────────────
// This runs once at module load — safe to call repeatedly, idempotent.

pool.query(`
  CREATE TABLE IF NOT EXISTS ade_sessions (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    cookies         TEXT NOT NULL,
    ragione_sociale TEXT NOT NULL DEFAULT '',
    partita_iva     TEXT NOT NULL DEFAULT '',
    codice_fiscale  TEXT NOT NULL DEFAULT '',
    indirizzo       TEXT NOT NULL DEFAULT '',
    numero_civico   TEXT NOT NULL DEFAULT '',
    cap             TEXT NOT NULL DEFAULT '',
    comune          TEXT NOT NULL DEFAULT '',
    provincia       TEXT NOT NULL DEFAULT '',
    def_aliquota_iva TEXT NOT NULL DEFAULT '',
    credentials     JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch((err: unknown) => {
  console.error("[session] Could not ensure ade_sessions table:", err);
});

// ── In-memory cache ────────────────────────────────────────────────────────────

let currentSession: AeSession | null = null;

// ── Bootstrap: load persisted session from DB on startup ─────────────────────

const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

pool.query<{
  cookies: string;
  ragione_sociale: string;
  partita_iva: string;
  codice_fiscale: string;
  indirizzo: string;
  numero_civico: string;
  cap: string;
  comune: string;
  provincia: string;
  def_aliquota_iva: string;
  credentials: AeSession["credentials"];
  created_at: string;
}>(
  "SELECT cookies, ragione_sociale, partita_iva, codice_fiscale, indirizzo, numero_civico, cap, comune, provincia, def_aliquota_iva, credentials, created_at FROM ade_sessions WHERE id = 1 LIMIT 1"
).then((result) => {
  if (result.rows.length === 0) return;
  const r = result.rows[0];
  const session: AeSession = {
    cookies:        r.cookies,
    ragioneSociale: r.ragione_sociale,
    partitaIva:     r.partita_iva,
    codiceFiscale:  r.codice_fiscale,
    indirizzo:      r.indirizzo,
    numeroCivico:   r.numero_civico,
    cap:            r.cap,
    comune:         r.comune,
    provincia:      r.provincia,
    defAliquotaIVA: r.def_aliquota_iva,
    credentials:    r.credentials,
    createdAt:      new Date(r.created_at),
  };
  const ageMs = Date.now() - session.createdAt.getTime();
  if (ageMs < SESSION_MAX_AGE_MS) {
    currentSession = session;
    console.log(`[session] Restored ADE session from DB — age ${Math.round(ageMs / 60000)} min`);
  } else {
    pool.query("DELETE FROM ade_sessions WHERE id = 1").catch(() => {});
    console.log("[session] Stale DB session discarded");
  }
}).catch((err: unknown) => {
  console.error("[session] Could not load session from DB:", err);
});

// ── Persistence helper (fire-and-forget) ──────────────────────────────────────

function persist(): void {
  const s = currentSession;
  if (s) {
    pool.query(
      `INSERT INTO ade_sessions (
         id, cookies, ragione_sociale, partita_iva, codice_fiscale,
         indirizzo, numero_civico, cap, comune, provincia,
         def_aliquota_iva, credentials, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (id) DO UPDATE SET
         cookies          = EXCLUDED.cookies,
         ragione_sociale  = EXCLUDED.ragione_sociale,
         partita_iva      = EXCLUDED.partita_iva,
         codice_fiscale   = EXCLUDED.codice_fiscale,
         indirizzo        = EXCLUDED.indirizzo,
         numero_civico    = EXCLUDED.numero_civico,
         cap              = EXCLUDED.cap,
         comune           = EXCLUDED.comune,
         provincia        = EXCLUDED.provincia,
         def_aliquota_iva = EXCLUDED.def_aliquota_iva,
         credentials      = EXCLUDED.credentials,
         created_at       = EXCLUDED.created_at,
         updated_at       = NOW()`,
      [
        1,
        s.cookies,
        s.ragioneSociale,
        s.partitaIva,
        s.codiceFiscale,
        s.indirizzo,
        s.numeroCivico,
        s.cap,
        s.comune,
        s.provincia,
        s.defAliquotaIVA,
        JSON.stringify(s.credentials),
        s.createdAt,
      ]
    ).catch((err: unknown) => {
      console.error("[session] Failed to persist session to DB:", err);
    });
  } else {
    pool.query("DELETE FROM ade_sessions WHERE id = 1").catch((err: unknown) => {
      console.error("[session] Failed to delete session from DB:", err);
    });
  }
}

// ── Public API (unchanged interface) ─────────────────────────────────────────

export function setSession(session: AeSession): void {
  currentSession = session;
  persist();
}

export function getSession(): AeSession | null {
  return currentSession;
}

export function clearSession(): void {
  currentSession = null;
  persist();
}

export function isSessionValid(): boolean {
  if (!currentSession) return false;
  const ageMs = Date.now() - currentSession.createdAt.getTime();
  return ageMs < SESSION_MAX_AGE_MS;
}

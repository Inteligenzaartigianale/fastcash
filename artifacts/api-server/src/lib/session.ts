/**
 * Session store for AE cookies — persisted to disk so server restarts
 * don't require re-pasting cookies.
 */

import fs from "fs";
import path from "path";

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

// Store next to the built output so it survives hot-reloads but is gitignored
const SESSION_FILE = path.join(process.cwd(), ".session.json");

let currentSession: AeSession | null = null;

// Load persisted session on startup
try {
  if (fs.existsSync(SESSION_FILE)) {
    const raw = fs.readFileSync(SESSION_FILE, "utf8");
    const parsed = JSON.parse(raw) as AeSession;
    parsed.createdAt = new Date(parsed.createdAt);
    // Only restore if not already expired
    const ageMs = Date.now() - parsed.createdAt.getTime();
    if (ageMs < 4 * 60 * 60 * 1000) {
      currentSession = parsed;
    } else {
      fs.unlinkSync(SESSION_FILE);
    }
  }
} catch {
  // Ignore corrupt session file
}

function persist(): void {
  try {
    if (currentSession) {
      fs.writeFileSync(SESSION_FILE, JSON.stringify(currentSession), "utf8");
    } else {
      if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    }
  } catch {
    // Non-fatal — worst case user re-pastes cookies
  }
}

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
  return ageMs < 4 * 60 * 60 * 1000;
}

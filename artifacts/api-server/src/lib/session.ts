/**
 * In-memory session store for AE cookies.
 * Single-user tool — one session at a time.
 */

export interface AeSession {
  cookies: string; // Raw cookie header value to forward to AE
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  // Business address — populated from /me after first successful call
  indirizzo: string;
  numeroCivico: string;
  cap: string;
  comune: string;
  provincia: string;
  defAliquotaIVA: string; // default IVA rate, e.g. "22"
  credentials: { codiceFiscale: string; password: string; pin: string };
  createdAt: Date;
}

let currentSession: AeSession | null = null;

export function setSession(session: AeSession): void {
  currentSession = session;
}

export function getSession(): AeSession | null {
  return currentSession;
}

export function clearSession(): void {
  currentSession = null;
}

export function isSessionValid(): boolean {
  if (!currentSession) return false;
  // Sessions expire after 4 hours
  const ageMs = Date.now() - currentSession.createdAt.getTime();
  return ageMs < 4 * 60 * 60 * 1000;
}

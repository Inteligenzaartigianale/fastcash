/**
 * Central auth token state for the frontend.
 *
 * Desktop:  token = UUID issued by GET /auth/app-token (in-memory, re-fetched on reload)
 * Mobile:   token = UUID issued by POST /auth/qr/consume (stored in localStorage)
 *
 * The token is sent as `Authorization: Bearer <token>` on every API call.
 * For generated-client calls, setAuthTokenGetter in main.tsx handles this.
 * For manual fetch() calls, use getAuthHeaders().
 */

import { isCapacitor, getDeviceToken, getApiBase } from "./capacitor";

// In-memory cache for the desktop token (lost on page reload → re-fetched lazily)
let _desktopToken: string | null = null;

export function setDesktopToken(token: string | null): void {
  _desktopToken = token;
}

export function getDesktopToken(): string | null {
  return _desktopToken;
}

/** The current auth token for this platform (null if not authenticated). */
export function getCurrentToken(): string | null {
  if (isCapacitor) return getDeviceToken();
  return _desktopToken;
}

/**
 * Fetches and caches a desktop app token from the server.
 * Returns null if the server has no active ADE session.
 */
export async function fetchDesktopToken(): Promise<string | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/auth/app-token`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { token: string };
    _desktopToken = data.token;
    return _desktopToken;
  } catch {
    return null;
  }
}

/** Authorization headers for manual fetch() calls that bypass the generated client. */
export function getAuthHeaders(): Record<string, string> {
  const token = getCurrentToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

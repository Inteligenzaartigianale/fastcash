/**
 * Capacitor detection & runtime server URL management.
 *
 * On the web the app is same-origin: API calls hit /api relative to the browser.
 * Inside a Capacitor WebView the app is served from capacitor://localhost/ so
 * every API call must be absolute (e.g. https://xyz.replit.app/fiscale/api/…).
 * The user configures that URL once (via QR scan or manual input) and we store
 * it in localStorage.
 */

const STORAGE_KEY = "scontrini_server_url";
const DEVICE_TOKEN_KEY = "scontrini_device_token";

/** True when running inside a Capacitor Android/iOS WebView */
export const isCapacitor: boolean =
  typeof window !== "undefined" &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;

/**
 * Returns the API base prefix (no trailing slash) to prepend to /api/… calls.
 * - Browser: uses Vite BASE_URL (same-origin, e.g. "" or "/fiscale")
 * - Capacitor: reads the user-configured server URL from localStorage
 */
export function getApiBase(): string {
  if (isCapacitor) {
    return localStorage.getItem(STORAGE_KEY)?.replace(/\/$/, "") ?? "";
  }
  return import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
}

/** Persist the remote server URL for use in future sessions */
export function setServerUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/$/, ""));
}

/** Retrieve the saved server URL (raw, may be empty) */
export function getServerUrl(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

/** True if the user has already configured a server URL */
export function hasServerUrl(): boolean {
  const v = localStorage.getItem(STORAGE_KEY);
  return !!v && v.length > 5;
}

// ── Device token (mobile) ────────────────────────────────────────────────────
// Issued by POST /auth/qr/consume after a successful QR+PIN pairing.
// Sent as Authorization: Bearer on all protected API calls.

export function getDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function setDeviceToken(token: string): void {
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
}

export function clearDeviceToken(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}

export function hasDeviceToken(): boolean {
  return !!localStorage.getItem(DEVICE_TOKEN_KEY);
}

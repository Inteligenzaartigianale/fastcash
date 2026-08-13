/**
 * OTA (Over-The-Air) version check utilities.
 *
 * How it works:
 *   1. At build time, vite.config.ts writes public/version.json and bakes the
 *      same string into the bundle as import.meta.env.VITE_APP_VERSION.
 *   2. On startup the app fetches version.json from the *web-asset origin* —
 *      the same host/path that served the running bundle — and compares it
 *      against the bundle's embedded version.
 *   3. If they differ, the app shows a banner prompting the cashier to restart.
 *   4. window.location.reload() then fetches the fresh bundle from the server
 *      (works because capacitor.config.ts sets server.url to the remote host
 *      when CAP_SERVER_URL is provided at build time).
 *
 * URL derivation — always targets where the web assets actually load from:
 *   • Browser           → relative path: `{BASE_URL}version.json`
 *   • Capacitor/remote  → `{window.location.origin}{BASE_URL}version.json`
 *     (server.url sets the origin to the remote host)
 *   • Capacitor/bundled → `{storedServerUrl}{BASE_URL}version.json`
 *     (falls back to the user-configured server URL from localStorage)
 *
 * Tying the version to the *web build* (not the API process) means:
 *   • A new frontend deploy → version.json changes → running clients detect it ✓
 *   • An API-only restart  → version.json unchanged → no false update banner ✓
 */

import { isCapacitor, getServerUrl } from "@/lib/capacitor";

/**
 * The version baked into the currently running bundle.
 * Undefined in dev mode (vite serve) — version checks are skipped.
 */
export const BUNDLE_VERSION: string | undefined =
  import.meta.env.VITE_APP_VERSION as string | undefined;

/**
 * Returns the URL to fetch version.json from.
 * Always points to the host that serves the running web assets.
 */
export function getVersionJsonUrl(): string {
  // Strip trailing slash so we can safely append /version.json
  const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");

  if (isCapacitor) {
    const origin = window.location.origin;
    const hostname = window.location.hostname;
    // When server.url is set in capacitor.config.ts, the WebView loads from
    // the remote host and window.location reflects that host.
    // When using bundled assets, androidScheme:"https" maps the local bundle to
    // https://localhost — that is NOT a remote server.  We must check hostname
    // explicitly to avoid fetching version.json from the device itself.
    if (origin.startsWith("http") && hostname !== "localhost") {
      // Remote-server mode: window.location.origin IS the production host.
      return `${origin}${basePath}/version.json`;
    }
    // Bundled mode (https://localhost or capacitor://localhost):
    // The user-configured server URL (stored in localStorage after QR/manual
    // setup) points to the production host that serves both the API and the
    // frontend static files — fetch version.json from there.
    const serverUrl = getServerUrl().replace(/\/+$/, "");
    return serverUrl ? `${serverUrl}${basePath}/version.json` : "";
  }

  // Browser (same-origin): relative URL naturally resolves against the
  // current origin+path without hardcoding any host.
  return `${basePath}/version.json`;
}

/**
 * Fetch the version embedded in the server's latest web build.
 * Returns null on any network or parse error (silent — never breaks the app).
 */
export async function fetchServerVersion(): Promise<string | null> {
  const url = getVersionJsonUrl();
  if (!url) return null; // no server configured yet (Capacitor first launch)
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

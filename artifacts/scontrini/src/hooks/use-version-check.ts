import { useEffect, useState, useCallback } from "react";
import { BUNDLE_VERSION, fetchServerVersion } from "@/lib/version-check";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // re-check every 5 minutes

/**
 * Polls version.json (a static file served alongside the web bundle) on mount
 * and every 5 minutes.  Returns { updateAvailable, applyUpdate }.
 *
 * updateAvailable — true when the server's latest web build has a different
 *   version string from the one baked into the currently running bundle.
 *   This only fires when a *new frontend deploy* ships; an API-only restart
 *   does not change version.json and therefore does not trigger the banner.
 *
 * applyUpdate — reloads the page so the WebView fetches the fresh bundle.
 *   With server.url set in capacitor.config.ts (via CAP_SERVER_URL at build
 *   time) the WebView pulls the latest assets from the remote host without
 *   reinstalling the APK.
 *
 * Dev mode: BUNDLE_VERSION is undefined during `vite serve`, so no check runs.
 */
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const check = useCallback(async () => {
    // Skip in dev mode — no version.json is emitted during `vite serve`.
    if (import.meta.env.DEV) return;
    if (!BUNDLE_VERSION) return;

    const serverVersion = await fetchServerVersion();
    if (!serverVersion) return; // network error — silently retry next interval

    if (serverVersion !== BUNDLE_VERSION) {
      setUpdateAvailable(true);
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    void check();
  }, [check]);

  // Periodic re-check while the app is open (useful for long-running POS days)
  useEffect(() => {
    const id = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [check]);

  const applyUpdate = useCallback(() => {
    // Reload the WebView — with server.url set in capacitor.config.ts this
    // fetches the latest bundle from the remote host (no APK reinstall needed).
    window.location.reload();
  }, []);

  return { updateAvailable, applyUpdate };
}

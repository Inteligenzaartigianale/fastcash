import type { CapacitorConfig } from "@capacitor/cli";

// ── OTA (Over-The-Air) update configuration ──────────────────────────────────
//
// When CAP_SERVER_URL is set at build time, the Capacitor WebView loads ALL web
// assets (HTML, JS, CSS) directly from that URL instead of from the bundled
// copy inside the APK.  This means:
//
//   • pnpm cap:build  →  generates an APK that always boots from the server
//   • To deploy a new version: push code to the server — no APK reinstall needed
//   • The app's OTA banner detects the version change and prompts the cashier
//     to restart; on restart, window.location.reload() fetches the fresh bundle
//
// Usage:
//   CAP_SERVER_URL=https://myserver.replit.app pnpm cap:build
//
// Without the variable (development default): web assets are served from the
// bundled dist/public directory as usual.
const capServerUrl = process.env.CAP_SERVER_URL?.replace(/\/$/, "");

const config: CapacitorConfig = {
  appId: "it.scontrini.fiscali",
  appName: "Scontrini Fiscali",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    // Set by CAP_SERVER_URL at build time for production OTA updates.
    // The WebView fetches web assets from this URL; window.location.reload()
    // picks up the latest bundle without reinstalling the APK.
    ...(capServerUrl ? { url: capServerUrl } : {}),
    // cleartext: true — only needed when capServerUrl is http:// (dev only)
  },
  android: {
    // allowMixedContent is intentionally NOT set — all API traffic must use HTTPS.
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    // Permessi camera per il QR scanner
    Camera: {
      permissions: ["camera"],
    },
  },
};

export default config;

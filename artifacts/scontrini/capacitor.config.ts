import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "it.scontrini.fiscali",
  appName: "Scontrini Fiscali",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    // Per live reload durante lo sviluppo, decommentare e impostare l'URL del server:
    // url: "http://192.168.1.x:PORT",
    // cleartext: true,
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

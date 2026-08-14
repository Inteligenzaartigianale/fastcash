import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// ── OTA version plugin ────────────────────────────────────────────────────────
// Writes public/version.json (served as a static file alongside the app) and
// injects the same string as import.meta.env.VITE_APP_VERSION into the bundle.
// This couples the version to the *web build*, not the API process start-time:
//   • A new frontend deploy → new version.json → running clients detect it
//   • An API-only restart  → version.json unchanged → no false update banner
//
// Set APP_VERSION in the environment to a fixed string (e.g. git SHA, deploy
// timestamp) so the version is stable across server restarts.  Falls back to
// the build time so each build always produces a distinct version file.
const APP_VERSION =
  process.env.APP_VERSION ?? new Date().toISOString();

function versionPlugin(): Plugin {
  return {
    name: 'vite-plugin-version',
    // Use generateBundle (not buildStart/writeFile) so version.json is emitted
    // into dist/public/ as a build artifact — never into tracked public/ source.
    // This keeps the source tree clean: version.json only exists in build output.
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  };
}

// During `vite build` PORT is not needed (only server/preview use it).
// Use a fallback so the build step doesn't fail in the deployment container.
const rawPort = process.env.PORT ?? '3000';
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH defaults to "/" for production builds where it isn't injected.
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  define: {
    // Bake the build version into the bundle so the running app knows its own
    // release ID and can compare it against the server's version.json.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
    // Production URL — used in the login page so the extension step always
    // shows the correct URL regardless of the domain the page is opened from.
    'import.meta.env.VITE_APP_URL': JSON.stringify(process.env.APP_URL ?? ""),
  },
  plugins: [
    versionPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});

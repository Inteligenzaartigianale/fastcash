import { RefreshCw } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";

/**
 * Sticky top banner shown when the server has deployed a newer version of the
 * web app.  Tapping "Riavvia" reloads the WebView which — when the Capacitor
 * `server.url` is set to the remote host — fetches the fresh bundle without
 * reinstalling the APK.
 */
export function UpdateBanner() {
  const { updateAvailable, applyUpdate } = useVersionCheck();

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between gap-3 bg-[#1e3a5f] text-white px-4 py-2.5 shadow-lg"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
        <span>Aggiornamento disponibile — riavvio necessario</span>
      </div>
      <button
        onClick={applyUpdate}
        className="shrink-0 rounded-lg bg-white text-[#1e3a5f] px-3 py-1 text-sm font-semibold hover:bg-blue-50 active:scale-95 transition-all"
      >
        Riavvia
      </button>
    </div>
  );
}

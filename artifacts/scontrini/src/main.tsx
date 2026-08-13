import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { isCapacitor, getApiBase, getDeviceToken } from "./lib/capacitor";
import { getDesktopToken, fetchDesktopToken } from "./lib/auth-token";
import App from "./App";
import "./index.css";

if (isCapacitor) {
  // Mobile (Capacitor WebView): app is served from capacitor://localhost/ so
  // all relative /api/… paths must be converted to absolute.
  const base = getApiBase();
  if (base) setBaseUrl(base);

  // Device token stored in localStorage after QR+PIN pairing — sent on every call.
  setAuthTokenGetter(() => getDeviceToken());
} else {
  // Desktop browser: token comes from GET /auth/app-token (in-memory on server).
  // The getter is async: if the token isn't cached yet it fetches it first.
  // This means every first API call after a page reload automatically re-acquires
  // the token without a separate init step.
  setAuthTokenGetter(async () => {
    const cached = getDesktopToken();
    if (cached) return cached;
    // Returns null when the ADE session is not active yet (→ login page shows)
    return fetchDesktopToken();
  });
}

createRoot(document.getElementById("root")!).render(<App />);

/**
 * QrLoginScanner — shown on mobile (Capacitor) login screen.
 *
 * Flow:
 *  1. Camera scans the QR → extracts { server, token }
 *  2. User types the 4-digit PIN shown on the desktop screen (second factor)
 *  3. App calls /auth/qr/consume with { token, pin }
 *  4. On success, redirects to home
 *
 * The PIN is NOT embedded in the QR code — it is displayed separately on the
 * desktop so that a photo of the QR alone is insufficient to authenticate.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { setServerUrl, setDeviceToken } from "@/lib/capacitor";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { CheckCircle2, XCircle, RefreshCw, QrCode, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrPayload {
  type: string;
  server: string;
  token: string;
}

interface Props {
  onSuccess: () => void;
}

const SCANNER_ID = "qr-login-scanner-div";

type Phase = "scanning" | "pin" | "consuming" | "success" | "error";

export function QrLoginScanner({ onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [errorMsg, setErrorMsg] = useState("");
  // retryKey increments on retry → forces the scanner useEffect to re-run
  const [retryKey, setRetryKey] = useState(0);

  // Captured after QR scan, needed for consume call
  const [scannedPayload, setScannedPayload] = useState<QrPayload | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Called by html5-qrcode when a QR code is decoded
  const handleScan = useCallback(async (raw: string) => {
    // Stop the camera immediately
    try { await scannerRef.current?.stop(); } catch { /* ignore */ }

    let payload: QrPayload;
    try {
      payload = JSON.parse(raw) as QrPayload;
      if (payload.type !== "scontrini-login" || !payload.server || !payload.token) {
        throw new Error("formato non valido");
      }
      if (!payload.server.startsWith("https://")) {
        throw new Error("Il server deve usare HTTPS. Verifica la configurazione dell'app desktop.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "QR non riconosciuto";
      setErrorMsg(`QR non valido — ${msg}.`);
      setPhase("error");
      return;
    }

    setScannedPayload(payload);
    setPhase("pin"); // Ask operator to type the PIN shown on desktop
  }, []);

  // Create/recreate scanner whenever retryKey changes
  useEffect(() => {
    if (phase !== "scanning") return; // only start scanner in scanning phase

    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
        handleScan,
        undefined,
      )
      .catch((err: unknown) => {
        console.error("QR scanner start error", err);
        setErrorMsg(
          "Impossibile accedere alla fotocamera. Controlla i permessi nelle impostazioni.",
        );
        setPhase("error");
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]); // retryKey forces full scanner recreation

  const handlePinSubmit = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setPinError("Inserisci esattamente 4 cifre");
      return;
    }
    if (!scannedPayload) return;

    setPinError("");
    setPhase("consuming");

    // Configure the API client for the scanned server
    setServerUrl(scannedPayload.server);
    setBaseUrl(scannedPayload.server);

    try {
      const res = await fetch(`${scannedPayload.server}/api/auth/qr/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: scannedPayload.token, pin }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Errore HTTP ${res.status}`);
      }
      const data = (await res.json()) as { success: boolean; deviceToken?: string };
      if (data.deviceToken) {
        // Persist the device token; it is sent as Authorization: Bearer on all
        // subsequent API calls (via the auth token getter set in main.tsx).
        setDeviceToken(data.deviceToken);
        // Also update the getter immediately in case it was set before this token existed
        setAuthTokenGetter(() => data.deviceToken!);
      }
      setPhase("success");
      setTimeout(onSuccess, 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore di rete";
      if (msg.toLowerCase().includes("pin")) {
        // Wrong PIN — go back to PIN entry, keep the scanned payload
        setPinError(msg);
        setPin("");
        setPhase("pin");
      } else {
        setErrorMsg(msg);
        setPhase("error");
      }
    }
  };

  const retry = () => {
    setPin("");
    setPinError("");
    setScannedPayload(null);
    setErrorMsg("");
    setPhase("scanning");
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Scanner div: always in DOM while scanning so html5-qrcode can mount */}
      <div
        id={SCANNER_ID}
        className={`w-full rounded-xl overflow-hidden border-2 border-[#1e3a5f]/30 ${
          phase !== "scanning" ? "hidden" : ""
        }`}
      />

      {phase === "scanning" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <QrCode className="w-4 h-4 animate-pulse" />
          <span>Inquadra il QR mostrato sul PC</span>
        </div>
      )}

      {/* PIN entry — second factor */}
      {phase === "pin" && (
        <div className="w-full space-y-4">
          <div className="flex flex-col items-center gap-2 py-2">
            <KeyRound className="w-10 h-10 text-[#1e3a5f]" />
            <p className="text-sm font-semibold text-center">QR letto correttamente</p>
            <p className="text-xs text-muted-foreground text-center">
              Digita il <strong>PIN di 4 cifre</strong> mostrato sul PC accanto al QR
            </p>
          </div>

          <input
            type="tel"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
            placeholder="0000"
            className="w-full h-16 text-center text-4xl font-bold tracking-[0.4em] font-mono rounded-xl border-2 border-[#1e3a5f]/30 focus:border-[#1e3a5f] outline-none bg-white"
            autoFocus
          />

          {pinError && (
            <p className="text-xs text-red-600 text-center font-medium">{pinError}</p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-12" onClick={retry}>
              Rileggi QR
            </Button>
            <Button
              className="flex-1 h-12 bg-[#1e3a5f] text-base"
              disabled={pin.length !== 4}
              onClick={handlePinSubmit}
            >
              Conferma PIN
            </Button>
          </div>
        </div>
      )}

      {phase === "consuming" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <RefreshCw className="w-10 h-10 animate-spin text-[#1e3a5f]" />
          <p className="text-sm font-medium text-center">Connessione in corso…</p>
        </div>
      )}

      {phase === "success" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <CheckCircle2 className="w-12 h-12 text-green-600" />
          <p className="text-sm font-semibold text-green-800">Accesso effettuato!</p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-center gap-4 py-6">
          <XCircle className="w-10 h-10 text-red-500" />
          <p className="text-sm text-red-800 text-center px-4 font-medium">{errorMsg}</p>
          {(errorMsg.toLowerCase().includes("scadut") ||
            errorMsg.toLowerCase().includes("non valido") ||
            errorMsg.includes("404")) && (
            <div className="w-full rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 text-center">
              <p className="font-semibold mb-1">QR non più valido</p>
              <p>Torna al PC, premi <strong>"Rigenera"</strong> nel pannello QR e scansiona il nuovo codice.</p>
            </div>
          )}
          <Button size="lg" className="w-full bg-[#1e3a5f]" onClick={retry}>
            Scansiona di nuovo
          </Button>
        </div>
      )}
    </div>
  );
}

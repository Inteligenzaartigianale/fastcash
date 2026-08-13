/**
 * QrShareButton — shown on desktop when the user is authenticated.
 * Generates a one-time QR code that the mobile app can scan to import
 * the existing ADE session without needing the Chrome extension.
 *
 * Security: the server returns a { token, pin } pair. The PIN is shown
 * prominently below the QR code on the desktop screen but is NOT embedded
 * in the QR payload. The mobile app must ask the operator to type the PIN
 * after scanning, providing a second factor for pairing.
 */
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface QrPayload {
  type: "scontrini-login";
  server: string;
  token: string;
  // NOTE: pin is intentionally NOT included in the QR payload.
  // It is shown on the desktop screen and typed manually by the operator.
}

async function generateToken(): Promise<{
  token: string;
  pin: string;
  expiresAt: string;
}> {
  const res = await fetch(`${BASE}/api/auth/qr/generate`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ token: string; pin: string; expiresAt: string }>;
}

export function QrShareButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-white/70 hover:text-white hover:bg-white/10 h-8 px-2 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
        title="Condividi sessione con il POS Android"
      >
        <QrCode className="w-4 h-4" />
        <span className="hidden sm:inline">QR mobile</span>
      </Button>
      {open && <QrShareModal onClose={() => setOpen(false)} />}
    </>
  );
}

function QrShareModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [error, setError] = useState("");

  const load = async () => {
    setState("loading");
    setError("");
    try {
      const { token, pin: newPin, expiresAt: exp } = await generateToken();
      const serverUrl = window.location.origin + BASE;

      // PIN is intentionally excluded from the QR payload
      const payload: QrPayload = {
        type: "scontrini-login",
        server: serverUrl,
        token,
      };
      const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 260,
        margin: 2,
        color: { dark: "#1e3a5f", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(dataUrl);
      setPin(newPin);
      setExpiresAt(new Date(exp));
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore generazione QR");
      setState("error");
    }
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer — auto-regenerate when expired
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.round((expiresAt.getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(left);
      if (left === 0) load();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xs sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode className="w-5 h-5 text-[#1e3a5f]" />
            Accesso mobile via QR
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Apri l'app sul POS o smartphone Android e scansiona questo codice,
            poi inserisci il <strong>PIN di 4 cifre</strong> mostrato qui sotto.
          </p>

          <div className="flex flex-col items-center gap-3">
            {state === "loading" && (
              <div className="w-[264px] h-[264px] flex items-center justify-center bg-gray-50 rounded-xl border">
                <RefreshCw className="w-8 h-8 animate-spin text-[#1e3a5f]/40" />
              </div>
            )}

            {state === "ready" && (
              <>
                <div className="rounded-xl border-2 border-[#1e3a5f]/20 p-2 bg-white shadow">
                  <img src={qrDataUrl} alt="QR login" width={260} height={260} />
                </div>

                {/* PIN — prominent, operator reads this aloud to the cashier */}
                <div className="w-full rounded-xl bg-[#1e3a5f] text-white text-center py-3 px-4 shadow">
                  <p className="text-xs font-medium text-white/70 mb-0.5">PIN da digitare sul POS</p>
                  <p className="text-4xl font-bold tracking-[0.3em] font-mono">{pin}</p>
                </div>

                <div className={`flex items-center gap-2 text-xs font-mono font-semibold ${
                  secondsLeft < 60 ? "text-red-600" : "text-[#1e3a5f]/60"
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Scade in {mm}:{ss}
                </div>
              </>
            )}

            {state === "error" && (
              <div className="w-full rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 flex flex-col items-center gap-3">
                <XCircle className="w-8 h-8 text-red-500" />
                <p className="text-center">{error}</p>
                <Button size="sm" variant="outline" onClick={load}>
                  Riprova
                </Button>
              </div>
            )}
          </div>

          {state === "ready" && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Come funziona</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Apri l'app Scontrini sul POS Android</li>
                <li>Tocca <strong>Scansiona QR</strong> nella schermata di login</li>
                <li>Inquadra questo QR, poi inserisci il <strong>PIN di 4 cifre</strong> mostrato sopra</li>
              </ol>
            </div>
          )}

          <div className="flex gap-2">
            {state === "ready" && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={load}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Rigenera
              </Button>
            )}
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, RefreshCw, CheckCircle2, Puzzle, QrCode, Smartphone, AlertCircle } from "lucide-react";
import { isCapacitor, getApiBase, getServerUrl, setServerUrl, hasServerUrl, hasDeviceToken } from "@/lib/capacitor";
import { setBaseUrl } from "@workspace/api-client-react";
import { setDesktopToken } from "@/lib/auth-token";
import { QrLoginScanner } from "@/components/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function checkStatus(): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/auth/status`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated?: boolean };
    return data.authenticated === true;
  } catch {
    return false;
  }
}

// ── Desktop login (extension flow) ───────────────────────────────────────────

function DesktopLogin() {
  const [, setLocation] = useLocation();
  const [pollStatus, setPollStatus] = useState<"waiting" | "detected">("waiting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const appUrl = window.location.origin + (BASE || "");

  useEffect(() => {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const doPoll = async () => {
      const ok = await checkStatus();
      if (ok) {
        setPollStatus("detected");
        if (pollRef.current) clearInterval(pollRef.current);
        // Fetch a desktop app token before navigating — all protected routes
        // require it.  Sets it via setDesktopToken so the lazy getter in
        // main.tsx returns it immediately on the first API call from home.tsx.
        try {
          const r = await fetch(`${BASE}/api/auth/app-token`, { cache: "no-store" });
          if (r.ok) {
            const { token } = (await r.json()) as { token: string };
            setDesktopToken(token);
          }
        } catch { /* ignore — main.tsx lazy getter will retry */ }
        setTimeout(() => setLocation("/"), 800);
      }
    };
    doPoll();
    pollRef.current = setInterval(doPoll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [setLocation]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1 pb-2">
          <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-full mx-auto mb-3">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-primary">App Scontrini Fiscali</h1>
          <p className="text-sm text-muted-foreground">Documenti Commerciali Online — Agenzia delle Entrate</p>
        </div>

        <Card className="shadow-lg border-primary/20">
          <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 bg-blue-100 rounded-lg shrink-0">
                <Puzzle className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <CardTitle className="text-base">Accedi con l'estensione Chrome</CardTitle>
                <CardDescription className="text-xs mt-0.5">Nessuna credenziale da inserire nell'app</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-5 space-y-4">
            <div className={`flex items-center gap-3 rounded-lg p-3 border text-sm ${
              pollStatus === "detected"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}>
              {pollStatus === "detected" ? (
                <>
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" />
                  <span className="font-medium">Sessione rilevata — accesso in corso…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-blue-600" />
                  <span>In attesa dell'estensione…</span>
                </>
              )}
            </div>

            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">1</span>
                <span>
                  Apri <strong>Chrome</strong> e accedi su{" "}
                  <a href="https://ivaservizi.agenziaentrate.gov.it" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                    ivaservizi.agenziaentrate.gov.it
                  </a>{" "}con SPID o CIE
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">2</span>
                <span>Clicca l'icona dell'estensione <strong>Scontrini ADE</strong> nella barra Chrome</span>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">3</span>
                <span>
                  Assicurati che l'URL nell'estensione sia{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded break-all">{appUrl}</code>
                  {" "}e premi <strong>Invia cookie</strong>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold shrink-0 mt-0.5">✓</span>
                <span>Questa pagina entra automaticamente — non serve fare altro</span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Mobile login (Capacitor — QR scan) ────────────────────────────────────────

function MobileLogin() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"qr" | "manual">("qr");
  const [manualUrl, setManualUrl] = useState(getServerUrl());
  const [urlError, setUrlError] = useState("");

  // Track server configuration reactively so the polling effect can depend on it
  const [serverConfigured, setServerConfigured] = useState(() => hasServerUrl());

  const savedServer = getServerUrl();

  // Poll auth status on subsequent visits when the device already has both a
  // server URL AND a device token from a previous QR+PIN pairing session.
  // On first visit (no device token) we do NOT auto-redirect — the user must
  // complete QR+PIN pairing to obtain a device token.
  useEffect(() => {
    if (!serverConfigured) return;
    if (!hasDeviceToken()) return; // require device token from QR+PIN pairing

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const doPoll = async () => {
      const ok = await checkStatus();
      if (ok && !cancelled) {
        if (timer) clearInterval(timer);
        setLocation("/");
      }
    };

    doPoll();
    timer = setInterval(doPoll, 2000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [serverConfigured, setLocation]);

  const handleQrSuccess = () => {
    // QrLoginScanner has saved the device token and updated the auth getter.
    // Redirect to home — the device is now paired and can call protected routes.
    setLocation("/");
  };

  const handleManualSave = () => {
    const trimmed = manualUrl.trim().replace(/\/$/, "");
    if (!trimmed.startsWith("https://")) {
      setUrlError("L'URL deve iniziare con https:// per garantire la sicurezza della sessione fiscale.");
      return;
    }
    setUrlError("");
    setServerUrl(trimmed);
    setBaseUrl(trimmed);
    setServerConfigured(true);
    setView("qr");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white px-5 py-6 text-center">
        <div className="flex items-center justify-center w-14 h-14 bg-white/10 rounded-full mx-auto mb-3">
          <Smartphone className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-xl font-bold">Scontrini Fiscali</h1>
        <p className="text-sm text-white/70 mt-0.5">Accesso tramite QR</p>
      </div>

      <div className="flex-1 px-4 py-6 space-y-4 overflow-y-auto">
        {view === "qr" ? (
          <>
            {/* Tab row */}
            <div className="flex rounded-lg border overflow-hidden">
              <button
                className="flex-1 py-2.5 text-sm font-semibold bg-[#1e3a5f] text-white"
                onClick={() => setView("qr")}
              >
                <QrCode className="w-4 h-4 inline mr-1.5" />
                Scansiona QR
              </button>
              <button
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50"
                onClick={() => setView("manual")}
              >
                Inserisci URL
              </button>
            </div>

            {savedServer && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                Server: <span className="font-mono font-semibold break-all">{savedServer}</span>
              </div>
            )}

            <Card className="border-[#1e3a5f]/20 shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#1e3a5f]" />
                  Inquadra il QR dal desktop
                </CardTitle>
                <CardDescription className="text-xs">
                  Sull'app desktop, clicca <strong>QR mobile</strong> nell'intestazione per generare il codice
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <QrLoginScanner onSuccess={handleQrSuccess} />
              </CardContent>
            </Card>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Come usare il QR</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Apri l'app su PC e accedi con l'estensione Chrome</li>
                <li>Clicca <strong>QR mobile</strong> nell'intestazione in alto a destra</li>
                <li>Inquadra il codice — accesso immediato + server configurato automaticamente</li>
              </ol>
            </div>
          </>
        ) : (
          /* Manual server URL entry */
          <>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50"
                onClick={() => { setView("qr"); setUrlError(""); }}
              >
                <QrCode className="w-4 h-4 inline mr-1.5" />
                Scansiona QR
              </button>
              <button
                className="flex-1 py-2.5 text-sm font-semibold bg-[#1e3a5f] text-white"
                onClick={() => setView("manual")}
              >
                Inserisci URL
              </button>
            </div>

            <Card className="shadow border-[#1e3a5f]/20">
              <CardContent className="pt-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Inserisci l'URL del server Scontrini (es.{" "}
                  <code className="text-xs bg-muted px-1 rounded">https://xyz.replit.app/fiscale</code>).
                  Deve iniziare con <strong>https://</strong>.
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600">URL server</label>
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://scontrini.example.replit.app/fiscale"
                    value={manualUrl}
                    onChange={(e) => { setManualUrl(e.target.value); setUrlError(""); }}
                    className="font-mono text-xs h-11"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  {urlError && (
                    <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {urlError}
                    </div>
                  )}
                </div>
                <Button
                  className="w-full h-12 bg-[#1e3a5f] text-base"
                  disabled={!manualUrl.trim().startsWith("https://")}
                  onClick={handleManualSave}
                >
                  Salva e continua
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ── Route entry ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  return isCapacitor ? <MobileLogin /> : <DesktopLogin />;
}

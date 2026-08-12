import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Loader2, ClipboardPaste, ChevronDown, ChevronUp, CheckCircle2, Puzzle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function loginWithCookies(identificativo: string, cookieHeader: string): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/cookie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificativo, cookieHeader }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string; details?: string };
    throw Object.assign(
      new Error(data.error ?? "Errore nell'invio dei cookie"),
      { details: (data as { details?: string }).details },
    );
  }
}

async function checkStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/status`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json() as { authenticated?: boolean };
    return data.authenticated === true;
  } catch {
    return false;
  }
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Extension polling
  const [pollStatus, setPollStatus] = useState<"waiting" | "detected">("waiting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Manual cookie form
  const [showManual, setShowManual] = useState(false);
  const [cfCookie, setCfCookie] = useState("");
  const [cookieHeader, setCookieHeader] = useState("");
  const [isCookiePending, setIsCookiePending] = useState(false);

  // App URL for the extension (published or dev)
  const appUrl = window.location.origin + (BASE || "");

  // Auto-poll: as soon as the extension sends cookies the server marks us logged in
  useEffect(() => {
    const doPoll = async () => {
      const ok = await checkStatus();
      if (ok) {
        setPollStatus("detected");
        if (pollRef.current) clearInterval(pollRef.current);
        setTimeout(() => setLocation("/"), 800);
      }
    };

    // Check immediately on mount
    doPoll();

    // Then every 3 seconds
    pollRef.current = setInterval(doPoll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [setLocation]);

  const handleCookieSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfCookie.trim()) {
      toast({ title: "Errore", description: "Inserisci il codice fiscale o la Partita IVA.", variant: "destructive" });
      return;
    }
    if (!cookieHeader.trim() || cookieHeader.trim().length < 20) {
      toast({ title: "Errore", description: "Incolla i cookie copiati dal browser.", variant: "destructive" });
      return;
    }
    setIsCookiePending(true);
    try {
      await loginWithCookies(cfCookie.trim(), cookieHeader.trim());
      setLocation("/");
    } catch (err) {
      const cookieError = err as Error & { details?: string };
      toast({
        title: "Sessione ADE non collegata",
        description: cookieError.details || cookieError.message || "Cookie non validi o sessione scaduta.",
        variant: "destructive",
      });
    } finally {
      setIsCookiePending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">

        {/* Header */}
        <div className="text-center space-y-1 pb-2">
          <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-full mx-auto mb-3">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-primary">App Scontrini Fiscali</h1>
          <p className="text-sm text-muted-foreground">Documenti Commerciali Online — Agenzia delle Entrate</p>
        </div>

        {/* Main card: extension flow */}
        <Card className="shadow-lg border-primary/20">
          <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 bg-blue-100 rounded-lg shrink-0">
                <Puzzle className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <CardTitle className="text-base">Accedi con l'estensione Chrome</CardTitle>
                <CardDescription className="text-xs mt-0.5">Metodo consigliato — nessuna credenziale da inserire</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-5 space-y-4">

            {/* Status indicator */}
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

            {/* Steps */}
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">1</span>
                <span>
                  Apri <strong>Chrome</strong> e accedi su{" "}
                  <a
                    href="https://ivaservizi.agenziaentrate.gov.it"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    ivaservizi.agenziaentrate.gov.it
                  </a>{" "}
                  con SPID o CIE
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">2</span>
                <span>
                  Clicca l'icona dell'estensione <strong>Scontrini ADE</strong> nella barra Chrome
                </span>
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
                <span>Questa pagina entrerà automaticamente nell'app — non serve fare altro</span>
              </li>
            </ol>

          </CardContent>
        </Card>

        {/* Manual cookie fallback — collapsible */}
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowManual(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4" />
              Alternativa: incolla i cookie manualmente
            </span>
            {showManual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showManual && (
            <form onSubmit={handleCookieSubmit}>
              <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border bg-muted/10">
                <div className="text-xs text-muted-foreground bg-muted rounded p-3 space-y-1">
                  <p className="font-medium text-foreground">Come copiare i cookie:</p>
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Apri <strong>ivaservizi.agenziaentrate.gov.it</strong> e accedi con Fisconline</li>
                    <li>Premi <strong>F12</strong> → scheda <strong>Network</strong></li>
                    <li>Ricarica la pagina, clicca su una richiesta al dominio <em>ivaservizi</em></li>
                    <li>In <strong>Request Headers</strong> trova la riga <strong>Cookie:</strong> e copia il valore</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cf-cookie">Codice fiscale o Partita IVA</Label>
                  <Input
                    id="cf-cookie"
                    type="text"
                    placeholder="CF o P.IVA"
                    value={cfCookie}
                    onChange={(e) => setCfCookie(e.target.value.toUpperCase().trim())}
                    disabled={isCookiePending}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cookie-header">Cookie copiati dal browser</Label>
                  <Textarea
                    id="cookie-header"
                    placeholder="FATSC=abc123; JSESSIONID=xyz; ..."
                    value={cookieHeader}
                    onChange={(e) => setCookieHeader(e.target.value)}
                    disabled={isCookiePending}
                    className="font-mono text-xs min-h-[90px] resize-none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isCookiePending}>
                  {isCookiePending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifica…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ClipboardPaste className="w-4 h-4" />
                      Accedi con questi cookie
                    </span>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}

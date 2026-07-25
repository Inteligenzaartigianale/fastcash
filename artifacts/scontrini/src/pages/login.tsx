import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Eye, EyeOff, Loader2, ClipboardPaste, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function startLoginJob(codiceFiscale: string, password: string, pin: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codiceFiscale, password, pin }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error((data as { error?: string }).error ?? "Errore di rete"), { status: res.status, data });
  }
  const data = await res.json() as { jobId?: string };
  if (!data.jobId) throw new Error("Risposta imprevista dal server");
  return data.jobId;
}

interface PollResult {
  status: "pending" | "success" | "error";
  error?: string;
  details?: string;
  ragioneSociale?: string;
  partitaIva?: string;
}

async function pollJob(jobId: string): Promise<PollResult> {
  const res = await fetch(`${BASE}/api/auth/login/poll/${jobId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string; details?: string };
    return { status: "error", error: data.error, details: data.details };
  }
  return res.json() as Promise<PollResult>;
}

async function loginWithCookies(codiceFiscale: string, cookieHeader: string): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/cookie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codiceFiscale, cookieHeader }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Errore nell'invio dei cookie");
  }
}

type LoginMode = "auto" | "cookie";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<LoginMode>("auto");

  // Auto mode fields
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Connessione in corso...");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<string | null>(null);

  // Cookie mode fields
  const [cfCookie, setCfCookie] = useState("");
  const [cookieHeader, setCookieHeader] = useState("");
  const [isCookiePending, setIsCookiePending] = useState(false);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const handleAutoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codiceFiscale || !password || !pin) {
      toast({ title: "Errore", description: "Compila tutti i campi.", variant: "destructive" });
      return;
    }
    setIsPending(true);
    setStatusMsg("Connessione al portale AE...");
    try {
      const jobId = await startLoginJob(codiceFiscale, password, pin);
      jobIdRef.current = jobId;
      const msgs = [
        "Autenticazione Fisconline...",
        "Accesso al portale AE...",
        "Verifica credenziali...",
        "Apertura sessione DCO...",
        "Quasi pronto...",
      ];
      let msgIdx = 0;
      const msgInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % msgs.length;
        setStatusMsg(msgs[msgIdx]!);
      }, 6000);
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 72) {
          clearInterval(msgInterval);
          stopPolling();
          setIsPending(false);
          toast({ title: "Timeout", description: "Il login sta impiegando troppo tempo. Riprova.", variant: "destructive" });
          return;
        }
        try {
          const result = await pollJob(jobIdRef.current!);
          if (result.status === "pending") return;
          clearInterval(msgInterval);
          stopPolling();
          setIsPending(false);
          if (result.status === "success") {
            setLocation("/");
          } else {
            toast({ title: "Accesso negato", description: result.error ?? "Credenziali non valide o errore di sistema.", variant: "destructive" });
          }
        } catch {
          clearInterval(msgInterval);
          stopPolling();
          setIsPending(false);
          toast({ title: "Errore di connessione", description: "Impossibile connettersi al servizio.", variant: "destructive" });
        }
      }, 2500);
    } catch (err) {
      setIsPending(false);
      const apiErr = err as { status?: number; data?: { error?: string }; message?: string };
      if (apiErr.status === 401) {
        toast({ title: "Accesso negato", description: apiErr.data?.error ?? "Credenziali non valide.", variant: "destructive" });
      } else {
        toast({ title: "Errore di connessione", description: apiErr.message ?? "Impossibile connettersi al servizio.", variant: "destructive" });
      }
    }
  };

  const handleCookieSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfCookie.trim()) {
      toast({ title: "Errore", description: "Inserisci il codice fiscale.", variant: "destructive" });
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
      toast({ title: "Errore", description: (err as Error).message ?? "Impossibile usare i cookie inseriti.", variant: "destructive" });
    } finally {
      setIsCookiePending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        {/* Mode toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("auto")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mode === "auto"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <Zap className="w-4 h-4" />
            Accesso automatico
          </button>
          <button
            type="button"
            onClick={() => setMode("cookie")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mode === "cookie"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            Incolla cookie
          </button>
        </div>

        {/* ── Auto mode ── */}
        {mode === "auto" && (
          <Card className="shadow-lg border-primary/20">
            <CardHeader className="space-y-3 pb-6 border-b border-border/50 bg-muted/20">
              <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mx-auto mb-2">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-center text-xl text-primary font-semibold">App Scontrini Fiscali</CardTitle>
              <CardDescription className="text-center text-sm">
                Accesso tramite Fisconline per l'emissione di Documenti Commerciali Online
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleAutoSubmit}>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="cf">Codice Fiscale</Label>
                  <Input
                    id="cf"
                    type="text"
                    placeholder="Inserisci il codice fiscale"
                    value={codiceFiscale}
                    onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())}
                    disabled={isPending}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Inserisci la password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isPending}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN</Label>
                  <div className="relative">
                    <Input
                      id="pin"
                      type={showPin ? "text" : "password"}
                      placeholder="Inserisci il PIN"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      disabled={isPending}
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowPin((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {isPending && (
                  <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs p-3 rounded border border-blue-100 dark:border-blue-900">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <p>{statusMsg}</p>
                  </div>
                )}
                {!isPending && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs p-3 rounded border border-amber-100 dark:border-amber-900">
                    <p>⚠️ Se questo metodo non funziona, usa la modalità <strong>Incolla cookie</strong> qui sopra.</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col border-t border-border/50 bg-muted/20 pt-6">
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Accesso in corso...
                    </span>
                  ) : "Accedi"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* ── Cookie paste mode ── */}
        {mode === "cookie" && (
          <Card className="shadow-lg border-primary/20">
            <CardHeader className="space-y-2 pb-4 border-b border-border/50 bg-muted/20">
              <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mx-auto mb-2">
                <ClipboardPaste className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-center text-xl text-primary font-semibold">Accesso con cookie</CardTitle>
              <CardDescription className="text-center text-sm">
                Accedi a ivaservizi dal tuo browser, copia i cookie e incollali qui
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCookieSubmit}>
              <CardContent className="space-y-4 pt-5">
                {/* Step-by-step instructions */}
                <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 text-xs p-3 rounded border border-blue-200 dark:border-blue-800 space-y-1.5">
                  <p className="font-semibold">Come copiare i cookie:</p>
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Apri <strong>ivaservizi.agenziaentrate.gov.it</strong> nel tuo browser e accedi normalmente con Fisconline</li>
                    <li>Premi <strong>F12</strong> → scheda <strong>Network</strong> (Rete)</li>
                    <li>Ricarica la pagina, clicca su qualsiasi richiesta al dominio <em>ivaservizi</em></li>
                    <li>Nella sezione <strong>Request Headers</strong>, trova la riga <strong>Cookie:</strong></li>
                    <li>Copia tutto il valore (la stringa lunga dopo "Cookie:")</li>
                    <li>Incollala nel campo qui sotto</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cf-cookie">Codice Fiscale</Label>
                  <Input
                    id="cf-cookie"
                    type="text"
                    placeholder="Il tuo codice fiscale"
                    value={cfCookie}
                    onChange={(e) => setCfCookie(e.target.value.toUpperCase())}
                    disabled={isCookiePending}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cookie-header">Cookie copiati dal browser</Label>
                  <Textarea
                    id="cookie-header"
                    placeholder="Incolla qui la stringa cookie (es: FATSC=abc123; JSESSIONID=xyz; ...)"
                    value={cookieHeader}
                    onChange={(e) => setCookieHeader(e.target.value)}
                    disabled={isCookiePending}
                    className="font-mono text-xs min-h-[100px] resize-none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    La sessione dura circa 4 ore, poi dovrai ripetere l'operazione.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col border-t border-border/50 bg-muted/20 pt-6">
                <Button type="submit" className="w-full" disabled={isCookiePending}>
                  {isCookiePending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifica...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ClipboardPaste className="w-4 h-4" />
                      Accedi con questi cookie
                    </span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

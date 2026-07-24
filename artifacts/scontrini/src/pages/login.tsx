import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
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

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Connessione in corso...");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<string | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

      // Show progress messages while waiting
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

      // Poll every 2.5 seconds
      let attempts = 0;
      const MAX_ATTEMPTS = 72; // 3 minutes max

      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > MAX_ATTEMPTS) {
          clearInterval(msgInterval);
          stopPolling();
          setIsPending(false);
          toast({
            title: "Timeout",
            description: "Il login sta impiegando troppo tempo. Riprova.",
            variant: "destructive",
          });
          return;
        }

        try {
          const result = await pollJob(jobIdRef.current!);

          if (result.status === "pending") return; // still waiting

          clearInterval(msgInterval);
          stopPolling();
          setIsPending(false);

          if (result.status === "success") {
            setLocation("/");
          } else {
            toast({
              title: "Accesso negato",
              description: result.error ?? "Credenziali non valide o errore di sistema.",
              variant: "destructive",
            });
          }
        } catch {
          clearInterval(msgInterval);
          stopPolling();
          setIsPending(false);
          toast({
            title: "Errore di connessione",
            description: "Impossibile connettersi al servizio.",
            variant: "destructive",
          });
        }
      }, 2500);

    } catch (err) {
      setIsPending(false);
      const apiErr = err as { status?: number; data?: { error?: string }; message?: string };
      if (apiErr.status === 401) {
        toast({ title: "Accesso negato", description: (apiErr.data?.error) || "Credenziali non valide.", variant: "destructive" });
      } else {
        toast({ title: "Errore di connessione", description: apiErr.message || "Impossibile connettersi al servizio.", variant: "destructive" });
      }
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg border-primary/20">
        <CardHeader className="space-y-3 pb-6 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mx-auto mb-2">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-center text-xl text-primary font-semibold">App Scontrini Fiscali</CardTitle>
          <CardDescription className="text-center text-sm">
            Accesso tramite Fisconline per l'emissione di Documenti Commerciali Online
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
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
                data-testid="input-login-cf"
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
                  data-testid="input-login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                >
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
                  data-testid="input-login-pin"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPin ? "Nascondi PIN" : "Mostra PIN"}
                >
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
              <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs p-3 rounded border border-blue-100 dark:border-blue-900 mt-4">
                <p>Nota: Il sistema si connette al portale dell'Agenzia delle Entrate in tempo reale. L'operazione potrebbe richiedere 30-60 secondi.</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col border-t border-border/50 bg-muted/20 pt-6">
            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
              data-testid="button-login-submit"
            >
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
    </div>
  );
}

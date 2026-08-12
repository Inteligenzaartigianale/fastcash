import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, RefreshCw, CheckCircle2, Puzzle } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

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
  const [pollStatus, setPollStatus] = useState<"waiting" | "detected">("waiting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const appUrl = window.location.origin + (BASE || "");

  useEffect(() => {
    const doPoll = async () => {
      const ok = await checkStatus();
      if (ok) {
        setPollStatus("detected");
        if (pollRef.current) clearInterval(pollRef.current);
        setTimeout(() => setLocation("/"), 800);
      }
    };

    doPoll();
    pollRef.current = setInterval(doPoll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [setLocation]);

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
                <CardDescription className="text-xs mt-0.5">Nessuna credenziale da inserire nell'app</CardDescription>
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
                <span>Questa pagina entra automaticamente nell'app — non serve fare altro</span>
              </li>
            </ol>

          </CardContent>
        </Card>

      </div>
    </div>
  );
}

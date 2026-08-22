import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { AlertTriangle, CheckCircle2, KeyRound, Laptop, RefreshCw, ScanLine, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApiBase } from "@/lib/capacitor";
import {
  activateLicense,
  consumeLicenseTransfer,
  fetchLicenseStatus,
  generateLicenseTransfer,
  requestLicenseSupport,
  type LicenseState,
  type LicenseStatus,
} from "@/lib/license";

const stateStyle: Record<LicenseState, string> = {
  demo: "bg-amber-50 text-amber-800 border-amber-200",
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  expiring: "bg-orange-50 text-orange-800 border-orange-200",
  expired: "bg-red-50 text-red-800 border-red-200",
  suspended: "bg-red-50 text-red-800 border-red-200",
  device_not_authorized: "bg-violet-50 text-violet-800 border-violet-200",
};

const stateLabel: Record<LicenseState, string> = {
  demo: "Demo",
  active: "Attiva",
  expiring: "In scadenza",
  expired: "Scaduta",
  suspended: "Sospesa",
  device_not_authorized: "Su altro dispositivo",
};

function StatusIcon({ status }: { status: LicenseStatus }) {
  return status.canEmit
    ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
    : <AlertTriangle className="w-5 h-5 text-amber-600" />;
}

function TransferScanner({ onComplete }: { onComplete: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const elementId = "license-transfer-camera";
  const qc = useQueryClient();

  useEffect(() => {
    if (!scanning) return;
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;
    let active = true;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      decoded => {
        try {
          const value = JSON.parse(decoded) as { type?: string; token?: string };
          if (value.type !== "scontrini-license-transfer" || !value.token) {
            setMessage("Questo non è un QR di trasferimento licenza.");
            return;
          }
          setToken(value.token);
          setMessage("QR letto. Inserisci il PIN mostrato sul dispositivo precedente.");
          setScanning(false);
        } catch {
          setMessage("QR non riconosciuto.");
        }
      },
      () => undefined,
    ).catch(() => setMessage("Non posso aprire la fotocamera. Verifica il permesso e riprova."));

    return () => {
      active = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => undefined).finally(() => {
          if (active) scannerRef.current = null;
        });
      }
    };
  }, [scanning]);

  const transfer = useMutation({
    mutationFn: () => consumeLicenseTransfer(token, pin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["license-status"] });
      setMessage("Licenza trasferita su questo dispositivo.");
      onComplete();
    },
    onError: err => setMessage(err instanceof Error ? err.message : "Trasferimento non riuscito."),
  });

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <ScanLine className="w-4 h-4" /> Ricevi una licenza
      </div>
      {!token && !scanning && (
        <Button variant="outline" className="w-full" onClick={() => { setMessage(""); setScanning(true); }}>
          <Smartphone className="w-4 h-4 mr-2" /> Scansiona il QR di trasferimento
        </Button>
      )}
      <div id={elementId} className={scanning ? "overflow-hidden rounded-lg bg-black min-h-[210px]" : "hidden"} />
      {token && (
        <div className="space-y-2">
          <Label htmlFor="license-transfer-pin">PIN visualizzato sul vecchio dispositivo</Label>
          <div className="flex gap-2">
            <Input id="license-transfer-pin" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" />
            <Button disabled={pin.length !== 4 || transfer.isPending} onClick={() => transfer.mutate()}>
              {transfer.isPending ? "..." : "Conferma"}
            </Button>
          </div>
        </div>
      )}
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}

export function LicensePanel() {
  const qc = useQueryClient();
  const statusQuery = useQuery({ queryKey: ["license-status"], queryFn: fetchLicenseStatus, retry: false });
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferQr, setTransferQr] = useState("");
  const [transferPin, setTransferPin] = useState("");
  const [transferExpiry, setTransferExpiry] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["license-status"] });
  const activate = useMutation({
    mutationFn: () => activateLicense(code),
    onSuccess: status => {
      setCode("");
      setMessage(status.message);
      refresh();
    },
    onError: err => setMessage(err instanceof Error ? err.message : "Attivazione non riuscita."),
  });
  const createTransfer = useMutation({
    mutationFn: generateLicenseTransfer,
    onSuccess: async transfer => {
      const payload = JSON.stringify({
        type: "scontrini-license-transfer",
        token: transfer.token,
        server: `${window.location.origin}${getApiBase()}`,
      });
      setTransferQr(await QRCode.toDataURL(payload, { margin: 2, width: 300, errorCorrectionLevel: "M" }));
      setTransferPin(transfer.pin);
      setTransferExpiry(transfer.expiresAt);
      setShowTransfer(true);
    },
    onError: err => setMessage(err instanceof Error ? err.message : "Impossibile creare il trasferimento."),
  });

  const sendRequest = async (type: "activation" | "renewal" | "recovery") => {
    try {
      const note = window.prompt("Aggiungi una nota per l’assistenza (facoltativa):") ?? "";
      const { requestId } = await requestLicenseSupport(type, note);
      setMessage(`Richiesta inviata. Codice di riferimento: ${requestId.slice(0, 8).toUpperCase()}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Non riesco a inviare la richiesta.");
    }
  };

  if (statusQuery.isLoading) {
    return <div className="py-10 text-center text-sm text-gray-400">Verifica licenza...</div>;
  }
  if (statusQuery.isError || !statusQuery.data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Non riesco a verificare la licenza. Riconnetti ADE e riprova.
      </div>
    );
  }
  const status = statusQuery.data;
  const canTransfer = status.activeDevice && status.canEmit;

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border p-4 ${stateStyle[status.state]}`}>
        <div className="flex items-start gap-3">
          <StatusIcon status={status} />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Licenza {stateLabel[status.state]}</h2>
              <span className="text-xs font-bold uppercase tracking-wide">{status.plan === "a_vita" ? "A vita" : status.plan === "annuale" ? "Annuale" : "Non attivata"}</span>
            </div>
            <p className="mt-1 text-sm leading-5">{status.message}</p>
            {status.expiresOn && <p className="mt-2 text-xs">Scadenza: {new Date(`${status.expiresOn}T12:00:00`).toLocaleDateString("it-IT")}</p>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#1e3a5f]" />
          <h3 className="font-semibold text-gray-800">Canale fiscale</h3>
        </div>
        <p className="text-sm text-gray-700">Browser / estensione Chrome ADE</p>
        <p className="text-xs text-gray-500">L’integrazione ufficiale API REST ADE verrà resa selezionabile solo dopo l’accreditamento. La sessione fiscale non viene trasferita con la licenza.</p>
      </section>

      {(status.state === "demo" || status.state === "expired" || status.state === "suspended") && (
        <section className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1e3a5f]" />
            <h3 className="font-semibold text-gray-800">Attiva o rinnova</h3>
          </div>
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Incolla il codice licenza" />
          <Button className="w-full bg-[#1e3a5f]" disabled={code.trim().length < 30 || activate.isPending} onClick={() => activate.mutate()}>
            {activate.isPending ? "Verifica..." : "Attiva licenza"}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => sendRequest(status.state === "demo" ? "activation" : "renewal")}>
            Richiedi assistenza per {status.state === "demo" ? "l’attivazione" : "il rinnovo"}
          </Button>
        </section>
      )}

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Laptop className="w-5 h-5 text-[#1e3a5f]" />
          <div>
            <h3 className="font-semibold text-gray-800">Dispositivo autorizzato</h3>
            <p className="text-xs text-gray-500">Una licenza può emettere da un solo dispositivo alla volta.</p>
          </div>
        </div>
        {canTransfer ? (
          <Button variant="outline" className="w-full" disabled={createTransfer.isPending} onClick={() => createTransfer.mutate()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Trasferisci con QR
          </Button>
        ) : (
          <>
            <TransferScanner onComplete={refresh} />
            <Button variant="outline" className="w-full" onClick={() => sendRequest("recovery")}>
              Richiedi recupero per dispositivo perso o rotto
            </Button>
          </>
        )}
      </section>

      {message && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>}

      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Trasferisci licenza</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center">
            <p className="text-sm text-gray-600">Sul nuovo dispositivo apri Impostazioni → Licenza, scegli “Ricevi una licenza” e scansiona questo QR.</p>
            {transferQr && <img src={transferQr} className="mx-auto w-64 h-64" alt="QR per trasferire la licenza" />}
            <div className="rounded-xl bg-[#1e3a5f] px-4 py-3 text-white">
              <p className="text-xs uppercase tracking-wider opacity-80">PIN temporaneo</p>
              <p className="text-3xl font-bold tracking-[0.35em] ml-[0.35em]">{transferPin}</p>
            </div>
            <p className="text-xs text-gray-500">Valido fino alle {transferExpiry ? new Date(transferExpiry).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : ""}. Al termine il vecchio dispositivo non potrà più emettere.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
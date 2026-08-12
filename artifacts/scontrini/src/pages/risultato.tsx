import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Plus, LogOut, XCircle, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { useAnnullaDocumento, useGetDocumento, useLogout } from "@workspace/api-client-react";
import type { DocumentoResult, RigaDocumento } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { ivaLabel } from "@/lib/catalog";

export default function RisultatoPage() {
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const annullaMutation = useAnnullaDocumento();
  const [showAnnulla, setShowAnnulla] = useState(false);
  const [annullaError, setAnnullaError] = useState<string | null>(null);
  
  const documentId = new URLSearchParams(window.location.search).get("id") ?? "";
  const documentQuery = useGetDocumento(documentId, {
    query: {
      enabled: !!documentId,
      queryKey: ["/api/documenti", documentId],
    },
  });
  const archivedDocument = documentQuery.data;

  useEffect(() => {
    if (!documentId || (!documentQuery.isLoading && !archivedDocument)) {
      setLocation("/");
    }
  }, [documentId, documentQuery.isLoading, archivedDocument, setLocation]);

  if (documentQuery.isLoading || !archivedDocument) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background text-sm text-muted-foreground">Caricamento documento...</div>;
  }

  const result: DocumentoResult = {
    success: true,
    id: archivedDocument.id,
    numeroDocumento: archivedDocument.numeroDocumento,
    numeroProgressivo: archivedDocument.numeroProgressivo ?? "",
    dataEmissione: archivedDocument.dataEmissione,
  };
  const rows: RigaDocumento[] = archivedDocument.righe;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        setLocation("/login");
      }
    });
  };

  const handleNuovo = () => {
    setLocation("/");
  };

  const handleAnnulla = () => {
    setAnnullaError(null);
    annullaMutation.mutate(
      { id: archivedDocument.id },
      {
        onSuccess: () => {
          setShowAnnulla(false);
          void documentQuery.refetch();
        },
        onError: (error) => {
          const data = (error as { data?: { error?: string; details?: string | null } }).data;
          const details = data?.details && data.details !== "undefined" ? data.details : null;
          setAnnullaError(details ? `${data?.error ?? "ADE ha rifiutato l'annullamento"}: ${details}` : data?.error ?? error.message);
        },
      },
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="bg-primary text-primary-foreground py-3 px-4 sm:px-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-white"
            onClick={() => setLocation("/storico")}
            aria-label="Torna allo storico"
            title="Torna allo storico"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <FileText className="w-5 h-5 shrink-0" />
          <h1 className="font-semibold tracking-wide">Documento Emesso</h1>
        </div>
        <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-white" onClick={handleLogout} data-testid="button-logout">
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </header>
      
      <main className="flex-1 p-6 flex items-start justify-center">
        <Card className="w-full max-w-2xl shadow-md border-t-4 border-t-green-500">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-2xl text-green-700">Documento Trasmesso con Successo</CardTitle>
              <CardDescription className="text-base mt-2">
                Il documento commerciale è stato acquisito dall'Agenzia delle Entrate.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted p-4 rounded-md flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Numero Documento</p>
                <p className="text-lg font-mono font-bold text-foreground">{result.numeroDocumento}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm text-muted-foreground">Data Emissione</p>
                <p className="text-lg font-medium text-foreground">{result.dataEmissione}</p>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Riepilogo Voci</h3>
              <div className="border rounded-md divide-y overflow-hidden">
                {rows.map((row, i) => (
                  <div key={i} className="flex justify-between items-center p-3 text-sm bg-white">
                    <div className="flex-1">
                      <p className="font-medium">{row.descrizione || "Articolo"}</p>
                      <p className="text-muted-foreground text-xs">
                        {row.quantita} × € {formatCurrency(row.prezzoUnitario)} • {ivaLabel(row.aliquotaIva)}
                        {row.sconto ? ` • Sconto € ${formatCurrency(row.sconto)}` : ""}
                        {row.omaggio ? " • OMAGGIO" : ""}
                      </p>
                    </div>
                    <div className="font-mono font-medium">
                      € {formatCurrency((row.quantita * row.prezzoUnitario) - (row.sconto || 0))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 pt-6">
            {archivedDocument.tipoOperazione !== "Annullo" &&
              archivedDocument.tipoOperazione !== "Reso" &&
              archivedDocument.stato !== "Annullato" && (
              <>
                <Button
                  variant="outline"
                  className="w-full border-amber-300 text-amber-800 hover:bg-amber-50"
                  onClick={() => setLocation(`/?tipoOp=Reso&progressivo=${encodeURIComponent(archivedDocument.numeroDocumento ?? "")}`)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Avvia Reso
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => setShowAnnulla(true)}
                  disabled={annullaMutation.isPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Annulla documento
                </Button>
              </>
            )}
            {archivedDocument.stato === "Annullato" && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Documento annullato presso ADE.
              </div>
            )}
            {annullaMutation.isError && (
              <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <p className="font-semibold">ADE ha rifiutato l'annullamento.</p>
                <p className="mt-1 break-words">{annullaError ?? "Verifica i dati del documento e la sessione ADE."}</p>
              </div>
            )}
            <Button className="w-full" onClick={handleNuovo} data-testid="button-nuovo-doc">
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Documento
            </Button>
          </CardFooter>
        </Card>
      </main>
      {showAnnulla && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-gray-900">Conferma annullamento</h2>
            <p className="mt-2 text-sm text-gray-600">
              Verrà inviato ad ADE un annullo collegato al documento{" "}
              <strong>{archivedDocument.numeroDocumento}</strong>. Il documento originale resterà nello storico.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAnnulla(false)} disabled={annullaMutation.isPending}>
                No, torna indietro
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleAnnulla} disabled={annullaMutation.isPending}>
                {annullaMutation.isPending ? "Invio..." : "Conferma annullo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

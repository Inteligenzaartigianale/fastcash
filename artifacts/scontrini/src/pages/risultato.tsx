import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, FileText, Plus, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { useGetDocumento, useLogout } from "@workspace/api-client-react";
import type { DocumentoResult, RigaDocumento } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { ivaLabel } from "@/lib/catalog";

export default function RisultatoPage() {
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();
  
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
          <CardFooter className="pt-6 border-t bg-muted/20">
            <Button
              className="w-full"
              onClick={handleNuovo}
              data-testid="button-nuovo-doc"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Documento
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}

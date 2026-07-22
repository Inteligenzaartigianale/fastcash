import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useGetMe, useInviaDocumento, useLogout } from "@workspace/api-client-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { LogOut, Plus, Trash2, FileText, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RigaDocumento, PagamentoInput, DocumentoInputCorrispettivoNonRiscosso } from "@workspace/api-client-react/src/generated/api.schemas";

export default function HomePage() {
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: me } = useGetMe({ query: { enabled: !!isAuthenticated } });
  const logoutMutation = useLogout();
  const inviaMutation = useInviaDocumento();

  // Form State
  const [tipoOperazione, setTipoOperazione] = useState("Vendita/Prestazione");
  const [codiceLotteria, setCodiceLotteria] = useState("");
  const [righe, setRighe] = useState<RigaDocumento[]>([
    { quantita: 1, descrizione: "", prezzoUnitario: 0, aliquotaIva: "22", sconto: 0, omaggio: false }
  ]);
  
  const [pagamento, setPagamento] = useState<PagamentoInput>({
    contanti: 0,
    elettronico: 0,
    ticketRestaurant: 0,
    numeroTicket: "",
    scontoAPagare: 0,
    documentoCollegato: ""
  });

  const [nonRiscosso, setNonRiscosso] = useState<DocumentoInputCorrispettivoNonRiscosso>({
    emissioneFattura: false,
    prestazioniServizi: 0,
    creditoCessioneBene: 0
  });

  // Calculate Totals Real-time
  const totals = useMemo(() => {
    let imponibile = 0;
    let imposta = 0;
    let complessivo = 0;
    let scontoTotale = 0;
    
    // For payment validation
    let totaleDaPagare = 0;

    righe.forEach(r => {
      const qta = Number(r.quantita) || 0;
      const pu = Number(r.prezzoUnitario) || 0;
      const sc = Number(r.sconto) || 0;
      
      const prezzoComplessivo = qta * pu;
      let importoIva = 0;
      
      if (['22', '10', '5', '4'].includes(r.aliquotaIva)) {
        const aliq = Number(r.aliquotaIva) / 100;
        importoIva = prezzoComplessivo * aliq / (1 + aliq);
      }
      
      const rigaNetto = prezzoComplessivo - importoIva;
      
      imponibile += rigaNetto;
      imposta += importoIva;
      complessivo += (prezzoComplessivo - sc);
      scontoTotale += sc;
      
      if (!r.omaggio) {
        totaleDaPagare += (prezzoComplessivo - sc);
      }
    });

    const totalePagato = (Number(pagamento.contanti) || 0) + 
                         (Number(pagamento.elettronico) || 0) + 
                         (Number(pagamento.ticketRestaurant) || 0);
                         
    const totaleNonRiscosso = (Number(nonRiscosso.prestazioniServizi) || 0) + 
                              (Number(nonRiscosso.creditoCessioneBene) || 0);

    return { imponibile, imposta, complessivo, scontoTotale, totaleDaPagare, totalePagato, totaleNonRiscosso };
  }, [righe, pagamento, nonRiscosso]);

  // Sync cash to totally cover the gap if possible (optional convenience, but AE portal requires manual entry, we will just let user type it)

  const handleRigaChange = (index: number, field: keyof RigaDocumento, value: any) => {
    const newRighe = [...righe];
    newRighe[index] = { ...newRighe[index], [field]: value };
    setRighe(newRighe);
  };

  const addRiga = () => {
    setRighe([...righe, { quantita: 1, descrizione: "", prezzoUnitario: 0, aliquotaIva: "22", sconto: 0, omaggio: false }]);
  };

  const removeRiga = (index: number) => {
    if (righe.length === 1) return;
    setRighe(righe.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (righe.some(r => !r.descrizione || r.prezzoUnitario <= 0)) {
      toast({ title: "Errore", description: "Completa tutte le righe con descrizione e prezzo > 0", variant: "destructive" });
      return;
    }
    
    // Check totals roughly
    const difference = Math.abs(totals.totaleDaPagare - (totals.totalePagato + totals.totaleNonRiscosso + (Number(pagamento.scontoAPagare) || 0)));
    if (difference > 0.01) {
      toast({ title: "Attenzione", description: "Gli importi di pagamento non quadrano con il totale", variant: "destructive" });
    }

    inviaMutation.mutate({
      data: {
        tipoOperazione,
        codiceLotteria: codiceLotteria || undefined,
        righe,
        pagamento,
        corrispettivoNonRiscosso: nonRiscosso
      }
    }, {
      onSuccess: (res) => {
        if (res.success) {
          sessionStorage.setItem("scontrino_result", JSON.stringify(res));
          sessionStorage.setItem("scontrino_rows", JSON.stringify(righe));
          setLocation("/risultato");
        } else {
          toast({ title: "Errore Invio", description: "La richiesta è fallita", variant: "destructive" });
        }
      },
      onError: (err) => {
        toast({ title: "Errore API", description: err.error || "Errore durante l'invio", variant: "destructive" });
      }
    });
  };

  if (authLoading || !isAuthenticated) return null;

  const today = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' }).format(new Date());

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background pb-20">
      <header className="bg-primary text-primary-foreground py-3 px-6 shadow flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5" />
          <div>
            <h1 className="font-semibold text-lg leading-tight">Generazione Documento Commerciale</h1>
            {me && (
              <p className="text-xs text-primary-foreground/80 font-mono">
                {me.ragioneSociale} • P.IVA {me.partitaIva}
              </p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-white" onClick={() => logoutMutation.mutate(undefined, { onSettled: () => setLocation('/login') })}>
          <LogOut className="w-4 h-4 mr-2" />
          Esci
        </Button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* HEADER SECTION */}
          <div className="bg-white p-5 rounded-md border shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Tipo operazione</Label>
              <Select value={tipoOperazione} onValueChange={setTipoOperazione}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Vendita/Prestazione">Vendita/Prestazione</SelectItem>
                  <SelectItem value="Reso">Reso</SelectItem>
                  <SelectItem value="Annullo">Annullo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Codice lotteria (opzionale)</Label>
              <Input 
                value={codiceLotteria} 
                onChange={(e) => setCodiceLotteria(e.target.value.toUpperCase())} 
                placeholder="Es. ABC12345" 
                maxLength={8}
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label>Data emissione</Label>
              <Input value={today} readOnly className="bg-muted/50 text-muted-foreground font-mono" />
            </div>
          </div>

          {/* RIGHE SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary border-b border-primary/20 pb-1">Elementi contabili</h2>
            </div>
            
            <div className="bg-white rounded-md border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Q.tà</TableHead>
                    <TableHead className="min-w-[200px]">Descrizione</TableHead>
                    <TableHead className="w-28 text-right">Prezzo Unit. €</TableHead>
                    <TableHead className="w-28">IVA</TableHead>
                    <TableHead className="w-28 text-right">Sconto €</TableHead>
                    <TableHead className="w-20 text-center">Omaggio</TableHead>
                    <TableHead className="w-28 text-right font-semibold">Netto €</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righe.map((r, i) => {
                    const qta = Number(r.quantita) || 0;
                    const pu = Number(r.prezzoUnitario) || 0;
                    const sc = Number(r.sconto) || 0;
                    const comp = (qta * pu) - sc;
                    
                    return (
                      <TableRow key={i} className="group hover:bg-muted/20">
                        <TableCell>
                          <input type="number" min="0" step="1" className="table-cell-input text-center" value={r.quantita || ""} onChange={(e) => handleRigaChange(i, "quantita", parseFloat(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <input type="text" className="table-cell-input" placeholder="Descrizione bene/servizio" value={r.descrizione} onChange={(e) => handleRigaChange(i, "descrizione", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <input type="number" min="0" step="0.01" className="table-cell-input text-right font-mono" value={r.prezzoUnitario || ""} onChange={(e) => handleRigaChange(i, "prezzoUnitario", parseFloat(e.target.value))} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Select value={r.aliquotaIva} onValueChange={(v) => handleRigaChange(i, "aliquotaIva", v)}>
                            <SelectTrigger className="h-8 border-none shadow-none focus:ring-1 bg-transparent px-2 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="22">22%</SelectItem>
                              <SelectItem value="10">10%</SelectItem>
                              <SelectItem value="5">5%</SelectItem>
                              <SelectItem value="4">4%</SelectItem>
                              <SelectItem value="Esente">Esente</SelectItem>
                              <SelectItem value="Non soggette">Non soggette</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <input type="number" min="0" step="0.01" className="table-cell-input text-right text-red-600 font-mono" value={r.sconto || ""} onChange={(e) => handleRigaChange(i, "sconto", parseFloat(e.target.value))} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center items-center h-full">
                            <Checkbox checked={r.omaggio} onCheckedChange={(c) => handleRigaChange(i, "omaggio", !!c)} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right px-3 font-mono bg-muted/10">
                          {formatCurrency(comp)}
                        </TableCell>
                        <TableCell className="text-center">
                          <button type="button" onClick={() => removeRiga(i)} disabled={righe.length === 1} className="text-muted-foreground hover:text-destructive disabled:opacity-30 p-1 rounded-sm">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="p-2 border-t bg-muted/10">
                <Button type="button" variant="ghost" size="sm" onClick={addRiga} className="text-primary hover:bg-primary/10">
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi riga
                </Button>
              </div>
            </div>
          </div>

          {/* TOTALS BAR */}
          <div className="bg-primary/5 border border-primary/20 rounded-md p-4 grid grid-cols-2 md:grid-cols-4 gap-4 shadow-inner text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Imponibile lordo sconto</p>
              <p className="font-mono text-lg font-semibold">{formatCurrency(totals.imponibile)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Totale IVA</p>
              <p className="font-mono text-lg font-semibold">{formatCurrency(totals.imposta)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Sconto complessivo</p>
              <p className="font-mono text-lg font-semibold text-red-600">{formatCurrency(totals.scontoTotale)}</p>
            </div>
            <div className="bg-primary/10 -m-4 p-4 border-l border-primary/20 flex flex-col justify-center">
              <p className="text-primary font-medium text-xs uppercase tracking-wider mb-1">Totale Complessivo</p>
              <p className="font-mono text-2xl font-bold text-primary">€ {formatCurrency(totals.complessivo)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PAGAMENTO */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-primary border-b border-primary/20 pb-1">Pagamento</h2>
              <div className="bg-white p-5 rounded-md border shadow-sm space-y-4">
                <div className="grid grid-cols-[1fr_120px] items-center gap-4">
                  <Label className="font-normal text-muted-foreground">Contanti €</Label>
                  <Input type="number" step="0.01" min="0" className="text-right font-mono" value={pagamento.contanti || ""} onChange={(e) => setPagamento({...pagamento, contanti: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="grid grid-cols-[1fr_120px] items-center gap-4">
                  <Label className="font-normal text-muted-foreground">Elettronico €</Label>
                  <Input type="number" step="0.01" min="0" className="text-right font-mono" value={pagamento.elettronico || ""} onChange={(e) => setPagamento({...pagamento, elettronico: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="pt-2 border-t space-y-4">
                  <div className="grid grid-cols-[1fr_120px] items-center gap-4">
                    <Label className="font-normal text-muted-foreground">Ticket Restaurant €</Label>
                    <Input type="number" step="0.01" min="0" className="text-right font-mono" value={pagamento.ticketRestaurant || ""} onChange={(e) => setPagamento({...pagamento, ticketRestaurant: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div className="grid grid-cols-[1fr_180px] items-center gap-4">
                    <Label className="font-normal text-muted-foreground">Numero Ticket</Label>
                    <Input type="text" className="font-mono text-right text-xs" value={pagamento.numeroTicket || ""} onChange={(e) => setPagamento({...pagamento, numeroTicket: e.target.value})} placeholder="Facoltativo" />
                  </div>
                </div>
                <div className="pt-2 border-t space-y-4">
                  <div className="grid grid-cols-[1fr_120px] items-center gap-4">
                    <Label className="font-normal text-muted-foreground">Sconto a pagare €</Label>
                    <Input type="number" step="0.01" min="0" className="text-right font-mono text-red-600" value={pagamento.scontoAPagare || ""} onChange={(e) => setPagamento({...pagamento, scontoAPagare: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>
              </div>
            </div>

            {/* CORRISPETTIVO NON RISCOSSO */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-primary border-b border-primary/20 pb-1">Corrispettivo non riscosso</h2>
              <div className="bg-white p-5 rounded-md border shadow-sm space-y-4">
                <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded border border-muted">
                  <Checkbox id="fattura" checked={nonRiscosso.emissioneFattura} onCheckedChange={(c) => setNonRiscosso({...nonRiscosso, emissioneFattura: !!c})} />
                  <Label htmlFor="fattura" className="font-medium cursor-pointer">Emissione fattura collegata</Label>
                </div>
                <div className="grid grid-cols-[1fr_120px] items-center gap-4">
                  <Label className="font-normal text-muted-foreground">Prestazioni di servizi €</Label>
                  <Input type="number" step="0.01" min="0" className="text-right font-mono" value={nonRiscosso.prestazioniServizi || ""} onChange={(e) => setNonRiscosso({...nonRiscosso, prestazioniServizi: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="grid grid-cols-[1fr_120px] items-center gap-4">
                  <Label className="font-normal text-muted-foreground">Credito cessione bene €</Label>
                  <Input type="number" step="0.01" min="0" className="text-right font-mono" value={nonRiscosso.creditoCessioneBene || ""} onChange={(e) => setNonRiscosso({...nonRiscosso, creditoCessioneBene: parseFloat(e.target.value) || 0})} />
                </div>
                
                <div className="pt-6">
                  <Label className="block mb-2 font-normal text-muted-foreground text-sm">Riferimento doc. precedente (per Reso/Annullo)</Label>
                  <Input type="text" placeholder="Es. DCW..." className="font-mono text-sm" value={pagamento.documentoCollegato || ""} onChange={(e) => setPagamento({...pagamento, documentoCollegato: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] z-20 flex justify-end">
            <div className="w-full max-w-6xl mx-auto flex justify-between items-center px-4">
              <div className="hidden sm:block">
                <p className="text-sm text-muted-foreground">Da incassare: <span className="font-mono font-bold text-foreground">€ {formatCurrency(totals.totaleDaPagare)}</span></p>
                <p className="text-xs text-muted-foreground">Copertura inserita: € {formatCurrency(totals.totalePagato + totals.totaleNonRiscosso + (Number(pagamento.scontoAPagare) || 0))}</p>
              </div>
              <Button type="submit" size="lg" className="min-w-[200px]" disabled={inviaMutation.isPending} data-testid="button-submit-doc">
                {inviaMutation.isPending ? (
                  "Elaborazione in corso..."
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Emetti Documento
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useListDocumenti } from "@workspace/api-client-react";
import type { DocumentoArchiviato } from "@workspace/api-client-react";
import { ArrowLeft, CalendarDays, ChevronRight, History, ReceiptText, Search } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function DocumentRow({ document, onOpen, onReso }: { document: DocumentoArchiviato; onOpen: () => void; onReso?: () => void }) {
  const canReso = document.tipoOperazione === "Vendita/Prestazione" && document.stato !== "Annullato";
  return (
    <div className="flex w-full items-center gap-3 border-b bg-white px-4 py-3 transition-colors hover:bg-blue-50">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
          <ReceiptText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-800">{document.numeroDocumento}</span>
          <span className="mt-0.5 block text-xs text-gray-500">
            {formatDate(document.dataEmissione)} · {document.tipoOperazione} · {document.stato} · {document.righe.length} {document.righe.length === 1 ? "riga" : "righe"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm font-bold text-gray-800">€ {formatCurrency(document.totale)}</span>
          <ChevronRight className="ml-auto mt-0.5 h-4 w-4 text-gray-300" />
        </span>
      </button>
      {canReso && onReso && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onReso(); }}
          className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 active:bg-amber-200"
          title="Avvia reso"
        >
          Reso
        </button>
      )}
    </div>
  );
}

export default function StoricoPage() {
  const [, setLocation] = useLocation();
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [submittedFilters, setSubmittedFilters] = useState({ dataDa: "", dataA: "" });

  const documentiQuery = useListDocumenti({
    dataDa: submittedFilters.dataDa || undefined,
    dataA: submittedFilters.dataA || undefined,
  });
  const documenti = documentiQuery.data ?? [];
  const filterError = submittedFilters.dataDa && submittedFilters.dataA && submittedFilters.dataDa > submittedFilters.dataA;

  const totalePeriodo = useMemo(
    () => documenti.reduce((sum, document) => sum + document.totale, 0),
    [documenti],
  );

  const search = () => {
    if (dataDa && dataA && dataDa > dataA) return;
    setSubmittedFilters({ dataDa, dataA });
  };

  const reset = () => {
    setDataDa("");
    setDataA("");
    setSubmittedFilters({ dataDa: "", dataA: "" });
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-50">
      <header className="flex shrink-0 items-center gap-3 bg-[#1e3a5f] px-4 py-3 text-white shadow">
        <button type="button" onClick={() => setLocation("/")} className="rounded-md p-1 hover:bg-white/10" aria-label="Torna alla vendita">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <History className="h-5 w-5" />
          <h1 className="truncate text-base font-bold">Storico scontrini</h1>
        </div>
        <span className="text-xs text-white/70">{documenti.length} documenti</span>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto p-4 pb-20">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#1e3a5f]" />
            <h2 className="text-sm font-semibold text-gray-800">Cerca per periodo</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-gray-500">Da data</span>
              <Input type="date" value={dataDa} onChange={event => setDataDa(event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-gray-500">A data</span>
              <Input type="date" value={dataA} onChange={event => setDataA(event.target.value)} />
            </label>
            <Button type="button" onClick={search} disabled={!!(dataDa && dataA && dataDa > dataA)} className="bg-[#1e3a5f]">
              <Search className="mr-2 h-4 w-4" /> Cerca
            </Button>
            <Button type="button" variant="outline" onClick={reset}>Azzera</Button>
          </div>
          {filterError && <p className="mt-2 text-xs text-red-600">La data iniziale non può essere successiva alla data finale.</p>}
        </section>

        <section className="mt-4 overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Documenti emessi</h2>
              <p className="text-xs text-gray-500">Solo DCO accettati dall’Agenzia delle Entrate</p>
            </div>
            {documenti.length > 0 && <span className="font-mono text-xs text-gray-500">Totale € {formatCurrency(totalePeriodo)}</span>}
          </div>
          {documentiQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Caricamento storico...</div>
          ) : documentiQuery.isError ? (
            <div className="p-8 text-center text-sm text-red-500">Impossibile caricare lo storico.</div>
          ) : documenti.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-gray-400">
              <ReceiptText className="h-8 w-8 text-gray-300" />
              <p className="text-sm">Nessuno scontrino nel periodo selezionato.</p>
            </div>
          ) : (
            documenti.map(document => (
              <DocumentRow
                key={document.id}
                document={document}
                onOpen={() => setLocation(`/risultato?id=${encodeURIComponent(document.id)}`)}
                onReso={() => setLocation(`/?tipoOp=Reso&progressivo=${encodeURIComponent(document.numeroDocumento ?? "")}`)}
              />
            ))
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
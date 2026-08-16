import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCatalog,
  createReparto, updateReparto, deleteReparto,
  createArticolo, updateArticolo, deleteArticolo,
  updateImpostazioni,
  type Catalog, type Reparto, type Articolo, type AliquotaIva,
  ALIQUOTE_IVA, NATURE_IVA, isNaturaIva,
} from "@/lib/catalog";
import { Plus, Pencil, Trash2, Check, Keyboard, Ticket, Banknote, ListFilter, ShoppingCart } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { GuidaChat } from "@/components/guida-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import { Switch } from "@/components/ui/switch";

import { SIZES } from "@/lib/articolo-size";

const IVA_OPTIONS: AliquotaIva[] = ["22", "10", "5", "4", "N1", "N2", "N3", "N4", "N5", "N6"];
const COLORI = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#3b82f6","#8b5cf6","#ec4899","#6b7280","#1e3a5f"];

export default function AdminPage() {
  const [tab, setTab] = useState<"guida" | "generali" | "pagamento" | "reparti" | "articoli" | "aliquote" | "visualizzazione">("guida");
  const qc = useQueryClient();
  const { data: catalog, isLoading } = useQuery({ queryKey: ["catalog"], queryFn: fetchCatalog });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["catalog"] });

  if (isLoading || !catalog) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Caricamento...</div>
      </div>
    );
  }

  const size = catalog.impostazioni?.dimensioneTasti ?? "S";
  const setSize = (value: typeof size) => {
    updateImpostazioni({ dimensioneTasti: value }).then(invalidate);
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-50">
      <header className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center gap-3 shrink-0 shadow">
        <h1 className="font-bold text-base">⚙️ Impostazioni</h1>
      </header>

      <div className="bg-white border-b px-2 flex gap-0 shrink-0 overflow-x-auto">
        {(["guida", "generali", "pagamento", "reparti", "articoli", "aliquote", "visualizzazione"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${tab === t ? "border-[#1e3a5f] text-[#1e3a5f]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
         >{t}</button>
        ))}
      </div>

      <div className={`flex-1 overflow-y-auto max-w-2xl w-full mx-auto ${tab === "guida" ? "p-3 flex flex-col" : "p-4"}`}>
         {tab === "guida"    && <GuidaChat />}
         {tab === "generali" && <GeneraliPanel catalog={catalog} onRefresh={invalidate} />}
         {tab === "pagamento" && <PagamentoPanel catalog={catalog} onRefresh={invalidate} />}
         {tab === "reparti"  && <RepartiPanel  catalog={catalog} onRefresh={invalidate} />}
        {tab === "articoli" && <ArticoliPanel catalog={catalog} onRefresh={invalidate} />}
        {tab === "aliquote" && <AliquotePanel />}
        {tab === "visualizzazione" && (
          <div className="space-y-6">
            <DcoLimitPanel catalog={catalog} onRefresh={invalidate} />
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Dimensione tasti articoli</h2>
              <div className="flex gap-3 flex-wrap">
                {SIZES.map(s => (
                  <button
                    key={s.label}
                    onClick={() => setSize(s.label)}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 font-bold transition-all active:scale-95 ${size === s.label ? "border-[#1e3a5f] bg-[#1e3a5f] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"}`}
                    style={{ width: s.px, height: s.px, fontSize: Math.max(10, s.px / 10) }}
                  >
                    <span>{s.label}</span>
                    <span className="text-[10px] font-normal opacity-70 mt-1">{s.px}px</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">La dimensione viene salvata automaticamente e applicata alla schermata di vendita.</p>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function GeneraliPanel({ catalog, onRefresh }: { catalog: Catalog; onRefresh: () => void }) {
  const [saving, setSaving] = useState(false);
  const tastieraFissa = catalog.impostazioni?.tastieraFissa ?? false;
  const mostraTicket = catalog.impostazioni?.mostraTicket ?? false;
  const gestioneResto = catalog.impostazioni?.gestioneResto ?? false;
  const mostraTipoOperazione = catalog.impostazioni?.mostraTipoOperazione ?? false;

  const toggleTastiera = async (checked: boolean) => {
    setSaving(true);
    try {
      await updateImpostazioni({ tastieraFissa: checked });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const toggleTicket = async (checked: boolean) => {
    setSaving(true);
    try {
      await updateImpostazioni({ mostraTicket: checked });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const toggleGestioneResto = async (checked: boolean) => {
    setSaving(true);
    try {
      await updateImpostazioni({ gestioneResto: checked });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const toggleMostraTipoOperazione = async (checked: boolean) => {
    setSaving(true);
    try {
      await updateImpostazioni({ mostraTipoOperazione: checked });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Impostazioni generali</h2>
        <p className="text-xs text-gray-400 mt-1">Personalizza il comportamento della schermata di vendita.</p>
      </div>
      <div className="bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center shrink-0">
          <Keyboard className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Tastiera numerica fissa</p>
          <p className="text-xs text-gray-500 mt-1">
            Mostra sempre la tastiera per l’inserimento dell’importo libero nel carrello.
            È adattata agli schermi desktop e mobile e non usa la tastiera del dispositivo.
          </p>
        </div>
        <Switch checked={tastieraFissa} disabled={saving} onCheckedChange={toggleTastiera} />
      </div>
      <p className="text-[11px] text-gray-400">
        Disattivando questa opzione tornerà disponibile il pulsante che apre la tastiera in una finestra.
      </p>
      <div className="bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center shrink-0">
          <Ticket className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Mostra pagamento Ticket</p>
          <p className="text-xs text-gray-500 mt-1">
            Visualizza o nascondi la tab Ticket nella schermata di pagamento. Disattivala se usi raramente i buoni pasto.
          </p>
        </div>
        <Switch checked={mostraTicket} disabled={saving} onCheckedChange={toggleTicket} />
      </div>
      <div className="bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center shrink-0">
          <Banknote className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Gestione resto</p>
          <p className="text-xs text-gray-500 mt-1">
            Mostra il campo “Incassato” e calcola il resto per i pagamenti in contanti.
            Se disattivata, al DCO viene inviato solo il totale effettivo del documento.
          </p>
        </div>
        <Switch checked={gestioneResto} disabled={saving} onCheckedChange={toggleGestioneResto} />
      </div>
      <p className="text-[11px] text-gray-400">
        Questa opzione è disattivata di default per mantenere il flusso ADE il più semplice possibile.
      </p>
      <div className="bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center shrink-0">
          <ListFilter className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Mostra tipo documento</p>
          <p className="text-xs text-gray-500 mt-1">
            Mostra in alto a destra nella cassa il menu per scegliere Vendita/Prestazione, Reso o Annullo.
            Se disattivata, viene usata automaticamente Vendita/Prestazione.
          </p>
        </div>
        <Switch checked={mostraTipoOperazione} disabled={saving} onCheckedChange={toggleMostraTipoOperazione} />
      </div>
    </div>
  );
}

function PagamentoPanel({ catalog, onRefresh }: { catalog: Catalog; onRefresh: () => void }) {
  const [saving, setSaving] = useState(false);
  const carrelloLargo = catalog.impostazioni?.carrelloLargo ?? false;

  const toggleCarrelloLargo = async (checked: boolean) => {
    setSaving(true);
    try {
      await updateImpostazioni({ carrelloLargo: checked });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Impostazioni pagamento e carrello</h2>
        <p className="text-xs text-gray-400 mt-1">Configura la visualizzazione del carrello nella schermata di vendita.</p>
      </div>
      <div className="bg-white rounded-xl border p-4 shadow-sm flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center shrink-0">
          <ShoppingCart className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Carrello largo</p>
          <p className="text-xs text-gray-500 mt-1">
            Allarga il pannello del carrello nella schermata mobile (da 96px a 144px).
            Utile quando le descrizioni degli articoli sono più lunghe.
          </p>
        </div>
        <Switch checked={carrelloLargo} disabled={saving} onCheckedChange={toggleCarrelloLargo} />
      </div>
    </div>
  );
}

function DcoLimitPanel({ catalog, onRefresh }: { catalog: Catalog; onRefresh: () => void }) {
  const [value, setValue] = useState<string>(
    catalog.impostazioni?.importoMassimoDco == null ? "" : String(catalog.impostazioni.importoMassimoDco),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = value.trim() === "" ? null : Number(value.replace(",", "."));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    setSaving(true);
    try {
      await updateImpostazioni({ importoMassimoDco: parsed });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Limite importo Documento Commerciale</h2>
        <p className="text-xs text-gray-400 mt-1">
          Impedisce di emettere un DCO con un totale superiore alla soglia impostata. Lascia vuoto per disattivare il controllo.
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Importo massimo €</Label>
          <CurrencyInput
            className="w-full h-9 rounded border px-3 text-right font-mono text-sm"
            value={value === "" ? 0 : Number(value.replace(",", "."))}
            onChange={v => setValue(v === 0 ? "" : String(v))}
          />
        </div>
        <Button onClick={save} disabled={saving} className="bg-[#1e3a5f]">
          {saving ? "Salvo..." : "Salva"}
        </Button>
      </div>
      {catalog.impostazioni?.importoMassimoDco != null && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Limite attivo: <strong>€ {catalog.impostazioni.importoMassimoDco.toFixed(2)}</strong>
        </p>
      )}
    </div>
  );
}

function AliquotePanel() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Aliquote IVA disponibili</h2>
        <p className="text-xs text-gray-400 mt-1">Queste sono le aliquote selezionabili negli articoli e nelle righe del documento.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ALIQUOTE_IVA.map(({ value, label }) => (
          <div key={value} className="rounded-xl border bg-white p-3 text-center shadow-sm">
            <p className="text-lg font-bold text-[#1e3a5f]">{value}%</p>
            <p className="text-[11px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Nature per IVA 0%</h2>
        <p className="text-xs text-gray-400 mt-1">Seleziona la natura nel tab Articoli quando un prodotto non è imponibile. Il codice viene trasmesso ad ADE nella riga del documento.</p>
      </div>
      <div className="space-y-2">
        {NATURE_IVA.map(natura => (
          <div key={natura.value} className="bg-white rounded-xl border p-3 shadow-sm flex items-start gap-3">
            <span className="w-10 h-8 rounded-lg bg-amber-100 text-amber-800 font-bold text-sm flex items-center justify-center shrink-0">{natura.value}</span>
            <div>
              <p className="text-sm font-medium text-gray-800">{natura.label.replace(`${natura.value} — `, "")}</p>
              <p className="text-xs text-gray-500 mt-0.5">{natura.description}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 border-t pt-3">
        Riferimento: tracciato ufficiale Documento Commerciale ADE, campo Natura (codici N1–N6).
      </p>
    </div>
  );
}

// ── REPARTI ───────────────────────────────────────────────────────────────────
function RepartiPanel({ catalog, onRefresh }: { catalog: { reparti: Reparto[]; articoli: Articolo[] }; onRefresh: () => void }) {
  const [editing, setEditing] = useState<Reparto | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nome, setNome] = useState("");
  const [colore, setColore] = useState(COLORI[0]);

  const openEdit = (r: Reparto) => { setEditing(r); setNome(r.nome); setColore(r.colore); };
  const close = () => { setEditing(null); setShowNew(false); setNome(""); setColore(COLORI[0]); };

  const handleSave = async () => {
    if (!nome.trim()) return;
    if (editing) await updateReparto(editing.id, { nome: nome.trim(), colore });
    else await createReparto(nome.trim(), colore);
    onRefresh(); close();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{catalog.reparti.length} reparti</p>
        <Button size="sm" onClick={() => { setShowNew(true); setEditing(null); setNome(""); setColore(COLORI[0]); }} className="bg-[#1e3a5f]">
          <Plus className="w-4 h-4 mr-1" /> Nuovo
        </Button>
      </div>

      {catalog.reparti.map((r) => (
        <div key={r.id} className="bg-white rounded-xl border p-3.5 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: r.colore }}>{r.nome[0]}</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800">{r.nome}</p>
            <p className="text-xs text-gray-400">{catalog.articoli.filter(a => a.repartoId === r.id).length} articoli</p>
          </div>
          <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50"><Pencil className="w-4 h-4" /></button>
          <button onClick={async () => { if (confirm("Elimina reparto e tutti gli articoli?")) { await deleteReparto(r.id); onRefresh(); } }} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}

      {catalog.reparti.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">Nessun reparto. Creane uno!</p>
      )}

      <Dialog open={showNew || editing !== null} onOpenChange={close}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Modifica reparto" : "Nuovo reparto"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nome reparto</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Alimentari" autoFocus
                onKeyDown={e => e.key === "Enter" && handleSave()} />
            </div>
            <div className="space-y-1.5">
              <Label>Colore</Label>
              <div className="flex flex-wrap gap-2">
                {COLORI.map(c => (
                  <button key={c} onClick={() => setColore(c)} className="w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center" style={{ backgroundColor: c }}>
                    {colore === c && <Check className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={close}>Annulla</Button>
              <Button className="flex-1 bg-[#1e3a5f]" onClick={handleSave}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── ARTICOLI ──────────────────────────────────────────────────────────────────
function ArticoliPanel({ catalog, onRefresh }: { catalog: { reparti: Reparto[]; articoli: Articolo[] }; onRefresh: () => void }) {
  const [editing, setEditing] = useState<Articolo | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [filterRep, setFilterRep] = useState<string>("tutti");
  const [form, setForm] = useState<Omit<Articolo, "id">>({
    nome: "", prezzoUnitario: 0, aliquotaIva: "22",
    repartoId: catalog.reparti[0]?.id ?? "", giacenza: 0, pezziVenduti: 0, sogliaSottoscorta: 0, attivo: true,
  });

  const openNew = () => {
    setShowNew(true); setEditing(null);
    setForm({ nome: "", prezzoUnitario: 0, aliquotaIva: "22", repartoId: catalog.reparti[0]?.id ?? "", giacenza: 0, pezziVenduti: 0, sogliaSottoscorta: 0, attivo: true });
  };
  const openEdit = (a: Articolo) => { setEditing(a); setShowNew(false); setForm({ nome: a.nome, prezzoUnitario: a.prezzoUnitario, aliquotaIva: isNaturaIva(a.aliquotaIva) ? a.aliquotaIva : a.aliquotaIva as AliquotaIva, repartoId: a.repartoId, giacenza: a.giacenza ?? 0, pezziVenduti: a.pezziVenduti ?? 0, sogliaSottoscorta: a.sogliaSottoscorta ?? 0, attivo: a.attivo }); };
  const close = () => { setEditing(null); setShowNew(false); };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.repartoId) return;
    if (editing) await updateArticolo(editing.id, form);
    else await createArticolo(form);
    onRefresh(); close();
  };

  const articoliFiltrati = filterRep === "tutti"
    ? catalog.articoli
    : catalog.articoli.filter(a => a.repartoId === filterRep);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* Filtro reparto */}
        <div className="flex gap-2 flex-1 overflow-x-auto pb-0.5">
          <button
            onClick={() => setFilterRep("tutti")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterRep === "tutti" ? "bg-[#1e3a5f] text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}
          >Tutti</button>
          {catalog.reparti.map(r => (
            <button
              key={r.id}
              onClick={() => setFilterRep(r.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterRep === r.id ? "text-white" : "bg-white border text-gray-600 hover:opacity-80"}`}
              style={filterRep === r.id ? { backgroundColor: r.colore } : {}}
            >{r.nome}</button>
          ))}
        </div>
        <Button size="sm" onClick={openNew} className="bg-[#1e3a5f] shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Nuovo
        </Button>
      </div>

      {articoliFiltrati.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">Nessun articolo. Aggiungine uno!</p>
      )}

      {articoliFiltrati.map(art => {
        const rep = catalog.reparti.find(r => r.id === art.repartoId);
        const stock = art.giacenza ?? 0;
        const stockClass = stock <= 0 ? "border-red-300" : stock <= (art.sogliaSottoscorta ?? 0) ? "border-orange-300" : "border-gray-200";
        return (
          <div key={art.id} className={`bg-white rounded-xl border-2 p-3.5 flex items-center gap-3 shadow-sm ${stockClass} ${!art.attivo ? "opacity-50" : ""}`}>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: rep?.colore ?? "#9ca3af" }} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800">{art.nome}</p>
              <p className="text-xs text-gray-400">{rep?.nome} · {isNaturaIva(art.aliquotaIva) ? `IVA 0% · ${art.aliquotaIva}` : `IVA ${art.aliquotaIva}%`}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-gray-800 text-sm font-mono">€ {Number(art.prezzoUnitario).toFixed(2)}</p>
              <p className={`text-[10px] font-mono ${stock <= 0 ? "text-red-600" : stock <= (art.sogliaSottoscorta ?? 0) ? "text-orange-600" : "text-gray-400"}`}>
                Scorta: {stock} · Venduti: {art.pezziVenduti ?? 0}
              </p>
            </div>
            <Switch checked={art.attivo} onCheckedChange={async v => { await updateArticolo(art.id, { attivo: v }); onRefresh(); }} />
            <button onClick={() => openEdit(art)} className="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50"><Pencil className="w-4 h-4" /></button>
            <button onClick={async () => { if (confirm("Eliminare l'articolo?")) { await deleteArticolo(art.id); onRefresh(); } }} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
          </div>
        );
      })}

      <Dialog open={showNew || editing !== null} onOpenChange={close}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Modifica articolo" : "Nuovo articolo"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nome articolo</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Es. Pane integrale" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Reparto</Label>
              <Select value={form.repartoId} onValueChange={v => setForm(f => ({ ...f, repartoId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona reparto" /></SelectTrigger>
                <SelectContent>
                  {catalog.reparti.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prezzo € (IVA incl.)</Label>
                <CurrencyInput className="w-full h-9 rounded border px-3 text-right font-mono text-sm" value={form.prezzoUnitario} onChange={v => setForm(f => ({ ...f, prezzoUnitario: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Aliquota IVA</Label>
                <Select value={form.aliquotaIva} onValueChange={v => setForm(f => ({ ...f, aliquotaIva: v as AliquotaIva }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{isNaturaIva(o) ? `IVA 0% · ${o}` : `${o}%`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Giacenza</Label>
                <Input type="number" step="1" value={form.giacenza} onChange={e => setForm(f => ({ ...f, giacenza: Number(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Venduti</Label>
                <Input type="number" step="1" min="0" value={form.pezziVenduti} onChange={e => setForm(f => ({ ...f, pezziVenduti: Math.max(0, Number(e.target.value) || 0) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Sottoscorta</Label>
                <Input type="number" step="1" min="0" value={form.sogliaSottoscorta} onChange={e => setForm(f => ({ ...f, sogliaSottoscorta: Math.max(0, Number(e.target.value) || 0) }))} />
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Sotto la soglia il bordo diventa arancione; a zero o in negativo diventa rosso. La vendita resta sempre consentita.
            </p>
            <label className="flex items-center gap-3 cursor-pointer pt-1">
              <Switch checked={form.attivo} onCheckedChange={v => setForm(f => ({ ...f, attivo: v }))} />
              <span className="text-sm text-gray-700">Articolo attivo (visibile in cassa)</span>
            </label>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={close}>Annulla</Button>
              <Button className="flex-1 bg-[#1e3a5f]" onClick={handleSave}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

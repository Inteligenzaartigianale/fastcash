import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCatalog,
  createReparto, updateReparto, deleteReparto,
  createArticolo, updateArticolo, deleteArticolo,
  type Reparto, type Articolo, type AliquotaIva,
} from "@/lib/catalog";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import { Switch } from "@/components/ui/switch";

import { useArticoloSize, SIZES } from "@/lib/articolo-size";

const IVA_OPTIONS: AliquotaIva[] = ["22", "10", "5", "4", "Esente", "Non soggette"];
const COLORI = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#3b82f6","#8b5cf6","#ec4899","#6b7280","#1e3a5f"];

export default function AdminPage() {
  const [tab, setTab] = useState<"reparti" | "articoli" | "visualizzazione">("reparti");
  const { size, setSize } = useArticoloSize();
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

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-50">
      <header className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center gap-3 shrink-0 shadow">
        <h1 className="font-bold text-base">⚙️ Impostazioni</h1>
      </header>

      <div className="bg-white border-b px-4 flex gap-1 shrink-0">
        {(["reparti", "articoli", "visualizzazione"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-[#1e3a5f] text-[#1e3a5f]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >{t}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto">
        {tab === "reparti"  && <RepartiPanel  catalog={catalog} onRefresh={invalidate} />}
        {tab === "articoli" && <ArticoliPanel catalog={catalog} onRefresh={invalidate} />}
        {tab === "visualizzazione" && (
          <div className="space-y-6">
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
    repartoId: catalog.reparti[0]?.id ?? "", attivo: true,
  });

  const openNew = () => {
    setShowNew(true); setEditing(null);
    setForm({ nome: "", prezzoUnitario: 0, aliquotaIva: "22", repartoId: catalog.reparti[0]?.id ?? "", attivo: true });
  };
  const openEdit = (a: Articolo) => { setEditing(a); setShowNew(false); setForm({ nome: a.nome, prezzoUnitario: a.prezzoUnitario, aliquotaIva: a.aliquotaIva, repartoId: a.repartoId, attivo: a.attivo }); };
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
        return (
          <div key={art.id} className={`bg-white rounded-xl border p-3.5 flex items-center gap-3 shadow-sm ${!art.attivo ? "opacity-50" : ""}`}>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: rep?.colore ?? "#9ca3af" }} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800">{art.nome}</p>
              <p className="text-xs text-gray-400">{rep?.nome} · IVA {art.aliquotaIva === "Esente" ? "Esente" : art.aliquotaIva === "Non soggette" ? "Non sogg." : art.aliquotaIva + "%"}</p>
            </div>
            <p className="font-bold text-gray-800 text-sm font-mono shrink-0">€ {Number(art.prezzoUnitario).toFixed(2)}</p>
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
                    {IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o === "Esente" || o === "Non soggette" ? o : `${o}%`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
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

import { useState } from "react";
import { useLocation } from "wouter";
import {
  loadCatalog, saveCatalog, type Catalog, type Reparto, type Categoria, type Articolo, type AliquotaIva,
  addReparto, updateReparto, deleteReparto,
  addCategoria, updateCategoria, deleteCategoria,
  addArticolo, updateArticolo, deleteArticolo,
} from "@/lib/catalog";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import { Switch } from "@/components/ui/switch";

const IVA_OPTIONS: AliquotaIva[] = ["22", "10", "5", "4", "Esente", "Non soggette"];
const COLORI = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#3b82f6","#8b5cf6","#ec4899","#6b7280","#1e3a5f"];

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [catalog, setCatalog] = useState<Catalog>(loadCatalog);
  const [tab, setTab] = useState<"reparti" | "categorie" | "articoli">("reparti");

  const save = (c: Catalog) => { setCatalog(c); saveCatalog(c); };

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center gap-3 shrink-0 shadow">
        <button onClick={() => setLocation("/")} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">Gestione Catalogo</h1>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-4 flex gap-1 shrink-0">
        {(["reparti", "categorie", "articoli"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-[#1e3a5f] text-[#1e3a5f]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >{t}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto">
        {tab === "reparti" && <RepartiPanel catalog={catalog} onSave={save} />}
        {tab === "categorie" && <CategoriePanel catalog={catalog} onSave={save} />}
        {tab === "articoli" && <ArticoliPanel catalog={catalog} onSave={save} />}
      </div>
    </div>
  );
}

// ── REPARTI ───────────────────────────────────────────────────────────────────

function RepartiPanel({ catalog, onSave }: { catalog: Catalog; onSave: (c: Catalog) => void }) {
  const [editing, setEditing] = useState<Reparto | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nome, setNome] = useState("");
  const [colore, setColore] = useState(COLORI[0]);

  const openEdit = (r: Reparto) => { setEditing(r); setNome(r.nome); setColore(r.colore); };

  const handleSave = () => {
    if (!nome.trim()) return;
    if (editing) {
      onSave(updateReparto(catalog, editing.id, { nome: nome.trim(), colore }));
    } else {
      onSave(addReparto(catalog, nome.trim(), colore));
    }
    setEditing(null); setShowNew(false); setNome(""); setColore(COLORI[0]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{catalog.reparti.length} reparti</p>
        <Button size="sm" onClick={() => { setShowNew(true); setEditing(null); setNome(""); setColore(COLORI[0]); }} className="bg-[#1e3a5f]">
          <Plus className="w-4 h-4 mr-1" /> Nuovo
        </Button>
      </div>

      {catalog.reparti.map(r => (
        <div key={r.id} className="bg-white rounded-xl border p-3.5 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold" style={{ backgroundColor: r.colore }}>
            {r.nome[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800">{r.nome}</p>
            <p className="text-xs text-gray-400">{catalog.categorie.filter(c => c.repartoId === r.id).length} categorie</p>
          </div>
          <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => { if (confirm("Elimina reparto e tutte le categorie/articoli collegati?")) onSave(deleteReparto(catalog, r.id)); }} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <Dialog open={showNew || editing !== null} onOpenChange={() => { setShowNew(false); setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Modifica reparto" : "Nuovo reparto"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nome reparto</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Alimentari" autoFocus />
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
              <Button variant="outline" className="flex-1" onClick={() => { setShowNew(false); setEditing(null); }}>Annulla</Button>
              <Button className="flex-1 bg-[#1e3a5f]" onClick={handleSave}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── CATEGORIE ─────────────────────────────────────────────────────────────────

function CategoriePanel({ catalog, onSave }: { catalog: Catalog; onSave: (c: Catalog) => void }) {
  const [editing, setEditing] = useState<Categoria | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nome, setNome] = useState("");
  const [repartoId, setRepartoId] = useState(catalog.reparti[0]?.id ?? "");

  const openEdit = (c: Categoria) => { setEditing(c); setNome(c.nome); setRepartoId(c.repartoId); };

  const handleSave = () => {
    if (!nome.trim() || !repartoId) return;
    if (editing) {
      onSave(updateCategoria(catalog, editing.id, { nome: nome.trim(), repartoId }));
    } else {
      onSave(addCategoria(catalog, nome.trim(), repartoId));
    }
    setEditing(null); setShowNew(false); setNome("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{catalog.categorie.length} categorie</p>
        <Button size="sm" onClick={() => { setShowNew(true); setEditing(null); setNome(""); setRepartoId(catalog.reparti[0]?.id ?? ""); }} className="bg-[#1e3a5f]">
          <Plus className="w-4 h-4 mr-1" /> Nuova
        </Button>
      </div>

      {catalog.reparti.map(rep => {
        const cats = catalog.categorie.filter(c => c.repartoId === rep.id);
        if (cats.length === 0) return null;
        return (
          <div key={rep.id}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1" style={{ color: rep.colore }}>{rep.nome}</p>
            {cats.map(cat => (
              <div key={cat.id} className="bg-white rounded-xl border p-3.5 flex items-center gap-3 shadow-sm mb-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{cat.nome}</p>
                  <p className="text-xs text-gray-400">{catalog.articoli.filter(a => a.categoriaId === cat.id).length} articoli</p>
                </div>
                <button onClick={() => openEdit(cat)} className="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => { if (confirm("Elimina categoria e tutti gli articoli collegati?")) onSave(deleteCategoria(catalog, cat.id)); }} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        );
      })}

      <Dialog open={showNew || editing !== null} onOpenChange={() => { setShowNew(false); setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Modifica categoria" : "Nuova categoria"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nome categoria</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Formaggi" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Reparto</Label>
              <Select value={repartoId} onValueChange={setRepartoId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {catalog.reparti.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setShowNew(false); setEditing(null); }}>Annulla</Button>
              <Button className="flex-1 bg-[#1e3a5f]" onClick={handleSave}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── ARTICOLI ──────────────────────────────────────────────────────────────────

function ArticoliPanel({ catalog, onSave }: { catalog: Catalog; onSave: (c: Catalog) => void }) {
  const [editing, setEditing] = useState<Articolo | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<Omit<Articolo, "id">>({ nome: "", prezzoUnitario: 0, aliquotaIva: "22", categoriaId: catalog.categorie[0]?.id ?? "", attivo: true });
  const [filterRep, setFilterRep] = useState<string>("tutti");

  const openNew = () => {
    setShowNew(true); setEditing(null);
    setForm({ nome: "", prezzoUnitario: 0, aliquotaIva: "22", categoriaId: catalog.categorie[0]?.id ?? "", attivo: true });
  };

  const openEdit = (a: Articolo) => { setEditing(a); setShowNew(false); setForm({ nome: a.nome, prezzoUnitario: a.prezzoUnitario, aliquotaIva: a.aliquotaIva, categoriaId: a.categoriaId, attivo: a.attivo }); };

  const handleSave = () => {
    if (!form.nome.trim() || !form.categoriaId || form.prezzoUnitario < 0) return;
    if (editing) {
      onSave(updateArticolo(catalog, editing.id, form));
    } else {
      onSave(addArticolo(catalog, form));
    }
    setEditing(null); setShowNew(false);
  };

  const articoliFiltrati = filterRep === "tutti" ? catalog.articoli : catalog.articoli.filter(a => {
    const cat = catalog.categorie.find(c => c.id === a.categoriaId);
    return cat?.repartoId === filterRep;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Select value={filterRep} onValueChange={setFilterRep}>
          <SelectTrigger className="h-8 text-sm flex-1 max-w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i reparti</SelectItem>
            {catalog.reparti.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openNew} className="bg-[#1e3a5f] shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Nuovo
        </Button>
      </div>

      {articoliFiltrati.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">Nessun articolo. Aggiungine uno!</p>
      )}

      {articoliFiltrati.map(art => {
        const cat = catalog.categorie.find(c => c.id === art.categoriaId);
        const rep = catalog.reparti.find(r => r.id === cat?.repartoId);
        return (
          <div key={art.id} className={`bg-white rounded-xl border p-3.5 flex items-center gap-3 shadow-sm ${!art.attivo ? "opacity-50" : ""}`}>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: rep?.colore ?? "#9ca3af" }} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800">{art.nome}</p>
              <p className="text-xs text-gray-400">{cat?.nome} · IVA {art.aliquotaIva === "Esente" ? "Esente" : art.aliquotaIva === "Non soggette" ? "Non sogg." : art.aliquotaIva + "%"}</p>
            </div>
            <p className="font-bold text-gray-800 text-sm font-mono shrink-0">€ {art.prezzoUnitario.toFixed(2)}</p>
            <Switch
              checked={art.attivo}
              onCheckedChange={v => onSave(updateArticolo(catalog, art.id, { attivo: v }))}
            />
            <button onClick={() => openEdit(art)} className="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => { if (confirm("Eliminare l'articolo?")) onSave(deleteArticolo(catalog, art.id)); }} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      <Dialog open={showNew || editing !== null} onOpenChange={() => { setShowNew(false); setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Modifica articolo" : "Nuovo articolo"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nome articolo</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Es. Pane integrale" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoriaId} onValueChange={v => setForm(f => ({ ...f, categoriaId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {catalog.reparti.map(rep => (
                    <div key={rep.id}>
                      <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">{rep.nome}</p>
                      {catalog.categorie.filter(c => c.repartoId === rep.id).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </div>
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
              <Button variant="outline" className="flex-1" onClick={() => { setShowNew(false); setEditing(null); }}>Annulla</Button>
              <Button className="flex-1 bg-[#1e3a5f]" onClick={handleSave}>Salva</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

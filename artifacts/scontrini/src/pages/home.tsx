import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useInviaDocumento, useLogout } from "@workspace/api-client-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { formatCurrency } from "@/lib/utils";
import { useArticoloSize } from "@/lib/articolo-size";
import { useToast } from "@/hooks/use-toast";
import { fetchCatalog, type Catalog, type Articolo, type AliquotaIva } from "@/lib/catalog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, ShoppingCart, Trash2, Plus, Minus, Pencil, Send, ChevronLeft, X } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CartItem {
  articoloId: string;
  nome: string;
  prezzoUnitario: number;
  aliquotaIva: AliquotaIva;
  quantita: number;
  sconto: number;
  omaggio: boolean;
}

const IVA_OPTIONS: AliquotaIva[] = ["22", "10", "5", "4", "Esente", "Non soggette"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function itemTotale(item: CartItem): number {
  return item.quantita * item.prezzoUnitario - item.sconto;
}

function calcTotals(cart: CartItem[]) {
  let complessivo = 0, imponibile = 0, imposta = 0;
  for (const item of cart) {
    const tot = itemTotale(item);
    const aliq = parseFloat(item.aliquotaIva);
    const hasIva = !isNaN(aliq) && aliq > 0;
    const div = hasIva ? 1 + aliq / 100 : 1;
    const imp = tot / div;
    imponibile += imp;
    imposta += tot - imp;
    complessivo += tot;
  }
  return { complessivo, imponibile, imposta };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const meQuery = useGetMe({
    query: {
      enabled: !!isAuthenticated,
      retry: false,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    },
  });
  const { data: me, isError: meError, isFetching: meFetching } = meQuery;
  const logoutMutation = useLogout();
  const inviaMutation = useInviaDocumento();
  const [extensionConnecting, setExtensionConnecting] = useState(false);

  useEffect(() => {
    const onExtensionMessage = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data?.source !== "scontrini-extension" ||
        event.data?.type !== "SCONTRINI_CONNECT_RESULT"
      ) {
        return;
      }

      setExtensionConnecting(false);
      if (event.data.success) {
        toast({ title: "Estensione connessa", description: "Verifico i cookie ADE..." });
        queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      } else {
        toast({
          title: "Connessione non riuscita",
          description: event.data.error || "Apri ADE e accedi a Documento Commerciale Online.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener("message", onExtensionMessage);
    return () => window.removeEventListener("message", onExtensionMessage);
  }, [meQuery.queryKey, queryClient, toast]);

  const connectExtension = () => {
    setExtensionConnecting(true);
    window.postMessage(
      { source: "scontrini-app", type: "SCONTRINI_CONNECT" },
      "*",
    );
    window.setTimeout(() => setExtensionConnecting(false), 15_000);
  };

  // Catalog from DB
  const { data: catalog } = useQuery({ queryKey: ["catalog"], queryFn: fetchCatalog });
  const emptyC: Catalog = { reparti: [], articoli: [] };

  // Navigation
  const [repartoId, setRepartoId] = useState<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false); // mobile overlay
  const [editIdx, setEditIdx] = useState<number | null>(null); // item being edited

  // Payment
  const [modoPagamento, setModoPagamento] = useState<"contanti" | "elettronico" | "ticket">("contanti");
  const [importoContanti, setImportoContanti] = useState(0);
  const [importoElettronic, setImportoElettronico] = useState(0);
  const [importoTicket, setImportoTicket] = useState(0);
  const [nTicket, setNTicket] = useState("");
  const [tipoOp, setTipoOp] = useState("Vendita/Prestazione");
  const [lotteria, setLotteria] = useState("");

  // Derived catalog (catalog can be undefined while loading)
  const cat = catalog ?? emptyC;
  const { px: articoloPx } = useArticoloSize();

  const articoliFiltrati = useMemo(() => {
    return cat.articoli.filter(a => {
      if (!a.attivo) return false;
      if (repartoId) return a.repartoId === repartoId;
      return true;
    });
  }, [cat.articoli, repartoId]);

  const totals = useMemo(() => calcTotals(cart), [cart]);

  // Auto-fill payment amount when total changes
  useEffect(() => {
    if (modoPagamento === "elettronico") setImportoElettronico(totals.complessivo);
    if (modoPagamento === "contanti" && importoContanti === 0) setImportoContanti(totals.complessivo);
  }, [totals.complessivo, modoPagamento]);

  const totalePagato = importoContanti + importoElettronic + importoTicket;
  const resto = modoPagamento === "contanti" ? Math.max(0, importoContanti - totals.complessivo) : 0;

  // ── Cart actions ──────────────────────────────────────────────────────────

  const addToCart = useCallback((art: Articolo) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.articoloId === art.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantita: next[idx].quantita + 1 };
        return next;
      }
      return [...prev, {
        articoloId: art.id,
        nome: art.nome,
        prezzoUnitario: art.prezzoUnitario,
        aliquotaIva: art.aliquotaIva,
        quantita: 1,
        sconto: 0,
        omaggio: false,
      }];
    });
  }, []);

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const next = [...prev];
      const newQty = next[idx].quantita + delta;
      if (newQty <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantita: newQty };
      return next;
    });
  };

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, patch: Partial<CartItem>) => {
    setCart(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  const clearCart = () => {
    setCart([]);
    setImportoContanti(0);
    setImportoElettronico(0);
    setImportoTicket(0);
    setNTicket("");
    setShowCart(false);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (cart.length === 0) {
      toast({ title: "Carrello vuoto", description: "Aggiungi almeno un articolo", variant: "destructive" });
      return;
    }
    const diff = Math.abs(totals.complessivo - totalePagato);
    if (diff > 0.01) {
      toast({ title: "Pagamento non quadra", description: `Mancano € ${formatCurrency(totals.complessivo - totalePagato)}`, variant: "destructive" });
      return;
    }

    inviaMutation.mutate({
      data: {
        tipoOperazione: tipoOp,
        codiceLotteria: lotteria || undefined,
        righe: cart.map(i => ({
          quantita: i.quantita,
          descrizione: i.nome,
          prezzoUnitario: i.prezzoUnitario,
          aliquotaIva: i.aliquotaIva,
          sconto: i.sconto || 0,
          omaggio: i.omaggio,
        })),
        pagamento: {
          contanti: importoContanti,
          elettronico: importoElettronic,
          ticketRestaurant: importoTicket,
          numeroTicket: nTicket || undefined,
          scontoAPagare: 0,
          documentoCollegato: "",
        },
      }
    }, {
      onSuccess: (res) => {
        if (res.success) {
          sessionStorage.setItem("scontrino_result", JSON.stringify(res));
          sessionStorage.setItem("scontrino_rows", JSON.stringify(cart.map(i => ({
            quantita: i.quantita, descrizione: i.nome, prezzoUnitario: i.prezzoUnitario, aliquotaIva: i.aliquotaIva,
          }))));
          clearCart();
          setLocation("/risultato");
        }
      },
      onError: (err) => {
        const msg = err.error || "Errore durante l'invio";
        const isAuth = msg.includes("401") || msg.includes("405") || msg.includes("sessione") || msg.includes("Unauthorized");
        toast({
          title: isAuth ? "Sessione scaduta" : "Errore invio",
          description: isAuth
            ? "La sessione ADE è scaduta. Usa l'estensione Chrome per riconnetterti."
            : msg,
          variant: "destructive",
        });
      }
    });
  };

  if (authLoading || !isAuthenticated) return null;

  const reparto = cat.reparti.find(r => r.id === repartoId);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-100 overflow-hidden" style={{ paddingBottom: 0 }}>

      {/* ── BANNER sessione scaduta ── */}
      {meError && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2 flex items-center justify-between gap-2 shrink-0">
          <span>⚠️ Sessione ADE scaduta — riconnetti l'estensione Chrome o usa "Incolla cookie"</span>
          <button onClick={() => setLocation("/login")} className="underline font-semibold whitespace-nowrap">Riconnetti →</button>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="bg-[#1e3a5f] text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{me?.ragioneSociale || "Gestionale"}</p>
            <p className="text-xs text-white/60 font-mono">{me?.partitaIva || ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={connectExtension}
            disabled={extensionConnecting}
            title={
              meError
                ? "Cookie ADE scaduti: clicca per riconnettere l'estensione"
                : "Cookie ADE validi: clicca per aggiornare la connessione"
            }
            className={`flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-[10px] sm:text-xs font-semibold border transition-all ${
              meError
                ? "bg-red-500 border-red-300 text-white animate-pulse"
                : meFetching && !me
                  ? "bg-amber-500 border-amber-300 text-white"
                  : "bg-green-500 border-green-300 text-white shadow-[0_0_12px_rgba(34,197,94,0.65)]"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-white" />
            {extensionConnecting
              ? "Connessione..."
              : meError
                ? "Cookie da cambiare"
                : "Cookie validi"}
          </button>
          <Select value={tipoOp} onValueChange={setTipoOp}>
            <SelectTrigger className="h-8 text-xs bg-white/10 border-white/20 text-white w-44 hidden sm:flex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Vendita/Prestazione">Vendita/Prestazione</SelectItem>
              <SelectItem value="Reso">Reso</SelectItem>
              <SelectItem value="Annullo">Annullo</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8 p-0" onClick={() => logoutMutation.mutate(undefined, { onSettled: () => setLocation('/login') })}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: CATALOG PANEL ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Reparti */}
          <div className="bg-white border-b px-3 py-2.5 flex gap-2 overflow-x-auto shrink-0 scrollbar-hide">
            <button
              onClick={() => { setRepartoId(null); }}
              className={`shrink-0 w-20 h-20 rounded-xl text-sm font-semibold transition-all flex items-center justify-center text-center leading-tight ${!repartoId ? 'bg-[#1e3a5f] text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >Tutti</button>
            {cat.reparti.map(r => (
              <button
                key={r.id}
                onClick={() => { setRepartoId(r.id); }}
                className={`shrink-0 w-20 h-20 rounded-xl text-sm font-semibold transition-all flex items-center justify-center text-center leading-tight active:scale-95 ${repartoId === r.id ? 'text-white shadow' : 'text-gray-700 hover:opacity-80'}`}
                style={repartoId === r.id ? { backgroundColor: r.colore } : { backgroundColor: r.colore + "22", color: r.colore }}
              >{r.nome}</button>
            ))}
          </div>

          {/* Articoli grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {articoliFiltrati.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <p className="text-sm">Nessun articolo</p>
                <button onClick={() => setLocation("/admin")} className="text-xs text-blue-500 underline">Aggiungi dal catalogo</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {articoliFiltrati.map(art => {
                  const rep = cat.reparti.find(r => r.id === art.repartoId);
                  const colore = rep?.colore ?? "#6b7280";
                  return (
                    <button
                      key={art.id}
                      onClick={() => addToCart(art)}
                      className="bg-white rounded-xl p-3 text-left shadow-sm border-2 hover:shadow-md active:scale-95 transition-all flex flex-col justify-between shrink-0"
                      style={{ width: articoloPx, height: articoloPx, borderColor: colore + "60", backgroundColor: colore + "0d" }}
                    >
                      <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-3">{art.nome}</p>
                      <div>
                        <p className="text-lg font-bold text-gray-900">€ {art.prezzoUnitario.toFixed(2)}</p>
                        <span className="text-[10px] text-gray-400 font-mono">{art.aliquotaIva === "Esente" ? "ES" : art.aliquotaIva === "Non soggette" ? "NS" : art.aliquotaIva + "%"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: CART PANEL (desktop) ── */}
        <div className="hidden md:flex w-80 lg:w-96 flex-col bg-white border-l shadow-inner">
          <CartPanel
            cart={cart}
            totals={totals}
            totalePagato={totalePagato}
            resto={resto}
            modoPagamento={modoPagamento}
            setModoPagamento={setModoPagamento}
            importoContanti={importoContanti}
            setImportoContanti={setImportoContanti}
            importoElettronico={importoElettronic}
            setImportoElettronico={setImportoElettronico}
            importoTicket={importoTicket}
            setImportoTicket={setImportoTicket}
            nTicket={nTicket}
            setNTicket={setNTicket}
            lotteria={lotteria}
            setLotteria={setLotteria}
            onUpdateQty={updateQty}
            onRemove={removeItem}
            onEdit={setEditIdx}
            onClear={clearCart}
            onSubmit={handleSubmit}
            isPending={inviaMutation.isPending}
          />
        </div>
      </div>

      {/* ── MOBILE: Cart FAB ── */}
      {cart.length > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="md:hidden fixed bottom-4 right-4 bg-[#1e3a5f] text-white rounded-full px-5 py-3 shadow-xl flex items-center gap-3 z-30 active:scale-95 transition-transform"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="font-bold">{cart.reduce((s, i) => s + i.quantita, 0)} art.</span>
          <span className="font-mono font-bold">€ {formatCurrency(totals.complessivo)}</span>
        </button>
      )}

      {/* ── MOBILE: Cart overlay ── */}
      {showCart && (
        <div className="md:hidden fixed inset-0 bg-white z-40 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-[#1e3a5f] text-white">
            <button onClick={() => setShowCart(false)} className="hover:opacity-70">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="font-semibold flex-1">Carrello</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <CartPanel
              cart={cart}
              totals={totals}
              totalePagato={totalePagato}
              resto={resto}
              modoPagamento={modoPagamento}
              setModoPagamento={setModoPagamento}
              importoContanti={importoContanti}
              setImportoContanti={setImportoContanti}
              importoElettronico={importoElettronic}
              setImportoElettronico={setImportoElettronico}
              importoTicket={importoTicket}
              setImportoTicket={setImportoTicket}
              nTicket={nTicket}
              setNTicket={setNTicket}
              lotteria={lotteria}
              setLotteria={setLotteria}
              onUpdateQty={updateQty}
              onRemove={removeItem}
              onEdit={setEditIdx}
              onClear={clearCart}
              onSubmit={handleSubmit}
              isPending={inviaMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* ── Edit item dialog ── */}
      {editIdx !== null && cart[editIdx] && (
        <EditItemDialog
          item={cart[editIdx]}
          onSave={(patch) => { updateItem(editIdx, patch); setEditIdx(null); }}
          onClose={() => setEditIdx(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}

// ── CartPanel ─────────────────────────────────────────────────────────────────

interface CartPanelProps {
  cart: CartItem[];
  totals: { complessivo: number; imponibile: number; imposta: number };
  totalePagato: number;
  resto: number;
  modoPagamento: "contanti" | "elettronico" | "ticket";
  setModoPagamento: (m: "contanti" | "elettronico" | "ticket") => void;
  importoContanti: number;
  setImportoContanti: (v: number) => void;
  importoElettronico: number;
  setImportoElettronico: (v: number) => void;
  importoTicket: number;
  setImportoTicket: (v: number) => void;
  nTicket: string;
  setNTicket: (v: string) => void;
  lotteria: string;
  setLotteria: (v: string) => void;
  onUpdateQty: (idx: number, delta: number) => void;
  onRemove: (idx: number) => void;
  onEdit: (idx: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

function CartPanel({ cart, totals, totalePagato, resto, modoPagamento, setModoPagamento,
  importoContanti, setImportoContanti, importoElettronico, setImportoElettronico,
  importoTicket, setImportoTicket, nTicket, setNTicket, lotteria, setLotteria,
  onUpdateQty, onRemove, onEdit, onClear, onSubmit, isPending }: CartPanelProps) {

  const diff = totals.complessivo - totalePagato;
  const balanced = Math.abs(diff) < 0.01;

  return (
    <div className="h-full flex flex-col">
      {/* Cart header */}
      <div className="px-4 py-2.5 border-b flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" />
          Carrello {cart.length > 0 && <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{cart.reduce((s, i) => s + i.quantita, 0)}</span>}
        </h2>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Svuota
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-300 text-sm">
            Tocca un articolo per aggiungerlo
          </div>
        ) : (
          <div className="divide-y">
            {cart.map((item, idx) => (
              <div key={idx} className="px-3 py-2.5 flex items-center gap-2 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.nome}</p>
                  <p className="text-xs text-gray-400 font-mono">
                    € {item.prezzoUnitario.toFixed(2)} × {item.quantita}
                    {item.sconto > 0 && <span className="text-red-400"> −{item.sconto.toFixed(2)}</span>}
                    <span className="ml-1 text-gray-300">· {item.aliquotaIva}%</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onUpdateQty(idx, -1)} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantita}</span>
                  <button onClick={() => onUpdateQty(idx, 1)} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-sm font-bold text-gray-800 w-14 text-right shrink-0">
                  € {formatCurrency(itemTotale(item))}
                </p>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => onEdit(idx)} className="text-gray-300 hover:text-blue-500 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onRemove(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      {cart.length > 0 && (
        <>
          <div className="bg-gray-50 border-t px-4 py-2 space-y-0.5 shrink-0 text-xs text-gray-500">
            <div className="flex justify-between"><span>Imponibile</span><span className="font-mono">€ {formatCurrency(totals.imponibile)}</span></div>
            <div className="flex justify-between"><span>IVA</span><span className="font-mono">€ {formatCurrency(totals.imposta)}</span></div>
            <div className="flex justify-between text-sm font-bold text-gray-800 pt-1 border-t">
              <span>TOTALE</span><span className="font-mono">€ {formatCurrency(totals.complessivo)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="border-t px-4 py-3 space-y-3 shrink-0">
            {/* Mode buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              {(["contanti", "elettronico", "ticket"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setModoPagamento(m)}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${modoPagamento === m ? 'bg-[#1e3a5f] text-white shadow' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {m === "contanti" ? "💵 Contanti" : m === "elettronico" ? "💳 Carta" : "🎫 Ticket"}
                </button>
              ))}
            </div>

            {/* Amount inputs */}
            {modoPagamento === "contanti" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">Incassato €</span>
                  <CurrencyInput className="flex-1 h-9 rounded border px-3 text-right font-mono text-sm" value={importoContanti} onChange={setImportoContanti} />
                </div>
                {resto > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 flex justify-between items-center">
                    <span className="text-xs text-green-700 font-medium">Resto</span>
                    <span className="font-mono font-bold text-green-700">€ {formatCurrency(resto)}</span>
                  </div>
                )}
              </div>
            )}
            {modoPagamento === "elettronico" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">Importo €</span>
                <CurrencyInput className="flex-1 h-9 rounded border px-3 text-right font-mono text-sm" value={importoElettronico} onChange={setImportoElettronico} />
              </div>
            )}
            {modoPagamento === "ticket" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">Importo €</span>
                  <CurrencyInput className="flex-1 h-9 rounded border px-3 text-right font-mono text-sm" value={importoTicket} onChange={setImportoTicket} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">N° ticket</span>
                  <input className="flex-1 h-9 rounded border px-3 text-sm font-mono" placeholder="Facoltativo" value={nTicket} onChange={e => setNTicket(e.target.value)} />
                </div>
              </div>
            )}

            {/* Lotteria */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-20 shrink-0">Lotteria</span>
              <input className="flex-1 h-8 rounded border px-3 text-xs font-mono uppercase" placeholder="Codice (opzionale)" value={lotteria} onChange={e => setLotteria(e.target.value.toUpperCase())} maxLength={8} />
            </div>

            {/* Balance indicator */}
            {!balanced && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-700 text-center">
                {diff > 0 ? `Mancano € ${formatCurrency(diff)}` : `Eccesso € ${formatCurrency(-diff)}`}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={onSubmit}
              disabled={isPending || cart.length === 0}
              className="w-full bg-[#1e3a5f] hover:bg-[#1e40af] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg active:scale-95"
            >
              {isPending ? (
                <span className="text-sm">Elaborazione...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Emetti Documento</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── EditItemDialog ────────────────────────────────────────────────────────────

function EditItemDialog({ item, onSave, onClose }: { item: CartItem; onSave: (p: Partial<CartItem>) => void; onClose: () => void }) {
  const [prezzo, setPrezzo] = useState(item.prezzoUnitario);
  const [iva, setIva] = useState<AliquotaIva>(item.aliquotaIva);
  const [sconto, setSconto] = useState(item.sconto);
  const [omaggio, setOmaggio] = useState(item.omaggio);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{item.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Prezzo unitario €</Label>
            <CurrencyInput className="w-full h-10 rounded border px-3 text-right font-mono" value={prezzo} onChange={setPrezzo} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Aliquota IVA</Label>
            <Select value={iva} onValueChange={v => setIva(v as AliquotaIva)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o === "Esente" || o === "Non soggette" ? o : `${o}%`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Sconto riga €</Label>
            <CurrencyInput className="w-full h-10 rounded border px-3 text-right font-mono text-red-600" value={sconto} onChange={setSconto} />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={omaggio} onChange={e => setOmaggio(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700">Omaggio (non incassato)</span>
          </label>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annulla</Button>
            <Button className="flex-1 bg-[#1e3a5f]" onClick={() => onSave({ prezzoUnitario: prezzo, aliquotaIva: iva, sconto, omaggio })}>
              Salva
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

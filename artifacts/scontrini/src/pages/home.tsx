import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetAeStatus, useGetMe, useInviaDocumento, useLogout, getGetMeQueryKey, getGetAeStatusQueryKey } from "@workspace/api-client-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { formatCurrency } from "@/lib/utils";
import { SIZES } from "@/lib/articolo-size";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCatalog,
  type Catalog,
  type Articolo,
  type AliquotaIva,
  isNaturaIva,
  ivaLabel,
  normalizeAliquotaIva,
} from "@/lib/catalog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, ShoppingCart, Trash2, Plus, Minus, Pencil, Send, ChevronLeft, X, Delete, Calculator, ReceiptText, History, RefreshCw, CheckCircle2, XCircle, FileText, Tag, Percent } from "lucide-react";
import { QrShareButton } from "@/components/qr-display";
import { isCapacitor } from "@/lib/capacitor";
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
  repartoId?: string;
  quantita: number;
  sconto: number;
  omaggio: boolean;
}

const IVA_OPTIONS: AliquotaIva[] = ["22", "10", "5", "4", "N1", "N2", "N3", "N4", "N5", "N6"];

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
      queryKey: getGetMeQueryKey(),
      enabled: !!isAuthenticated,
      retry: false,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    },
  });
  const aeStatusQuery = useGetAeStatus({
    query: {
      queryKey: getGetAeStatusQueryKey(),
      enabled: !!isAuthenticated,
      retry: false,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    },
  });
  const { data: me, isError: meError, isFetching: meFetching } = meQuery;
  const aeStatus = aeStatusQuery.data;
  const logoutMutation = useLogout();
  const inviaMutation = useInviaDocumento();
  const [extensionConnecting, setExtensionConnecting] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);

  // Se l'API ha una sessione attiva, l'estensione ha già consegnato i cookie.
  // Non usare l'errore di /ae/me per colorare il pulsante: è una verifica
  // separata e può fallire anche quando la connessione dell'estensione è OK.
  useEffect(() => {
    if (me) {
      setExtensionConnected(true);
    }
    if (meError) {
      setExtensionConnected(false);
    }
  }, [me, meError]);

  useEffect(() => {
    const onExtensionMessage = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data?.source !== "scontrini-extension" ||
        !["SCONTRINI_CONNECT_RESULT", "SCONTRINI_CONNECTION_STATE"].includes(
          event.data?.type,
        )
      ) {
        return;
      }

      setExtensionConnecting(false);
      if (event.data.success) {
        setExtensionConnected(true);
        toast({ title: "Estensione connessa", description: "Cookie inviati correttamente all'app." });
        queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        queryClient.invalidateQueries({ queryKey: aeStatusQuery.queryKey });
      } else {
        setExtensionConnected(false);
        toast({
          title: "Connessione non riuscita",
          description: event.data.error || "Apri ADE e accedi a Documento Commerciale Online.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener("message", onExtensionMessage);
    return () => window.removeEventListener("message", onExtensionMessage);
  }, [aeStatusQuery.queryKey, meQuery.queryKey, queryClient, toast]);

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
  const emptyC: Catalog = {
    reparti: [],
    articoli: [],
    impostazioni: { importoMassimoDco: null, tastieraFissa: false, mostraTicket: false, gestioneResto: false, mostraTipoOperazione: false, dimensioneTasti: "S" },
  };

  // Navigation
  const [repartoId, setRepartoId] = useState<string | null>(null);

  // Cart — persisted in sessionStorage so la navigazione tra tab non azzera il carrello
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("scontrini_cart") ?? "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("scontrini_cart", JSON.stringify(cart)); } catch { /* storage pieno */ }
  }, [cart]);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [priceInputArt, setPriceInputArt] = useState<Articolo | null>(null);
  const [priceInputText, setPriceInputText] = useState("0");
  const [editIdx, setEditIdx] = useState<number | null>(null); // item being edited
  // Long-press su riga carrello → cambia prezzo
  const [changePriceIdx, setChangePriceIdx] = useState<number | null>(null);
  const [changePriceText, setChangePriceText] = useState("0");
  // Long-press sul totale → sconto
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [cartDiscount, setCartDiscount] = useState<{ type: "percent" | "value"; amount: number } | null>(null);
  const [showFreeAmount, setShowFreeAmount] = useState(false);
  const [fixedAmountText, setFixedAmountText] = useState("");

  // Payment
  const [modoPagamento, setModoPagamento] = useState<"contanti" | "elettronico" | "ticket">("contanti");
  const [importoContanti, setImportoContanti] = useState(0);
  const [importoElettronic, setImportoElettronico] = useState(0);
  const [importoTicket, setImportoTicket] = useState(0);
  const [nTicket, setNTicket] = useState("");
  const [tipoOp, setTipoOp] = useState("Vendita/Prestazione");
  const [resoProgressivo, setResoProgressivo] = useState("");
  const [resoForzato, setResoForzato] = useState(false);
  const [resoImportoParziale, setResoImportoParziale] = useState("");
  const [resoAliquotaIva, setResoAliquotaIva] = useState<AliquotaIva>("N1");
  const [lotteria, setLotteria] = useState("");
  const [emissioneRiuscita, setEmissioneRiuscita] = useState<{
    numeroDocumento: string;
    dataEmissione?: string;
    numeroProgressivo?: string;
  } | null>(null);

  // Derived catalog (catalog can be undefined while loading)
  const cat = catalog ?? emptyC;
  const articoloSize = cat.impostazioni?.dimensioneTasti ?? "S";
  const gestioneResto = cat.impostazioni?.gestioneResto ?? false;
  const mostraTipoOperazione = cat.impostazioni?.mostraTipoOperazione ?? false;
  const articoloPx = SIZES.find(s => s.label === articoloSize)?.px ?? SIZES[0].px;

  const articoliFiltrati = useMemo(() => {
    return cat.articoli.filter(a => {
      if (!a.attivo) return false;
      if (repartoId) return a.repartoId === repartoId;
      return true;
    });
  }, [cat.articoli, repartoId]);

  const totals = useMemo(() => calcTotals(cart), [cart]);
  const discountAmount = useMemo(() => {
    if (!cartDiscount || totals.complessivo <= 0) return 0;
    const raw = cartDiscount.type === "percent"
      ? totals.complessivo * cartDiscount.amount / 100
      : cartDiscount.amount;
    return Math.round(Math.min(raw, totals.complessivo) * 100) / 100;
  }, [cartDiscount, totals.complessivo]);
  const totaleConSconto = totals.complessivo - discountAmount;

  // Auto-fill payment amount when total (after discount) changes
  useEffect(() => {
    if (modoPagamento === "elettronico") setImportoElettronico(totaleConSconto);
    if (modoPagamento === "contanti" && (!gestioneResto || importoContanti === 0)) {
      setImportoContanti(totaleConSconto);
    }
  }, [gestioneResto, totaleConSconto, modoPagamento]);

  useEffect(() => {
    if (modoPagamento === "ticket" && !cat.impostazioni?.mostraTicket) {
      setModoPagamento("contanti");
    }
  }, [cat.impostazioni?.mostraTicket, modoPagamento]);

  // Legge URL params (?tipoOp=Reso&progressivo=DCW...) per avviare il reso
  // direttamente dallo storico.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tipoOp") === "Reso") {
      setTipoOp("Reso");
      setResoForzato(true);
      const prog = params.get("progressivo");
      if (prog) setResoProgressivo(prog.toUpperCase());
    }
  }, []);

  useEffect(() => {
    // Non resettare se il reso è stato avviato via URL param
    if (!mostraTipoOperazione && !resoForzato) {
      setTipoOp("Vendita/Prestazione");
      setResoProgressivo("");
    }
  }, [mostraTipoOperazione, resoForzato]);

  useEffect(() => {
    if (tipoOp !== "Reso") {
      setResoProgressivo("");
      setResoForzato(false);
      setResoImportoParziale("");
    }
  }, [tipoOp]);

  const totalePagato = modoPagamento === "contanti"
    ? (gestioneResto ? importoContanti : totaleConSconto)
    : modoPagamento === "elettronico"
      ? importoElettronic
      : importoTicket;
  const resto = gestioneResto && modoPagamento === "contanti"
    ? Math.max(0, importoContanti - totaleConSconto)
    : 0;

  const selectPaymentMode = useCallback((mode: "contanti" | "elettronico" | "ticket") => {
    setModoPagamento(mode);
    if (gestioneResto && mode === "contanti" && cart.length > 0) {
      const amount = Number(fixedAmountText.replace(",", "."));
      if (Number.isFinite(amount) && amount > 0) {
        setImportoContanti(Math.round(amount * 100) / 100);
        setFixedAmountText("");
      }
    }
  }, [cart.length, fixedAmountText, gestioneResto]);

  const handleFixedAmountTextChange = useCallback((value: string) => {
    setFixedAmountText(value);
    if (gestioneResto && cart.length > 0 && modoPagamento === "contanti") {
      const amount = Number(value.replace(",", "."));
      setImportoContanti(Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0);
    }
  }, [cart.length, gestioneResto, modoPagamento]);

  // ── Cart actions ──────────────────────────────────────────────────────────

  const addToCart = useCallback((art: Articolo) => {
    const amount = Number(fixedAmountText.replace(",", "."));

    // Tastiera fissa: importo → articolo/reparto → pagamento.
    // Reparto e IVA arrivano dall'articolo toccato, senza selezioni duplicate.
    if (cat.impostazioni?.tastieraFissa && cart.length === 0 && Number.isFinite(amount) && amount > 0) {
      setCart(prev => [...prev, {
        articoloId: "",
        nome: `Importo libero · ${art.nome}`,
        prezzoUnitario: Math.round(amount * 100) / 100,
        aliquotaIva: art.aliquotaIva,
        repartoId: art.repartoId,
        quantita: 1,
        sconto: 0,
        omaggio: false,
      }]);
      setFixedAmountText("");
      return;
    }

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
  }, [cat.impostazioni?.tastieraFissa, fixedAmountText, cart.length]);

  const handleArticoloClick = useCallback((art: Articolo) => {
    if (art.prezzoUnitario === 0) {
      setPriceInputArt(art);
      setPriceInputText("0");
    } else {
      addToCart(art);
    }
  }, [addToCart]);

  const addFreeAmount = useCallback((amount: number, repartoId: string, aliquotaIva: AliquotaIva) => {
    const reparto = cat.reparti.find(r => r.id === repartoId);
    setCart(prev => [...prev, {
      // Le righe libere non hanno un articolo catalogo e quindi non modificano la giacenza.
      articoloId: "",
      nome: `Importo libero · ${reparto?.nome ?? "Senza reparto"}`,
      prezzoUnitario: amount,
      aliquotaIva,
      repartoId,
      quantita: 1,
      sconto: 0,
      omaggio: false,
    }]);
    setShowFreeAmount(false);
  }, [cat.reparti]);

  // Aggiunge un importo reso parziale al carrello (senza articolo catalogo)
  const handleAddResoImporto = useCallback(() => {
    const amount = Number(resoImportoParziale.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    setCart(prev => [...prev, {
      articoloId: "",
      nome: "Reso",
      prezzoUnitario: amount,
      aliquotaIva: resoAliquotaIva,
      repartoId: cat.reparti[0]?.id ?? "",
      quantita: 1,
      sconto: 0,
      omaggio: false,
    }]);
    setResoImportoParziale("");
  }, [resoImportoParziale, resoAliquotaIva, cat.reparti]);

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

  const updateItemPrice = (idx: number, newPrice: number) => {
    setCart(prev => prev.map((item, i) => i === idx ? { ...item, prezzoUnitario: newPrice } : item));
  };

  const clearCart = () => {
    setCart([]);
    setImportoContanti(0);
    setImportoElettronico(0);
    setImportoTicket(0);
    setNTicket("");
    setCartDiscount(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (cart.length === 0) {
      toast({ title: "Carrello vuoto", description: "Aggiungi almeno un articolo", variant: "destructive" });
      return;
    }
    if (tipoOp === "Annullo") {
      toast({
        title: "Annullo non disponibile in cassa",
        description: "Per annullare un documento usa il pulsante nel dettaglio dello storico.",
        variant: "destructive",
      });
      return;
    }
    if (tipoOp === "Reso" && !resoProgressivo.trim()) {
      toast({
        title: "Documento originario mancante",
        description: "Inserisci il progressivo del documento commerciale da rendere.",
        variant: "destructive",
      });
      return;
    }
    // Con gestione resto + contanti è valido che l'incassato superi il totale.
    // Blocca solo se l'incassato è insufficiente (mancano soldi).
    const pagamentoInsufficient =
      gestioneResto && modoPagamento === "contanti"
        ? importoContanti < totaleConSconto - 0.01
        : Math.abs(totaleConSconto - totalePagato) > 0.01;
    if (pagamentoInsufficient) {
      toast({ title: "Pagamento non quadra", description: `Mancano € ${formatCurrency(totaleConSconto - totalePagato)}`, variant: "destructive" });
      return;
    }
    const maxDco = cat.impostazioni?.importoMassimoDco;
    if (maxDco != null && totaleConSconto > maxDco + 0.005) {
      toast({
        title: "Importo DCO oltre soglia",
        description: `Il limite configurato è € ${formatCurrency(maxDco)}.`,
        variant: "destructive",
      });
      return;
    }

    inviaMutation.mutate({
      data: {
        tipoOperazione: tipoOp,
        codiceLotteria: lotteria || undefined,
        righe: cart.map(i => {
          // Distribuisce lo sconto globale proporzionalmente sul valore di ogni riga
          const share = totals.complessivo > 0 ? itemTotale(i) / totals.complessivo : 0;
          const itemDiscountShare = discountAmount > 0 ? Math.round(discountAmount * share * 100) / 100 : 0;
          return {
            articoloId: i.articoloId,
            quantita: i.quantita,
            descrizione: i.nome,
            prezzoUnitario: i.prezzoUnitario,
            aliquotaIva: i.aliquotaIva,
            sconto: (i.sconto || 0) + itemDiscountShare,
            omaggio: i.omaggio,
          };
        }),
        pagamento: {
          contanti: modoPagamento === "contanti"
            ? (gestioneResto ? importoContanti : totaleConSconto)
            : 0,
          elettronico: modoPagamento === "elettronico" ? importoElettronic : 0,
          ticketRestaurant: modoPagamento === "ticket" ? importoTicket : 0,
          numeroTicket: modoPagamento === "ticket" ? (nTicket || undefined) : undefined,
          scontoAPagare: 0,
          documentoCollegato: tipoOp === "Reso" ? resoProgressivo.trim() : "",
        },
      }
    }, {
      onSuccess: (res) => {
        if (res.success) {
          queryClient.invalidateQueries({ queryKey: ["catalog"] });
          clearCart();
          setEmissioneRiuscita({
            numeroDocumento: res.numeroDocumento,
            dataEmissione: res.dataEmissione,
            numeroProgressivo: res.numeroProgressivo,
          });
        }
      },
      onError: (err) => {
        const msg = (err as unknown as { error?: string }).error || "Errore durante l'invio";
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
      {meError && !extensionConnected && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2 flex items-center justify-between gap-2 shrink-0">
          <span>⚠️ Sessione ADE scaduta — riconnetti l'estensione Chrome o usa "Incolla cookie"</span>
          <button onClick={() => setLocation("/login")} className="underline font-semibold whitespace-nowrap">Riconnetti →</button>
        </div>
      )}

      {/* ── RISPOSTA ADE ── */}
      {aeStatus && (
        <div className={`px-4 py-2 text-xs border-b shrink-0 ${
          aeStatus.connected
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-red-50 border-red-200 text-red-900"
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              {aeStatus.connected
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                : <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />}
              <div className="min-w-0">
                <p className="font-semibold">
                  Risposta ADE — {aeStatus.connected ? "sessione DCO riconosciuta" : "sessione DCO non riconosciuta"}
                </p>
                <p className="truncate">
                  {aeStatus.service} · HTTP {aeStatus.httpStatus} · {aeStatus.message}
                </p>
                {(aeStatus.ragioneSociale || aeStatus.partitaIva || aeStatus.codiceFiscale) && (
                  <p className="text-[11px] opacity-80 truncate">
                    Impresa: {aeStatus.ragioneSociale || "non indicata"}
                    {aeStatus.partitaIva ? ` · P.IVA ${aeStatus.partitaIva}` : ""}
                    {aeStatus.codiceFiscale ? ` · CF ${aeStatus.codiceFiscale}` : ""}
                  </p>
                )}
                {!aeStatus.connected && aeStatus.details && (
                  <p className="text-[11px] opacity-80 truncate" title={aeStatus.details}>
                    Dettaglio ADE: {aeStatus.details}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => aeStatusQuery.refetch()}
              disabled={aeStatusQuery.isFetching}
              className="inline-flex items-center gap-1 shrink-0 font-semibold underline underline-offset-2 disabled:opacity-60"
              title="Verifica nuovamente la sessione direttamente su ADE"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aeStatusQuery.isFetching ? "animate-spin" : ""}`} />
              Verifica ADE
            </button>
          </div>
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
              extensionConnected
                ? "Estensione connessa: clicca per aggiornare"
                : "Cookie da cambiare: clicca per riconnettere"
            }
            className={`flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-[10px] sm:text-xs font-semibold border transition-all ${
              extensionConnecting
                ? "bg-amber-500 border-amber-300 text-white"
                : extensionConnected
                  ? "bg-green-500 border-green-300 text-white shadow-[0_0_12px_rgba(34,197,94,0.65)]"
                  : "bg-red-500 border-red-300 text-white animate-pulse"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-white" />
            {extensionConnecting
              ? "Connessione..."
              : extensionConnected
                ? "Estensione connessa"
                : "Cookie da cambiare"}
          </button>
          {mostraTipoOperazione && (
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
          )}
          {!isCapacitor && <QrShareButton />}
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8 p-0" onClick={() => logoutMutation.mutate(undefined, { onSettled: () => setLocation('/login') })}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {tipoOp === "Reso" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 space-y-2">
          {/* Riga 1: progressivo */}
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor="reso-progressivo" className="shrink-0 text-xs font-semibold text-amber-900">
              Documento originario
            </label>
            <Input
              id="reso-progressivo"
              value={resoProgressivo}
              onChange={(event) => setResoProgressivo(event.target.value.toUpperCase())}
              placeholder="Es. DCW2026/2255-2524"
              className="h-8 max-w-md bg-white text-xs font-mono"
            />
          </div>
          {/* Riga 2: importo parziale */}
          {resoProgressivo.trim() && (
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-amber-900">Importo da rendere</span>
              <input
                type="text"
                inputMode="decimal"
                value={resoImportoParziale}
                onChange={e => setResoImportoParziale(e.target.value)}
                placeholder="0,00"
                className="h-8 w-28 rounded-md border bg-white px-2 text-right text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <Select value={resoAliquotaIva} onValueChange={v => setResoAliquotaIva(v as AliquotaIva)}>
                <SelectTrigger className="h-8 w-28 bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IVA_OPTIONS.map(iva => (
                    <SelectItem key={iva} value={iva}>{ivaLabel(iva)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs px-3"
                onClick={handleAddResoImporto}
                disabled={!resoImportoParziale || Number(resoImportoParziale.replace(",", ".")) <= 0}
              >
                + Aggiungi al carrello
              </Button>
              <span className="text-[11px] text-amber-700">oppure seleziona articoli dal catalogo</span>
            </div>
          )}
        </div>
      )}

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
                  const giacenza = art.giacenza ?? 0;
                  const soglia = art.sogliaSottoscorta ?? 0;
                  const statoScorta = giacenza <= 0 ? "esaurito" : giacenza <= soglia ? "sottoscorta" : "disponibile";
                  const bordoScorta = statoScorta === "esaurito"
                    ? "#ef4444"
                    : statoScorta === "sottoscorta"
                      ? "#f97316"
                      : colore + "60";
                  return (
                    <button
                      key={art.id}
                      onClick={() => handleArticoloClick(art)}
                      className="bg-white rounded-xl p-3 text-left shadow-sm border-2 hover:shadow-md active:scale-95 transition-all flex flex-col justify-between shrink-0"
                      title={`${art.nome} · scorta: ${giacenza} · venduti: ${art.pezziVenduti ?? 0}`}
                      style={{
                        width: articoloPx,
                        height: articoloPx,
                        borderColor: bordoScorta,
                        backgroundColor: statoScorta === "esaurito" ? "#fef2f2" : statoScorta === "sottoscorta" ? "#fff7ed" : colore + "0d",
                      }}
                    >
                      <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-3">{art.nome}</p>
                      <div>
                        <p className="text-lg font-bold text-gray-900">€ {art.prezzoUnitario.toFixed(2)}</p>
                        <span className="text-[10px] text-gray-400 font-mono">{isNaturaIva(art.aliquotaIva) ? `0% · ${art.aliquotaIva}` : `${art.aliquotaIva}%`}</span>
                        <span className={`block text-[10px] font-mono font-semibold ${statoScorta === "esaurito" ? "text-red-600" : statoScorta === "sottoscorta" ? "text-orange-600" : "text-gray-400"}`}>
                          Scorta {giacenza}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: CART PANEL (mobile compact, always visible) ── */}
        <div className="flex md:hidden w-32 flex-col bg-white border-l shrink-0">
          <MobileCompactCart
            cart={cart}
            totals={totals}
            totaleConSconto={totaleConSconto}
            discountAmount={discountAmount}
            cartDiscount={cartDiscount}
            modoPagamento={modoPagamento}
            setModoPagamento={selectPaymentMode}
            onUpdateQty={updateQty}
            onClear={clearCart}
            onSubmit={handleSubmit}
            isPending={inviaMutation.isPending}
            cartExpanded={cartExpanded}
            onToggleExpand={() => setCartExpanded(v => !v)}
            onLongPressItem={(idx) => {
              setChangePriceIdx(idx);
              setChangePriceText(cart[idx].prezzoUnitario.toFixed(2).replace(".", ","));
            }}
            onLongPressTotal={() => setShowDiscountDialog(true)}
            onRemoveDiscount={() => setCartDiscount(null)}
          />
        </div>

        {/* ── RIGHT: CART PANEL (desktop) ── */}
        <div className="hidden md:flex w-80 lg:w-96 flex-col bg-white border-l shadow-inner">
          <CartPanel
            cart={cart}
            totals={totals}
            totalePagato={totalePagato}
            resto={resto}
            modoPagamento={modoPagamento}
            setModoPagamento={selectPaymentMode}
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
            reparti={cat.reparti}
            tastieraFissa={cat.impostazioni?.tastieraFissa ?? false}
            fixedAmountText={fixedAmountText}
            onFixedAmountTextChange={handleFixedAmountTextChange}
            mostraTicket={cat.impostazioni?.mostraTicket ?? false}
            gestioneResto={gestioneResto}
            onOpenFreeAmount={() => setShowFreeAmount(true)}
            onSaveFreeAmount={addFreeAmount}
            onOpenHistory={() => setLocation("/storico")}
          />
        </div>
      </div>

      {/* ── Price input numpad (articolo prezzo 0) ── */}
      {priceInputArt && (
        <PriceNumpadDialog
          art={priceInputArt}
          text={priceInputText}
          onTextChange={setPriceInputText}
          onConfirm={(price) => {
            addToCart({ ...priceInputArt, prezzoUnitario: price });
            setPriceInputArt(null);
          }}
          onClose={() => setPriceInputArt(null)}
        />
      )}

      {/* ── Cambia prezzo riga carrello (long press) ── */}
      {changePriceIdx !== null && cart[changePriceIdx] && (
        <ChangePriceDialog
          item={cart[changePriceIdx]}
          text={changePriceText}
          onTextChange={setChangePriceText}
          onConfirm={(price) => { updateItemPrice(changePriceIdx, price); setChangePriceIdx(null); }}
          onClose={() => setChangePriceIdx(null)}
        />
      )}

      {/* ── Sconto sul totale (long press totale) ── */}
      {showDiscountDialog && (
        <DiscountDialog
          total={totals.complessivo}
          onApply={(type, amount) => { setCartDiscount({ type, amount }); setShowDiscountDialog(false); }}
          onClose={() => setShowDiscountDialog(false)}
        />
      )}

      {/* ── Edit item dialog ── */}
      {editIdx !== null && cart[editIdx] && (
        <EditItemDialog
          item={cart[editIdx]}
          onSave={(patch) => { updateItem(editIdx, patch); setEditIdx(null); }}
          onClose={() => setEditIdx(null)}
        />
      )}

      <Dialog open={!!emissioneRiuscita} onOpenChange={open => !open && setEmissioneRiuscita(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-0">
          {emissioneRiuscita && (
            <>
              <DialogHeader className="border-b bg-emerald-50 px-4 py-3">
                <DialogTitle className="flex items-center gap-2 text-base text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  DCO emesso
                </DialogTitle>
                <p className="text-xs text-emerald-700">
                  Documento accettato dall’Agenzia delle Entrate.
                </p>
              </DialogHeader>
              <div className="space-y-3 px-4 py-4">
                <div className="rounded-lg border bg-gray-50 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Numero documento</p>
                  <p className="font-mono text-sm font-bold text-gray-800">{emissioneRiuscita.numeroDocumento}</p>
                  {emissioneRiuscita.dataEmissione && (
                    <p className="mt-0.5 text-[11px] text-gray-500">Data: {emissioneRiuscita.dataEmissione}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FileText className="h-4 w-4 text-[#1e3a5f]" />
                  Il documento è stato archiviato nello storico.
                </div>
              </div>
              <div className="flex gap-2 border-t bg-gray-50 px-4 py-3">
                <Button
                  type="button"
                  onClick={() => setEmissioneRiuscita(null)}
                  className="w-full bg-[#1e3a5f]"
                >
                  Torna alla cassa
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {showFreeAmount && (
        <FreeAmountDialog
          reparti={cat.reparti}
          onSave={addFreeAmount}
          onClose={() => setShowFreeAmount(false)}
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
  reparti: Catalog["reparti"];
  tastieraFissa: boolean;
  fixedAmountText: string;
  onFixedAmountTextChange: (value: string) => void;
  mostraTicket: boolean;
  gestioneResto: boolean;
  onOpenFreeAmount: () => void;
  onSaveFreeAmount: (amount: number, repartoId: string, aliquotaIva: AliquotaIva) => void;
  onOpenHistory: () => void;
}

function CartPanel({ cart, totals, totalePagato, resto, modoPagamento, setModoPagamento,
  importoContanti, setImportoContanti, importoElettronico, setImportoElettronico,
  importoTicket, setImportoTicket, nTicket, setNTicket, lotteria, setLotteria,
  onUpdateQty, onRemove, onEdit, onClear, onSubmit, isPending, reparti, tastieraFissa,
  fixedAmountText, onFixedAmountTextChange, mostraTicket, gestioneResto, onOpenFreeAmount, onSaveFreeAmount, onOpenHistory }: CartPanelProps) {

  const diff = totals.complessivo - totalePagato;
  // Con gestione resto + contanti l'incassato può superare il totale: è bilanciato
  // se il cliente ha dato abbastanza (diff <= 0 significa incassato >= totale).
  const balanced = gestioneResto && modoPagamento === "contanti"
    ? diff <= 0.01   // incassato copre o supera il totale
    : Math.abs(diff) < 0.01;
  const paymentModes: Array<"contanti" | "elettronico" | "ticket"> = mostraTicket
    ? ["contanti", "elettronico", "ticket"]
    : ["contanti", "elettronico"];

  return (
    <div className="h-full flex flex-col">
      {/* Cart header */}
      <div className="px-4 py-2.5 border-b flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" />
          Carrello {cart.length > 0 && <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{cart.reduce((s, i) => s + i.quantita, 0)}</span>}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-[#1e3a5f] hover:bg-blue-50"
            title="Apri elenco scontrini"
          >
            <ReceiptText className="h-3.5 w-3.5" /> Scontrini
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-[#1e3a5f]"
            title="Apri storico scontrini"
            aria-label="Apri storico scontrini"
          >
            <History className="h-4 w-4" />
          </button>
          {cart.length > 0 && (
            <button onClick={onClear} className="ml-1 flex items-center gap-1 text-xs text-red-400 hover:text-red-600">
              <Trash2 className="w-3 h-3" /> Svuota
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="min-h-[140px] h-full flex items-center justify-center text-gray-300 text-sm">
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
                    <span className="ml-1 text-gray-300">· {ivaLabel(item.aliquotaIva)}</span>
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

      {tastieraFissa ? (
        <FreeAmountKeyboard
          amountText={fixedAmountText}
          onAmountTextChange={onFixedAmountTextChange}
          isPaymentEntry={gestioneResto && cart.length > 0}
          disabled={cart.length > 0 && !gestioneResto}
        />
      ) : (
        <button
          type="button"
          onClick={onOpenFreeAmount}
          disabled={reparti.length === 0}
          className="mx-3 mb-2 shrink-0 rounded-xl border-2 border-dashed border-[#1e3a5f]/30 bg-[#1e3a5f]/5 px-3 py-2.5 text-left text-[#1e3a5f] transition-colors hover:bg-[#1e3a5f]/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="h-4 w-4" />
            Importo libero
          </span>
          <span className="mt-0.5 block pl-6 text-[10px] text-gray-500">Inserisci una cifra e scegli il reparto</span>
        </button>
      )}

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
            <div className={`grid ${mostraTicket ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
              {paymentModes.map(m => (
                <button
                  key={m}
                  onClick={() => setModoPagamento(m)}
                  className={`h-12 md:h-11 rounded-xl px-1 text-sm md:text-xs font-bold transition-all active:scale-[0.98] ${modoPagamento === m ? 'bg-[#1e3a5f] text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {m === "contanti" ? "💵 Contanti" : m === "elettronico" ? "💳 Carta" : "🎫 Ticket"}
                </button>
              ))}
            </div>

            {/* Amount inputs */}
            {modoPagamento === "contanti" && (
              <div className="space-y-2">
                {gestioneResto ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 shrink-0">Incassato €</span>
                      <CurrencyInput className="flex-1 h-11 md:h-10 rounded-lg border px-3 text-right font-mono text-base" value={importoContanti} onChange={setImportoContanti} />
                    </div>
                    {importoContanti > 0 && resto >= 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex justify-between items-center">
                        <span className="text-sm text-green-700 font-medium">Resto</span>
                        <span className="font-mono text-base font-bold text-green-700">€ {formatCurrency(resto)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    Contanti: verrà inviato ad ADE il totale esatto del documento (€ {formatCurrency(totals.complessivo)}).
                  </div>
                )}
              </div>
            )}
            {modoPagamento === "elettronico" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">Importo €</span>
                <CurrencyInput className="flex-1 h-11 md:h-10 rounded-lg border px-3 text-right font-mono text-base" value={importoElettronico} onChange={setImportoElettronico} />
              </div>
            )}
            {modoPagamento === "ticket" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">Importo €</span>
                  <CurrencyInput className="flex-1 h-11 md:h-10 rounded-lg border px-3 text-right font-mono text-base" value={importoTicket} onChange={setImportoTicket} />
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
              className="w-full bg-[#1e3a5f] hover:bg-[#1e40af] disabled:opacity-50 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-base transition-colors shadow-lg active:scale-95"
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

// ── MobileCompactCart ─────────────────────────────────────────────────────────

function MobileCompactCart({
  cart, totals, totaleConSconto, discountAmount, cartDiscount,
  modoPagamento, setModoPagamento,
  onUpdateQty, onClear, onSubmit, isPending, cartExpanded, onToggleExpand,
  onLongPressItem, onLongPressTotal, onRemoveDiscount,
}: {
  cart: CartItem[];
  totals: ReturnType<typeof calcTotals>;
  totaleConSconto: number;
  discountAmount: number;
  cartDiscount: { type: "percent" | "value"; amount: number } | null;
  modoPagamento: string;
  setModoPagamento: (m: "contanti" | "elettronico") => void;
  onUpdateQty: (idx: number, delta: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  isPending: boolean;
  cartExpanded: boolean;
  onToggleExpand: () => void;
  onLongPressItem: (idx: number) => void;
  onLongPressTotal: () => void;
  onRemoveDiscount: () => void;
}) {
  const lastTapRef = useRef<number>(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) onToggleExpand();
    lastTapRef.current = now;
  };

  const startItemLongPress = (idx: number) => {
    longPressTimer.current = setTimeout(() => onLongPressItem(idx), 500);
  };
  const cancelItemLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const startTotalLongPress = () => {
    totalLongPressTimer.current = setTimeout(() => onLongPressTotal(), 600);
  };
  const cancelTotalLongPress = () => {
    if (totalLongPressTimer.current) { clearTimeout(totalLongPressTimer.current); totalLongPressTimer.current = null; }
  };

  const visibleItems = cartExpanded ? cart : cart.slice(0, 2);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-1.5 py-1.5 border-b flex items-center justify-between shrink-0 bg-gray-50">
        <span className="text-[9px] font-semibold text-gray-600 flex items-center gap-0.5">
          <ShoppingCart className="w-3 h-3" />
          {cart.length > 0 ? `${cart.reduce((s, i) => s + i.quantita, 0)}` : "0"}
        </span>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-red-400 hover:text-red-600 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Items — doppio tap per espandere, long press per cambia prezzo */}
      <div
        className="border-b overflow-y-auto shrink-0"
        style={{ maxHeight: cartExpanded ? "45%" : 80 }}
        onDoubleClick={onToggleExpand}
        onTouchEnd={handleDoubleTap}
      >
        {cart.length === 0 ? (
          <div className="px-1.5 py-3 text-[8px] text-gray-300 text-center leading-snug">
            Tocca un articolo
          </div>
        ) : (
          <div className="divide-y">
            {visibleItems.map((item, idx) => (
              <div
                key={idx}
                className="px-1.5 py-1 flex items-center gap-0.5 select-none"
                onPointerDown={() => startItemLongPress(idx)}
                onPointerUp={cancelItemLongPress}
                onPointerLeave={cancelItemLongPress}
                onContextMenu={(e) => { e.preventDefault(); onLongPressItem(idx); }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-medium text-gray-800 truncate leading-tight">{item.nome}</p>
                  <p className="text-[8px] text-gray-400 font-mono">€{item.prezzoUnitario.toFixed(2)}×{item.quantita}</p>
                </div>
                <div className="flex flex-col items-center gap-0 shrink-0">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); cancelItemLongPress(); onUpdateQty(idx, 1); }}
                    className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-800"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                  <span className="text-[8px] font-bold text-gray-700 leading-none">{item.quantita}</span>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); cancelItemLongPress(); onUpdateQty(idx, -1); }}
                    className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-800"
                  >
                    <Minus className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
            {!cartExpanded && cart.length > 2 && (
              <div className="px-1.5 py-0.5 text-[7px] text-gray-400 text-center bg-gray-50">
                +{cart.length - 2} · 2×tap
              </div>
            )}
          </div>
        )}
      </div>

      {/* Totale — long press per aggiungere sconto */}
      {cart.length > 0 && (
        <div
          className="px-1.5 py-1 border-b shrink-0 select-none cursor-pointer active:bg-blue-50 transition-colors"
          onPointerDown={startTotalLongPress}
          onPointerUp={cancelTotalLongPress}
          onPointerLeave={cancelTotalLongPress}
          onContextMenu={(e) => { e.preventDefault(); onLongPressTotal(); }}
          title="Tieni premuto per aggiungere uno sconto"
        >
          {discountAmount > 0 ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-[8px] text-gray-400 line-through">€{formatCurrency(totals.complessivo)}</span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onRemoveDiscount(); }}
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[8px] text-amber-600 flex items-center gap-0.5">
                  <Tag className="w-2.5 h-2.5" />
                  {cartDiscount?.type === "percent" ? `−${cartDiscount.amount}%` : `−€${formatCurrency(discountAmount)}`}
                </span>
                <span className="text-sm font-bold font-mono text-green-700">€{formatCurrency(totaleConSconto)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-[8px] text-gray-500 uppercase tracking-wide">Tot.</span>
              <span className="text-sm font-bold font-mono text-gray-900">€{formatCurrency(totaleConSconto)}</span>
            </div>
          )}
        </div>
      )}

      {/* Pagamento + Emetti */}
      <div className="px-1.5 py-1.5 space-y-1 shrink-0 mt-auto">
        <div className="grid grid-cols-2 gap-0.5">
          <button
            onClick={() => setModoPagamento("contanti")}
            className={`h-8 rounded-lg text-[8px] font-bold transition-all active:scale-95 ${modoPagamento === "contanti" ? "bg-[#1e3a5f] text-white shadow" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            💵 Cont.
          </button>
          <button
            onClick={() => setModoPagamento("elettronico")}
            className={`h-8 rounded-lg text-[8px] font-bold transition-all active:scale-95 ${modoPagamento === "elettronico" ? "bg-[#1e3a5f] text-white shadow" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            💳 Carta
          </button>
        </div>
        <button
          onClick={onSubmit}
          disabled={isPending || cart.length === 0}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-[10px] flex items-center justify-center gap-1 active:scale-95 transition-all shadow-md"
        >
          {isPending ? "..." : <><Send className="w-3 h-3" />Emetti</>}
        </button>
      </div>
    </div>
  );
}

// ── PriceNumpadDialog ─────────────────────────────────────────────────────────

function PriceNumpadDialog({ art, text, onTextChange, onConfirm, onClose }: {
  art: Articolo;
  text: string;
  onTextChange: (t: string) => void;
  onConfirm: (price: number) => void;
  onClose: () => void;
}) {
  const amount = Number(text.replace(",", "."));

  const appendKey = (key: string) => {
    onTextChange((() => {
      if (key === "⌫") return text.length > 1 ? text.slice(0, -1) : "0";
      if (key === ",") return text.includes(",") ? text : (text === "0" ? "0," : text + ",");
      if (text.includes(",") && text.split(",")[1]!.length >= 2) return text;
      if (text === "0" && key !== ",") return key;
      return text + key;
    })());
  };

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "⌫"];

  return (
    <Dialog open={true} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xs rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-semibold truncate">{art.nome}</DialogTitle>
          <p className="text-xs text-muted-foreground">Prezzo non impostato — inserisci il valore</p>
        </DialogHeader>
        <div className="px-4 py-3 space-y-3">
          <div className="bg-gray-50 border rounded-xl px-4 py-3 text-right text-3xl font-mono font-bold text-gray-900 tracking-tight">
            € {text || "0"}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {keys.map(k => (
              <button
                key={k}
                onClick={() => appendKey(k)}
                className={`h-14 rounded-xl text-xl font-bold transition-all active:scale-95 ${
                  k === "⌫"
                    ? "bg-red-50 text-red-500 hover:bg-red-100"
                    : k === ","
                      ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            onClick={() => { if (amount > 0) onConfirm(amount); }}
            disabled={amount <= 0}
            className="w-full bg-[#1e3a5f] disabled:opacity-40 text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-all shadow"
          >
            Aggiungi al carrello — € {amount > 0 ? amount.toFixed(2) : "0,00"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ChangePriceDialog ─────────────────────────────────────────────────────────

function ChangePriceDialog({ item, text, onTextChange, onConfirm, onClose }: {
  item: CartItem;
  text: string;
  onTextChange: (t: string) => void;
  onConfirm: (price: number) => void;
  onClose: () => void;
}) {
  const amount = Number(text.replace(",", "."));

  const appendKey = (key: string) => {
    onTextChange((() => {
      if (key === "⌫") return text.length > 1 ? text.slice(0, -1) : "0";
      if (key === ",") return text.includes(",") ? text : (text === "0" ? "0," : text + ",");
      if (text.includes(",") && text.split(",")[1]!.length >= 2) return text;
      if (text === "0" && key !== ",") return key;
      return text + key;
    })());
  };

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "⌫"];

  return (
    <Dialog open={true} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xs rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-semibold truncate">Cambia prezzo</DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{item.nome}</p>
        </DialogHeader>
        <div className="px-4 py-3 space-y-3">
          <div className="bg-gray-50 border rounded-xl px-4 py-3 text-right text-3xl font-mono font-bold text-gray-900 tracking-tight">
            € {text || "0"}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {keys.map(k => (
              <button
                key={k}
                onClick={() => appendKey(k)}
                className={`h-14 rounded-xl text-xl font-bold transition-all active:scale-95 ${
                  k === "⌫"
                    ? "bg-red-50 text-red-500 hover:bg-red-100"
                    : k === ","
                      ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            onClick={() => { if (amount > 0) onConfirm(amount); }}
            disabled={amount <= 0}
            className="w-full bg-[#1e3a5f] disabled:opacity-40 text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-all shadow"
          >
            Conferma — € {amount > 0 ? amount.toFixed(2) : "0,00"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── DiscountDialog ────────────────────────────────────────────────────────────

function DiscountDialog({ total, onApply, onClose }: {
  total: number;
  onApply: (type: "percent" | "value", amount: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"value" | "percent">("value");
  const [text, setText] = useState("0");

  const amount = Number(text.replace(",", "."));
  const preview = tab === "percent"
    ? Math.round(total * amount / 100 * 100) / 100
    : Math.min(amount, total);
  const isValid = amount > 0 && (tab === "percent" ? amount <= 100 : amount <= total);

  const appendKey = (key: string) => {
    setText(prev => {
      if (key === "⌫") return prev.length > 1 ? prev.slice(0, -1) : "0";
      if (key === ",") {
        if (tab === "percent") return prev; // no decimals for percent
        return prev.includes(",") ? prev : (prev === "0" ? "0," : prev + ",");
      }
      if (prev.includes(",") && prev.split(",")[1]!.length >= 2) return prev;
      if (prev === "0" && key !== ",") return key;
      return prev + key;
    });
  };

  const switchTab = (t: "value" | "percent") => {
    setTab(t);
    setText("0");
  };

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", tab === "value" ? "," : "", "0", "⌫"];

  return (
    <Dialog open={true} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xs rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="text-sm font-semibold">Sconto sul totale</DialogTitle>
          <p className="text-xs text-muted-foreground">Totale lordo: € {formatCurrency(total)}</p>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => switchTab("value")}
              className={`h-8 rounded-lg text-sm font-bold flex items-center justify-center gap-1 transition-all ${
                tab === "value" ? "bg-white shadow text-[#1e3a5f]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="font-mono">€</span> Valore
            </button>
            <button
              onClick={() => switchTab("percent")}
              className={`h-8 rounded-lg text-sm font-bold flex items-center justify-center gap-1 transition-all ${
                tab === "percent" ? "bg-white shadow text-[#1e3a5f]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Percent className="w-3.5 h-3.5" /> Percentuale
            </button>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="bg-gray-50 border rounded-xl px-4 py-3 text-right text-3xl font-mono font-bold text-gray-900 tracking-tight">
            {tab === "value" ? "€ " : ""}{text || "0"}{tab === "percent" ? " %" : ""}
          </div>
          {isValid && (
            <div className="text-center text-sm text-green-700 bg-green-50 rounded-lg py-1.5">
              Totale dopo sconto: <strong>€ {formatCurrency(total - preview)}</strong>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {keys.map((k, i) => (
              k === "" ? (
                <div key={i} />
              ) : (
                <button
                  key={k}
                  onClick={() => appendKey(k)}
                  className={`h-12 rounded-xl text-xl font-bold transition-all active:scale-95 ${
                    k === "⌫"
                      ? "bg-red-50 text-red-500 hover:bg-red-100"
                      : k === ","
                        ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {k}
                </button>
              )
            ))}
          </div>
          <button
            onClick={() => { if (isValid) onApply(tab, amount); }}
            disabled={!isValid}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-all shadow"
          >
            {isValid
              ? `Applica sconto — risparmio € ${formatCurrency(preview)}`
              : "Inserisci uno sconto valido"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── FreeAmountKeyboard ────────────────────────────────────────────────────────

function FreeAmountKeyboard({
  amountText,
  onAmountTextChange,
  isPaymentEntry,
  disabled,
}: {
  amountText: string;
  onAmountTextChange: (value: string) => void;
  isPaymentEntry: boolean;
  disabled: boolean;
}) {
  const appendKey = (key: string) => {
    onAmountTextChange((() => {
      const prev = amountText;
      if (key === "backspace") return prev.slice(0, -1);
      if (key === "clear") return "";
      if (key === ",") return prev.includes(",") || prev.includes(".") ? prev : (prev || "0") + ",";
      if (prev.includes(",") && prev.split(",")[1]!.length >= 2) return prev;
      if (prev === "0" && key !== ",") return key;
      return prev + key;
    })());
  };

  const amount = Number(amountText.replace(",", "."));

  return (
    <div className="mx-3 mb-2 shrink-0 rounded-xl border border-[#1e3a5f]/20 bg-white p-2.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-[#1e3a5f]">
          <Calculator className="h-3.5 w-3.5" /> {isPaymentEntry ? "Incassato contanti" : "Importo libero"}
        </span>
        <span className="rounded-md bg-[#1e3a5f] px-2.5 py-1 text-lg font-bold tracking-wide text-white">
          € {amountText || "0,00"}
        </span>
      </div>
      <p className="mb-2 text-[11px] leading-tight text-gray-500">
        {isPaymentEntry
          ? "Inserisci la banconota ricevuta: l'importo viene usato solo per il pagamento in contanti."
          : disabled
            ? "Il totale del carrello è già pronto per l’emissione. La tastiera resta visibile ma non modifica il pagamento."
            : "Inserisci la cifra, poi scegli reparto e articolo. IVA e reparto vengono presi automaticamente dall'articolo."}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0"].map(key => (
          <button
            key={key}
            type="button"
            onClick={() => appendKey(key)}
            disabled={disabled}
            className="h-11 rounded-lg border bg-gray-50 text-lg font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-100 active:scale-95 md:h-10"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => appendKey("backspace")}
          disabled={disabled}
          aria-label="Cancella ultima cifra"
          className="flex h-11 items-center justify-center rounded-lg border bg-gray-100 text-gray-600 shadow-sm hover:bg-gray-200 active:scale-95 disabled:opacity-40 md:h-10"
        >
          <Delete className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-[11px] font-medium ${Number.isFinite(amount) && amount > 0 ? "text-green-700" : "text-gray-400"}`}>
          {Number.isFinite(amount) && amount > 0
            ? isPaymentEntry ? "Importo pronto per Contanti" : "Ora scegli un articolo"
            : disabled ? "Pagamento già pronto" : isPaymentEntry ? "Digita la banconota ricevuta" : "Digita un importo"}
        </span>
        <button type="button" onClick={() => appendKey("clear")} disabled={disabled} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40">
          Cancella cifra
        </button>
      </div>
    </div>
  );
}

function FreeAmountDialog({
  reparti,
  onSave,
  onClose,
}: {
  reparti: Catalog["reparti"];
  onSave: (amount: number, repartoId: string, aliquotaIva: AliquotaIva) => void;
  onClose: () => void;
}) {
  const [amountText, setAmountText] = useState("");
  const [repartoId, setRepartoId] = useState(reparti[0]?.id ?? "");
  const [aliquotaIva, setAliquotaIva] = useState<AliquotaIva>("22");

  const appendKey = (key: string) => {
    setAmountText(prev => {
      if (key === "backspace") return prev.slice(0, -1);
      if (key === "clear") return "";
      if (key === ",") return prev.includes(",") || prev.includes(".") ? prev : (prev || "0") + ",";
      if (prev.includes(",") && prev.split(",")[1]!.length >= 2) return prev;
      if (prev === "0" && key !== ",") return key;
      return prev + key;
    });
  };

  const amount = Number(amountText.replace(",", "."));
  const canSave = Number.isFinite(amount) && amount > 0 && !!repartoId;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#1e3a5f]" />
            Importo libero
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="rounded-xl bg-[#1e3a5f] px-4 py-3 text-right text-3xl font-bold tracking-wide text-white">
            € {amountText || "0,00"}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0"].map(key => (
              <button
                key={key}
                type="button"
                onClick={() => appendKey(key)}
                className="h-11 rounded-lg border bg-white text-lg font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-95"
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={() => appendKey("backspace")}
              aria-label="Cancella ultima cifra"
              className="flex h-11 items-center justify-center rounded-lg border bg-gray-100 text-gray-600 shadow-sm hover:bg-gray-200 active:scale-95"
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>
          <button type="button" onClick={() => appendKey("clear")} className="w-full rounded-lg py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50">
            Cancella importo
          </button>
          <div className="space-y-1.5">
            <Label>Reparto</Label>
            <Select value={repartoId} onValueChange={setRepartoId}>
              <SelectTrigger><SelectValue placeholder="Seleziona reparto" /></SelectTrigger>
              <SelectContent>
                {reparti.map(reparto => <SelectItem key={reparto.id} value={reparto.id}>{reparto.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Aliquota IVA</Label>
            <Select value={aliquotaIva} onValueChange={value => setAliquotaIva(value as AliquotaIva)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {IVA_OPTIONS.map(value => <SelectItem key={value} value={value}>{ivaLabel(value)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annulla</Button>
            <Button className="flex-1 bg-[#1e3a5f]" disabled={!canSave} onClick={() => onSave(Math.round(amount * 100) / 100, repartoId, aliquotaIva)}>
              Aggiungi al carrello
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── EditItemDialog ────────────────────────────────────────────────────────────

function EditItemDialog({ item, onSave, onClose }: { item: CartItem; onSave: (p: Partial<CartItem>) => void; onClose: () => void }) {
  const [prezzo, setPrezzo] = useState(item.prezzoUnitario);
  const [iva, setIva] = useState<AliquotaIva>(normalizeAliquotaIva(item.aliquotaIva));
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
                {IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{ivaLabel(o)}</SelectItem>)}
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

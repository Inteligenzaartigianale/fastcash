import { getApiBase } from "./capacitor";
import { getAuthHeaders } from "./auth-token";

export type NaturaIva = "N1" | "N2" | "N3" | "N4" | "N5" | "N6";
export type AliquotaIva = "22" | "10" | "5" | "4" | NaturaIva;

export const ALIQUOTE_IVA = [
  { value: "4", label: "IVA 4%" },
  { value: "5", label: "IVA 5%" },
  { value: "10", label: "IVA 10%" },
  { value: "22", label: "IVA 22%" },
] as const;

export const NATURE_IVA: Array<{ value: NaturaIva; label: string; description: string }> = [
  { value: "N1", label: "N1 — escluse ex art. 15", description: "Somme escluse dalla base imponibile ai sensi dell'art. 15 DPR 633/1972." },
  { value: "N2", label: "N2 — non soggette", description: "Operazioni non soggette a IVA." },
  { value: "N3", label: "N3 — non imponibili", description: "Operazioni non imponibili IVA." },
  { value: "N4", label: "N4 — esenti", description: "Operazioni esenti IVA." },
  { value: "N5", label: "N5 — regime del margine", description: "Operazioni in regime del margine." },
  { value: "N6", label: "N6 — altro non IVA", description: "Operazioni che non rientrano nelle altre nature IVA." },
];

export function isNaturaIva(value: string): value is NaturaIva {
  return /^N[1-6]$/.test(value);
}

export function ivaLabel(value: string): string {
  return isNaturaIva(value) ? `IVA 0% · ${value}` : `IVA ${value}%`;
}

export function normalizeAliquotaIva(value: string): AliquotaIva {
  if (value === "Esente") return "N4";
  if (value === "Non soggette") return "N2";
  if (value === "22" || value === "10" || value === "5" || value === "4" || isNaturaIva(value)) {
    return value;
  }
  return "22";
}

export interface Reparto {
  id: string;
  nome: string;
  colore: string;
}

export interface Articolo {
  id: string;
  nome: string;
  prezzoUnitario: number;
  aliquotaIva: AliquotaIva;
  repartoId: string;
  giacenza: number;
  pezziVenduti: number;
  sogliaSottoscorta: number;
  attivo: boolean;
}

export interface Impostazioni {
  importoMassimoDco: number | null;
  tastieraFissa: boolean;
  mostraTicket: boolean;
  gestioneResto: boolean;
  mostraTipoOperazione: boolean;
  carrelloLargo: boolean;
  nrFattura: boolean;
  nrPrestazioni: boolean;
  nrSanitarie: boolean;
  nrTicketNr: boolean;
  dimensioneTasti: "S" | "M" | "L" | "XL" | "XXL";
}

export interface Catalog {
  reparti: Reparto[];
  articoli: Articolo[];
  impostazioni?: Impostazioni;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...getAuthHeaders(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${method} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchCatalog  = ()                                          => api<Catalog>("GET",    "/catalog");
export const updateImpostazioni = (patch: Partial<Impostazioni>)          => api<Impostazioni>("PUT", "/catalog/impostazioni", patch);
export const createReparto = (nome: string, colore: string)              => api<Reparto>("POST",   "/catalog/reparti",       { nome, colore });
export const updateReparto = (id: string, patch: Partial<Reparto>)       => api<Reparto>("PUT",    `/catalog/reparti/${id}`, patch);
export const deleteReparto = (id: string)                                => api<void>  ("DELETE", `/catalog/reparti/${id}`);
export const createArticolo = (a: Omit<Articolo, "id">)                  => api<Articolo>("POST",  "/catalog/articoli",         a);
export const updateArticolo = (id: string, patch: Partial<Articolo>)     => api<Articolo>("PUT",   `/catalog/articoli/${id}`,   patch);
export const deleteArticolo = (id: string)                               => api<void>   ("DELETE", `/catalog/articoli/${id}`);

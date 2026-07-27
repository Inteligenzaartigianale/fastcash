export type AliquotaIva = "22" | "10" | "5" | "4" | "Esente" | "Non soggette";

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
  attivo: boolean;
}

export interface Catalog {
  reparti: Reparto[];
  articoli: Articolo[];
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${method} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchCatalog  = ()                                          => api<Catalog>("GET",    "/catalog");
export const createReparto = (nome: string, colore: string)              => api<Reparto>("POST",   "/catalog/reparti",       { nome, colore });
export const updateReparto = (id: string, patch: Partial<Reparto>)       => api<Reparto>("PUT",    `/catalog/reparti/${id}`, patch);
export const deleteReparto = (id: string)                                => api<void>  ("DELETE", `/catalog/reparti/${id}`);
export const createArticolo = (a: Omit<Articolo, "id">)                  => api<Articolo>("POST",  "/catalog/articoli",         a);
export const updateArticolo = (id: string, patch: Partial<Articolo>)     => api<Articolo>("PUT",   `/catalog/articoli/${id}`,   patch);
export const deleteArticolo = (id: string)                               => api<void>   ("DELETE", `/catalog/articoli/${id}`);

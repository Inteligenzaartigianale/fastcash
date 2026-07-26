// Catalog types — data lives in PostgreSQL via API, not localStorage

export type AliquotaIva = "22" | "10" | "5" | "4" | "Esente" | "Non soggette";

export interface Reparto {
  id: string;
  nome: string;
  colore: string;
}

export interface Categoria {
  id: string;
  nome: string;
  repartoId: string;
}

export interface Articolo {
  id: string;
  nome: string;
  prezzoUnitario: number;
  aliquotaIva: AliquotaIva;
  categoriaId: string;
  attivo: boolean;
}

export interface Catalog {
  reparti: Reparto[];
  categorie: Categoria[];
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

export const fetchCatalog = ()                                         => api<Catalog>("GET",    "/catalog");
export const createReparto  = (nome: string, colore: string)           => api<Reparto>("POST",   "/catalog/reparti",       { nome, colore });
export const updateReparto  = (id: string, patch: Partial<Reparto>)    => api<Reparto>("PUT",    `/catalog/reparti/${id}`, patch);
export const deleteReparto  = (id: string)                             => api<void>  ("DELETE", `/catalog/reparti/${id}`);
export const createCategoria  = (nome: string, repartoId: string)       => api<Categoria>("POST",   "/catalog/categorie",        { nome, repartoId });
export const updateCategoria  = (id: string, patch: Partial<Categoria>) => api<Categoria>("PUT",    `/catalog/categorie/${id}`,  patch);
export const deleteCategoria  = (id: string)                             => api<void>    ("DELETE", `/catalog/categorie/${id}`);
export const createArticolo   = (a: Omit<Articolo, "id">)               => api<Articolo>("POST",   "/catalog/articoli",         a);
export const updateArticolo   = (id: string, patch: Partial<Articolo>)  => api<Articolo>("PUT",    `/catalog/articoli/${id}`,   patch);
export const deleteArticolo   = (id: string)                             => api<void>   ("DELETE", `/catalog/articoli/${id}`);

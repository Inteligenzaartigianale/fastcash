import { nanoid } from "nanoid";

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

export type AliquotaIva = "22" | "10" | "5" | "4" | "Esente" | "Non soggette";

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

const KEY = "fastcash_catalog_v1";

const DEFAULTS: Catalog = {
  reparti: [
    { id: "r1", nome: "Alimentari", colore: "#16a34a" },
    { id: "r2", nome: "Bevande", colore: "#2563eb" },
    { id: "r3", nome: "Servizi", colore: "#d97706" },
  ],
  categorie: [
    { id: "c1", nome: "Pane & Pasta", repartoId: "r1" },
    { id: "c2", nome: "Latticini", repartoId: "r1" },
    { id: "c3", nome: "Analcoliche", repartoId: "r2" },
    { id: "c4", nome: "Alcoliche", repartoId: "r2" },
    { id: "c5", nome: "Consulenza", repartoId: "r3" },
  ],
  articoli: [
    { id: "a1", nome: "Pane integrale", prezzoUnitario: 2.50, aliquotaIva: "4", categoriaId: "c1", attivo: true },
    { id: "a2", nome: "Pasta 500g", prezzoUnitario: 1.80, aliquotaIva: "4", categoriaId: "c1", attivo: true },
    { id: "a3", nome: "Mozzarella", prezzoUnitario: 1.50, aliquotaIva: "10", categoriaId: "c2", attivo: true },
    { id: "a4", nome: "Acqua 1.5L", prezzoUnitario: 0.80, aliquotaIva: "10", categoriaId: "c3", attivo: true },
    { id: "a5", nome: "Caffè", prezzoUnitario: 1.20, aliquotaIva: "10", categoriaId: "c3", attivo: true },
    { id: "a6", nome: "Vino rosso 0.75L", prezzoUnitario: 8.50, aliquotaIva: "22", categoriaId: "c4", attivo: true },
  ],
};

export function loadCatalog(): Catalog {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Catalog;
  } catch {}
  return structuredClone(DEFAULTS);
}

export function saveCatalog(c: Catalog): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

export function addReparto(c: Catalog, nome: string, colore: string): Catalog {
  return { ...c, reparti: [...c.reparti, { id: nanoid(), nome, colore }] };
}

export function updateReparto(c: Catalog, id: string, patch: Partial<Reparto>): Catalog {
  return { ...c, reparti: c.reparti.map(r => r.id === id ? { ...r, ...patch } : r) };
}

export function deleteReparto(c: Catalog, id: string): Catalog {
  const catIds = c.categorie.filter(ca => ca.repartoId === id).map(ca => ca.id);
  return {
    ...c,
    reparti: c.reparti.filter(r => r.id !== id),
    categorie: c.categorie.filter(ca => ca.repartoId !== id),
    articoli: c.articoli.filter(a => !catIds.includes(a.categoriaId)),
  };
}

export function addCategoria(c: Catalog, nome: string, repartoId: string): Catalog {
  return { ...c, categorie: [...c.categorie, { id: nanoid(), nome, repartoId }] };
}

export function updateCategoria(c: Catalog, id: string, patch: Partial<Categoria>): Catalog {
  return { ...c, categorie: c.categorie.map(ca => ca.id === id ? { ...ca, ...patch } : ca) };
}

export function deleteCategoria(c: Catalog, id: string): Catalog {
  return {
    ...c,
    categorie: c.categorie.filter(ca => ca.id !== id),
    articoli: c.articoli.filter(a => a.categoriaId !== id),
  };
}

export function addArticolo(c: Catalog, a: Omit<Articolo, "id">): Catalog {
  return { ...c, articoli: [...c.articoli, { ...a, id: nanoid() }] };
}

export function updateArticolo(c: Catalog, id: string, patch: Partial<Articolo>): Catalog {
  return { ...c, articoli: c.articoli.map(a => a.id === id ? { ...a, ...patch } : a) };
}

export function deleteArticolo(c: Catalog, id: string): Catalog {
  return { ...c, articoli: c.articoli.filter(a => a.id !== id) };
}

import { Router, type IRouter } from "express";
import { db, repartiTable, categorieTable, articoliTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const DEFAULTS = {
  reparti: [
    { id: randomUUID(), nome: "Alimentari", colore: "#16a34a" },
    { id: randomUUID(), nome: "Bevande",    colore: "#2563eb" },
    { id: randomUUID(), nome: "Servizi",    colore: "#d97706" },
  ],
};

// ── Seed defaults if empty ────────────────────────────────────────────────────
async function seedIfEmpty() {
  const existing = await db.select().from(repartiTable).limit(1);
  if (existing.length > 0) return;
  for (const r of DEFAULTS.reparti) {
    await db.insert(repartiTable).values(r).onConflictDoNothing();
  }
}

// ── GET /catalog — full catalog ───────────────────────────────────────────────
router.get("/catalog", async (_req, res): Promise<void> => {
  await seedIfEmpty();
  const [reparti, categorie, articoli] = await Promise.all([
    db.select().from(repartiTable).orderBy(repartiTable.createdAt),
    db.select().from(categorieTable).orderBy(categorieTable.createdAt),
    db.select().from(articoliTable).orderBy(articoliTable.createdAt),
  ]);
  res.json({
    reparti,
    categorie,
    articoli: articoli.map(a => ({ ...a, prezzoUnitario: parseFloat(a.prezzoUnitario) })),
  });
});

// ── REPARTI ───────────────────────────────────────────────────────────────────
router.post("/catalog/reparti", async (req, res): Promise<void> => {
  const { nome, colore } = req.body as { nome: string; colore: string };
  if (!nome?.trim()) { res.status(400).json({ error: "Nome obbligatorio" }); return; }
  const [row] = await db.insert(repartiTable).values({ id: randomUUID(), nome: nome.trim(), colore: colore ?? "#1e3a5f" }).returning();
  res.json(row);
});

router.put("/catalog/reparti/:id", async (req, res): Promise<void> => {
  const { nome, colore } = req.body as { nome?: string; colore?: string };
  const [row] = await db.update(repartiTable).set({ ...(nome && { nome: nome.trim() }), ...(colore && { colore }) }).where(eq(repartiTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Reparto non trovato" }); return; }
  res.json(row);
});

router.delete("/catalog/reparti/:id", async (req, res): Promise<void> => {
  await db.delete(repartiTable).where(eq(repartiTable.id, req.params.id));
  res.json({ success: true });
});

// ── CATEGORIE ─────────────────────────────────────────────────────────────────
router.post("/catalog/categorie", async (req, res): Promise<void> => {
  const { nome, repartoId } = req.body as { nome: string; repartoId: string };
  if (!nome?.trim() || !repartoId) { res.status(400).json({ error: "Nome e repartoId obbligatori" }); return; }
  const [row] = await db.insert(categorieTable).values({ id: randomUUID(), nome: nome.trim(), repartoId }).returning();
  res.json(row);
});

router.put("/catalog/categorie/:id", async (req, res): Promise<void> => {
  const { nome, repartoId } = req.body as { nome?: string; repartoId?: string };
  const [row] = await db.update(categorieTable).set({ ...(nome && { nome: nome.trim() }), ...(repartoId && { repartoId }) }).where(eq(categorieTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Categoria non trovata" }); return; }
  res.json(row);
});

router.delete("/catalog/categorie/:id", async (req, res): Promise<void> => {
  await db.delete(categorieTable).where(eq(categorieTable.id, req.params.id));
  res.json({ success: true });
});

// ── ARTICOLI ──────────────────────────────────────────────────────────────────
router.post("/catalog/articoli", async (req, res): Promise<void> => {
  const { nome, prezzoUnitario, aliquotaIva, categoriaId, attivo } = req.body as {
    nome: string; prezzoUnitario: number; aliquotaIva: string; categoriaId: string; attivo?: boolean;
  };
  if (!nome?.trim() || !categoriaId || prezzoUnitario == null) {
    res.status(400).json({ error: "Campi obbligatori mancanti" }); return;
  }
  const [row] = await db.insert(articoliTable).values({
    id: randomUUID(), nome: nome.trim(),
    prezzoUnitario: String(prezzoUnitario),
    aliquotaIva: aliquotaIva ?? "22",
    categoriaId,
    attivo: attivo ?? true,
  }).returning();
  res.json({ ...row, prezzoUnitario: parseFloat(row.prezzoUnitario) });
});

router.put("/catalog/articoli/:id", async (req, res): Promise<void> => {
  const { nome, prezzoUnitario, aliquotaIva, categoriaId, attivo } = req.body as {
    nome?: string; prezzoUnitario?: number; aliquotaIva?: string; categoriaId?: string; attivo?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (nome != null) patch.nome = nome.trim();
  if (prezzoUnitario != null) patch.prezzoUnitario = String(prezzoUnitario);
  if (aliquotaIva != null) patch.aliquotaIva = aliquotaIva;
  if (categoriaId != null) patch.categoriaId = categoriaId;
  if (attivo != null) patch.attivo = attivo;
  const [row] = await db.update(articoliTable).set(patch).where(eq(articoliTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Articolo non trovato" }); return; }
  res.json({ ...row, prezzoUnitario: parseFloat(row.prezzoUnitario) });
});

router.delete("/catalog/articoli/:id", async (req, res): Promise<void> => {
  await db.delete(articoliTable).where(eq(articoliTable.id, req.params.id));
  res.json({ success: true });
});

export default router;

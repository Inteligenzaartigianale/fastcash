import { Router, type IRouter } from "express";
import { db, repartiTable, articoliTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

function normalizeAliquotaIva(value: string | null | undefined): string {
  if (value === "Esente") return "N4";
  if (value === "Non soggette") return "N2";
  if (value && (/^(4|5|10|22)$/.test(value) || /^N[1-6]$/.test(value))) return value;
  return "22";
}

// ── GET /catalog ──────────────────────────────────────────────────────────────
router.get("/catalog", async (_req, res): Promise<void> => {
  const [reparti, articoli] = await Promise.all([
    db.select().from(repartiTable).orderBy(repartiTable.createdAt),
    db.select().from(articoliTable).orderBy(articoliTable.createdAt),
  ]);
  res.json({
    reparti,
    articoli: articoli.map(a => ({
      ...a,
      prezzoUnitario: parseFloat(a.prezzoUnitario),
      aliquotaIva: normalizeAliquotaIva(a.aliquotaIva),
    })),
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

// ── ARTICOLI ──────────────────────────────────────────────────────────────────
router.post("/catalog/articoli", async (req, res): Promise<void> => {
  const { nome, prezzoUnitario, aliquotaIva, repartoId, attivo } = req.body as {
    nome: string; prezzoUnitario: number; aliquotaIva: string; repartoId: string; attivo?: boolean;
  };
  if (!nome?.trim() || !repartoId || prezzoUnitario == null) {
    res.status(400).json({ error: "Campi obbligatori mancanti" }); return;
  }
  const [row] = await db.insert(articoliTable).values({
    id: randomUUID(), nome: nome.trim(),
    prezzoUnitario: String(prezzoUnitario),
    aliquotaIva: normalizeAliquotaIva(aliquotaIva),
    repartoId,
    attivo: attivo ?? true,
  }).returning();
  res.json({ ...row, prezzoUnitario: parseFloat(row.prezzoUnitario) });
});

router.put("/catalog/articoli/:id", async (req, res): Promise<void> => {
  const { nome, prezzoUnitario, aliquotaIva, repartoId, attivo } = req.body as {
    nome?: string; prezzoUnitario?: number; aliquotaIva?: string; repartoId?: string; attivo?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (nome != null) patch.nome = nome.trim();
  if (prezzoUnitario != null) patch.prezzoUnitario = String(prezzoUnitario);
  if (aliquotaIva != null) patch.aliquotaIva = normalizeAliquotaIva(aliquotaIva);
  if (repartoId != null) patch.repartoId = repartoId;
  if (attivo != null) patch.attivo = attivo;
  const [row] = await db.update(articoliTable).set(patch).where(eq(articoliTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Articolo non trovato" }); return; }
  res.json({ ...row, prezzoUnitario: parseFloat(row.prezzoUnitario), aliquotaIva: normalizeAliquotaIva(row.aliquotaIva) });
});

router.delete("/catalog/articoli/:id", async (req, res): Promise<void> => {
  await db.delete(articoliTable).where(eq(articoliTable.id, req.params.id));
  res.json({ success: true });
});

export default router;

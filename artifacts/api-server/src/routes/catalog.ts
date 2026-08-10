import { Router, type IRouter } from "express";
import { db, repartiTable, articoliTable, impostazioniTable } from "@workspace/db";
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
  const [reparti, articoli, settingsRows] = await Promise.all([
    db.select().from(repartiTable).orderBy(repartiTable.createdAt),
    db.select().from(articoliTable).orderBy(articoliTable.createdAt),
    db.select().from(impostazioniTable).limit(1),
  ]);
  const settings = settingsRows[0] ?? { id: "default", importoMassimoDco: null, tastieraFissa: false, dimensioneTasti: "S" };
  res.json({
    reparti,
    articoli: articoli.map(a => ({
      ...a,
      prezzoUnitario: parseFloat(a.prezzoUnitario),
      aliquotaIva: normalizeAliquotaIva(a.aliquotaIva),
    })),
    impostazioni: {
      importoMassimoDco: settings.importoMassimoDco == null ? null : parseFloat(settings.importoMassimoDco),
      tastieraFissa: settings.tastieraFissa,
      dimensioneTasti: settings.dimensioneTasti,
    },
  });
});

router.put("/catalog/impostazioni", async (req, res): Promise<void> => {
  const raw = req.body?.importoMassimoDco;
  const value = raw === null || raw === "" || raw === undefined ? null : Number(raw);
  const tastieraFissa = req.body?.tastieraFissa;
  const dimensioneTasti = req.body?.dimensioneTasti;
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    res.status(400).json({ error: "L'importo massimo deve essere un numero positivo o vuoto" });
    return;
  }
  if (tastieraFissa !== undefined && typeof tastieraFissa !== "boolean") {
    res.status(400).json({ error: "Il valore della tastiera fissa non è valido" });
    return;
  }
  if (dimensioneTasti !== undefined && !["S", "M", "L", "XL", "XXL"].includes(dimensioneTasti)) {
    res.status(400).json({ error: "La dimensione dei tasti non è valida" });
    return;
  }

  const [row] = await db
    .insert(impostazioniTable)
    .values({
      id: "default",
      importoMassimoDco: value === null ? null : value.toFixed(2),
      tastieraFissa: tastieraFissa ?? false,
      dimensioneTasti: dimensioneTasti ?? "S",
    })
    .onConflictDoUpdate({
      target: impostazioniTable.id,
      set: {
        ...(req.body?.importoMassimoDco !== undefined
          ? { importoMassimoDco: value === null ? null : value.toFixed(2) }
          : {}),
        ...(tastieraFissa !== undefined ? { tastieraFissa } : {}),
        ...(dimensioneTasti !== undefined ? { dimensioneTasti } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json({
    importoMassimoDco: row.importoMassimoDco == null ? null : parseFloat(row.importoMassimoDco),
    tastieraFissa: row.tastieraFissa,
    dimensioneTasti: row.dimensioneTasti,
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
  const { nome, prezzoUnitario, aliquotaIva, repartoId, giacenza, pezziVenduti, sogliaSottoscorta, attivo } = req.body as {
    nome: string; prezzoUnitario: number; aliquotaIva: string; repartoId: string;
    giacenza?: number; pezziVenduti?: number; sogliaSottoscorta?: number; attivo?: boolean;
  };
  if (!nome?.trim() || !repartoId || prezzoUnitario == null) {
    res.status(400).json({ error: "Campi obbligatori mancanti" }); return;
  }
  const [row] = await db.insert(articoliTable).values({
    id: randomUUID(), nome: nome.trim(),
    prezzoUnitario: String(prezzoUnitario),
    aliquotaIva: normalizeAliquotaIva(aliquotaIva),
    repartoId,
    giacenza: Number.isFinite(giacenza) ? Math.trunc(giacenza!) : 0,
    pezziVenduti: Number.isFinite(pezziVenduti) ? Math.trunc(pezziVenduti!) : 0,
    sogliaSottoscorta: Number.isFinite(sogliaSottoscorta) ? Math.max(0, Math.trunc(sogliaSottoscorta!)) : 0,
    attivo: attivo ?? true,
  }).returning();
  res.json({ ...row, prezzoUnitario: parseFloat(row.prezzoUnitario) });
});

router.put("/catalog/articoli/:id", async (req, res): Promise<void> => {
  const { nome, prezzoUnitario, aliquotaIva, repartoId, giacenza, pezziVenduti, sogliaSottoscorta, attivo } = req.body as {
    nome?: string; prezzoUnitario?: number; aliquotaIva?: string; repartoId?: string;
    giacenza?: number; pezziVenduti?: number; sogliaSottoscorta?: number; attivo?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (nome != null) patch.nome = nome.trim();
  if (prezzoUnitario != null) patch.prezzoUnitario = String(prezzoUnitario);
  if (aliquotaIva != null) patch.aliquotaIva = normalizeAliquotaIva(aliquotaIva);
  if (repartoId != null) patch.repartoId = repartoId;
  if (giacenza != null && Number.isFinite(giacenza)) patch.giacenza = Math.trunc(giacenza);
  if (pezziVenduti != null && Number.isFinite(pezziVenduti)) patch.pezziVenduti = Math.trunc(pezziVenduti);
  if (sogliaSottoscorta != null && Number.isFinite(sogliaSottoscorta)) patch.sogliaSottoscorta = Math.max(0, Math.trunc(sogliaSottoscorta));
  if (attivo != null) patch.attivo = attivo;
  const [row] = await db.update(articoliTable).set(patch).where(eq(articoliTable.id, req.params.id)).returning();
  if (!row) { res.status(404).json({ error: "Articolo non trovato" }); return; }
  res.json({
    ...row,
    prezzoUnitario: parseFloat(row.prezzoUnitario),
    aliquotaIva: normalizeAliquotaIva(row.aliquotaIva),
  });
});

router.delete("/catalog/articoli/:id", async (req, res): Promise<void> => {
  await db.delete(articoliTable).where(eq(articoliTable.id, req.params.id));
  res.json({ success: true });
});

export default router;

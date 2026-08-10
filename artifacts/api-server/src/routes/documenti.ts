import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, documentiTable } from "@workspace/db";
import { isSessionValid } from "../lib/session.js";

const router: IRouter = Router();

function toApiDocument(document: typeof documentiTable.$inferSelect) {
  return {
    ...document,
    totale: Number(document.totale),
  };
}

router.get("/documenti", async (req, res): Promise<void> => {
  if (!isSessionValid()) {
    res.status(401).json({ error: "Non autenticato." });
    return;
  }

  const dataDa = typeof req.query.dataDa === "string" ? req.query.dataDa : undefined;
  const dataA = typeof req.query.dataA === "string" ? req.query.dataA : undefined;
  const filters = [
    dataDa ? gte(documentiTable.dataEmissione, dataDa) : undefined,
    dataA ? lte(documentiTable.dataEmissione, dataA) : undefined,
  ].filter((value): value is NonNullable<typeof value> => value !== undefined);

  const documents = await db
    .select()
    .from(documentiTable)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(documentiTable.dataEmissione), desc(documentiTable.createdAt));

  res.json(documents.map(toApiDocument));
});

router.get("/documenti/:id", async (req, res): Promise<void> => {
  if (!isSessionValid()) {
    res.status(401).json({ error: "Non autenticato." });
    return;
  }

  const [document] = await db
    .select()
    .from(documentiTable)
    .where(eq(documentiTable.id, req.params.id));

  if (!document) {
    res.status(404).json({ error: "Documento non trovato." });
    return;
  }

  res.json(toApiDocument(document));
});

export default router;
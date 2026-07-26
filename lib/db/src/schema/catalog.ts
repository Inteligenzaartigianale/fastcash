import { pgTable, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const repartiTable = pgTable("reparti", {
  id:     text("id").primaryKey(),
  nome:   text("nome").notNull(),
  colore: text("colore").notNull().default("#1e3a5f"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categorieTable = pgTable("categorie", {
  id:        text("id").primaryKey(),
  nome:      text("nome").notNull(),
  repartoId: text("reparto_id").notNull().references(() => repartiTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const articoliTable = pgTable("articoli", {
  id:              text("id").primaryKey(),
  nome:            text("nome").notNull(),
  prezzoUnitario:  numeric("prezzo_unitario", { precision: 10, scale: 2 }).notNull(),
  aliquotaIva:     text("aliquota_iva").notNull().default("22"),
  categoriaId:     text("categoria_id").notNull().references(() => categorieTable.id, { onDelete: "cascade" }),
  attivo:          boolean("attivo").notNull().default(true),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
});

export const insertRepartoSchema  = createInsertSchema(repartiTable).omit({ createdAt: true });
export const insertCategoriaSchema = createInsertSchema(categorieTable).omit({ createdAt: true });
export const insertArticoloSchema  = createInsertSchema(articoliTable).omit({ createdAt: true });

export type Reparto   = typeof repartiTable.$inferSelect;
export type Categoria = typeof categorieTable.$inferSelect;
export type Articolo  = typeof articoliTable.$inferSelect;

import { pgTable, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const repartiTable = pgTable("reparti", {
  id:        text("id").primaryKey(),
  nome:      text("nome").notNull(),
  colore:    text("colore").notNull().default("#1e3a5f"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const articoliTable = pgTable("articoli", {
  id:             text("id").primaryKey(),
  nome:           text("nome").notNull(),
  prezzoUnitario: numeric("prezzo_unitario", { precision: 10, scale: 2 }).notNull(),
  aliquotaIva:    text("aliquota_iva").notNull().default("22"),
  repartoId:      text("reparto_id").notNull().references(() => repartiTable.id, { onDelete: "cascade" }),
  giacenza:       integer("giacenza").notNull().default(0),
  pezziVenduti:   integer("pezzi_venduti").notNull().default(0),
  sogliaSottoscorta: integer("soglia_sottoscorta").notNull().default(0),
  attivo:         boolean("attivo").notNull().default(true),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

export const impostazioniTable = pgTable("impostazioni", {
  id:               text("id").primaryKey(),
  importoMassimoDco: numeric("importo_massimo_dco", { precision: 10, scale: 2 }),
  tastieraFissa:    boolean("tastiera_fissa").notNull().default(false),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});

export const insertRepartoSchema = createInsertSchema(repartiTable).omit({ createdAt: true });
export const insertArticoloSchema = createInsertSchema(articoliTable).omit({ createdAt: true });
export const insertImpostazioniSchema = createInsertSchema(impostazioniTable).omit({ updatedAt: true });

export type Reparto  = typeof repartiTable.$inferSelect;
export type Articolo = typeof articoliTable.$inferSelect;
export type Impostazioni = typeof impostazioniTable.$inferSelect;

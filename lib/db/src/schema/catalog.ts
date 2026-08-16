import { pgTable, text, numeric, boolean, integer, timestamp, date, jsonb, index } from "drizzle-orm/pg-core";
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
  mostraTicket:     boolean("mostra_ticket").notNull().default(false),
  gestioneResto:    boolean("gestione_resto").notNull().default(false),
  mostraTipoOperazione: boolean("mostra_tipo_operazione").notNull().default(false),
  carrelloLargo:    boolean("carrello_largo").notNull().default(false),
  dimensioneTasti:  text("dimensione_tasti").notNull().default("S"),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});

export interface DocumentoArchiviatoRiga {
  quantita: number;
  descrizione: string;
  prezzoUnitario: number;
  aliquotaIva: string;
  articoloId?: string;
  sconto?: number;
  omaggio?: boolean;
}

export interface DocumentoArchiviatoPagamento {
  contanti?: number;
  elettronico?: number;
  ticketRestaurant?: number;
  numeroTicket?: string;
  scontoAPagare?: number;
  documentoCollegato?: string;
}

export const documentiTable = pgTable("documenti", {
  id:                text("id").primaryKey(),
  numeroDocumento:   text("numero_documento").notNull(),
  numeroProgressivo: text("numero_progressivo"),
  dataEmissione:     date("data_emissione", { mode: "string" }).notNull(),
  dataOraEmissione:  text("data_ora_emissione"),
  tipoOperazione:    text("tipo_operazione").notNull(),
  stato:             text("stato").notNull().default("Emesso"),
  documentoOrigineId: text("documento_origine_id"),
  totale:            numeric("totale", { precision: 10, scale: 2 }).notNull(),
  codiceLotteria:    text("codice_lotteria"),
  righe:             jsonb("righe").$type<DocumentoArchiviatoRiga[]>().notNull(),
  pagamento:         jsonb("pagamento").$type<DocumentoArchiviatoPagamento>().notNull(),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
}, table => ({
  dataEmissioneIdx: index("documenti_data_emissione_idx").on(table.dataEmissione),
}));

export const insertRepartoSchema = createInsertSchema(repartiTable).omit({ createdAt: true });
export const insertArticoloSchema = createInsertSchema(articoliTable).omit({ createdAt: true });
export const insertImpostazioniSchema = createInsertSchema(impostazioniTable).omit({ updatedAt: true });

export type Reparto  = typeof repartiTable.$inferSelect;
export type Articolo = typeof articoliTable.$inferSelect;
export type Impostazioni = typeof impostazioniTable.$inferSelect;
export type DocumentoArchiviato = typeof documentiTable.$inferSelect;

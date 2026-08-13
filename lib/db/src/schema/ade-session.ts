import { pgTable, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Persiste la sessione ADE (cookie + dati contribuente) sul database.
 * Una sola riga (id = 1) — questo è un server monoutente.
 * Sopravvive ai riavvii e ai deploy di produzione.
 */
export const adeSessionsTable = pgTable("ade_sessions", {
  id:             integer("id").primaryKey().default(1),
  cookies:        text("cookies").notNull(),
  ragioneSociale: text("ragione_sociale").notNull().default(""),
  partitaIva:     text("partita_iva").notNull().default(""),
  codiceFiscale:  text("codice_fiscale").notNull().default(""),
  indirizzo:      text("indirizzo").notNull().default(""),
  numeroCivico:   text("numero_civico").notNull().default(""),
  cap:            text("cap").notNull().default(""),
  comune:         text("comune").notNull().default(""),
  provincia:      text("provincia").notNull().default(""),
  defAliquotaIVA: text("def_aliquota_iva").notNull().default(""),
  credentials:    jsonb("credentials").notNull().default({}),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

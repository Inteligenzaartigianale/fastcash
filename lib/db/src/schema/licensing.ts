import { date, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Commercial licensing is intentionally separate from the ADE session.
 * The license identifies the customer and the authorized device; it never
 * stores cookies, fiscal credentials, or document contents.
 */
export const licensesTable = pgTable("licenses", {
  id: text("id").primaryKey(),
  partitaIva: text("partita_iva").notNull(),
  status: text("status").notNull().default("active"), // active | suspended | revoked
  plan: text("plan").notNull().default("annuale"), // annuale | a_vita
  fiscalChannel: text("fiscal_channel").notNull().default("browser"), // browser | rest
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresOn: date("expires_on", { mode: "string" }),
  activeDeviceId: text("active_device_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  partitaIvaUnique: uniqueIndex("licenses_partita_iva_unique").on(table.partitaIva),
  activeDeviceIdx: index("licenses_active_device_idx").on(table.activeDeviceId),
}));

export const licensedDevicesTable = pgTable("licensed_devices", {
  id: text("id").primaryKey(),
  licenseId: text("license_id").notNull().references(() => licensesTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  platform: text("platform").notNull(), // desktop | mobile
  displayName: text("display_name").notNull(),
  proofHash: text("proof_hash").notNull(),
  publicKey: text("public_key").notNull().default(""),
  status: text("status").notNull().default("active"), // active | transferred | revoked
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => ({
  deviceUnique: uniqueIndex("licensed_devices_device_unique").on(table.deviceId),
  licenseIdx: index("licensed_devices_license_idx").on(table.licenseId),
}));

export const licenseRequestsTable = pgTable("license_requests", {
  id: text("id").primaryKey(),
  licenseId: text("license_id").references(() => licensesTable.id, { onDelete: "set null" }),
  partitaIva: text("partita_iva").notNull(),
  type: text("type").notNull(), // activation | renewal | recovery
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("open"), // open | approved | closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const licenseCodeRedemptionsTable = pgTable("license_code_redemptions", {
  codeFingerprint: text("code_fingerprint").primaryKey(),
  licenseId: text("license_id").notNull().references(() => licensesTable.id, { onDelete: "cascade" }),
  partitaIva: text("partita_iva").notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const licenseTransfersTable = pgTable("license_transfers", {
  id: text("id").primaryKey(),
  licenseId: text("license_id").notNull().references(() => licensesTable.id, { onDelete: "cascade" }),
  sourceDeviceId: text("source_device_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  pinHash: text("pin_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  failedAttempts: text("failed_attempts").notNull().default("0"),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  tokenHashUnique: uniqueIndex("license_transfers_token_hash_unique").on(table.tokenHash),
  activeLicenseIdx: index("license_transfers_license_idx").on(table.licenseId),
}));

export const insertLicenseSchema = createInsertSchema(licensesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertLicensedDeviceSchema = createInsertSchema(licensedDevicesTable).omit({
  activatedAt: true,
  lastSeenAt: true,
  revokedAt: true,
});
export const insertLicenseRequestSchema = createInsertSchema(licenseRequestsTable).omit({
  createdAt: true,
  resolvedAt: true,
});

export type License = typeof licensesTable.$inferSelect;
export type LicensedDevice = typeof licensedDevicesTable.$inferSelect;
export type LicenseRequest = typeof licenseRequestsTable.$inferSelect;
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
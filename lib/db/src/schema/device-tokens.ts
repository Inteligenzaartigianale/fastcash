import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const deviceTokensTable = pgTable("device_tokens", {
  token:     text("token").primaryKey(),
  type:      text("type").notNull().default("mobile"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type DeviceToken = typeof deviceTokensTable.$inferSelect;

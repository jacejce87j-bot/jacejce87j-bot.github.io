import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const slaPoliciesTable = pgTable("sla_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  priority: text("priority").notNull(),
  firstResponseMinutes: integer("first_response_minutes").notNull(),
  resolutionMinutes: integer("resolution_minutes").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SlaPolicy = typeof slaPoliciesTable.$inferSelect;
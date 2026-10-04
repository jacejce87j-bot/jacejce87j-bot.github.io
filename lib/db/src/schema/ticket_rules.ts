import { pgTable, serial, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type TicketRuleConditions = {
  org?: string | number;
  organizationId?: number;
  priority?: string;
  tags?: string[];
};

export type TicketRuleActions = {
  assignAgent?: number;
  assignGroup?: string;
  addTag?: string | string[];
  applyMacro?: number | string;
};

export const ticketRulesTable = pgTable("ticket_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  conditions: jsonb("conditions").$type<TicketRuleConditions>().notNull().default({}),
  actions: jsonb("actions").$type<TicketRuleActions>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTicketRuleSchema = createInsertSchema(ticketRulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTicketRule = z.infer<typeof insertTicketRuleSchema>;
export type TicketRule = typeof ticketRulesTable.$inferSelect;

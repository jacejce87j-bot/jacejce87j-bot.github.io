import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type TemplateField = {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'phone';
  value?: string;
};

export const ticketTemplatesTable = pgTable("ticket_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  fields: jsonb("fields").$type<TemplateField[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTicketTemplateSchema = createInsertSchema(ticketTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTicketTemplate = z.infer<typeof insertTicketTemplateSchema>;
export type TicketTemplate = typeof ticketTemplatesTable.$inferSelect;
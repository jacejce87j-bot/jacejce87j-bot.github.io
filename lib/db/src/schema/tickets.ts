import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { contactsTable } from "./contacts";
import { organizationsTable } from "./organizations";

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  type: text("type").notNull().default("question"),
  channel: text("channel").notNull().default("web"),
  assigneeId: integer("assignee_id").references(() => agentsTable.id, { onDelete: "set null" }),
  requesterId: integer("requester_id").references(() => contactsTable.id, { onDelete: "set null" }),
  organizationId: integer("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  tags: text("tags").array().notNull().default([]),
  dueAt: timestamp("due_at", { withTimezone: true }),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  satisfaction: text("satisfaction"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;

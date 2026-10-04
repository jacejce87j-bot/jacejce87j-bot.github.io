import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const ticketMacrosTable = pgTable("ticket_macros", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  scope: text("scope").notNull().default("all"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TicketMacro = typeof ticketMacrosTable.$inferSelect;

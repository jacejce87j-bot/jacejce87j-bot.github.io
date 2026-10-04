import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { ticketMacrosTable } from "./macros";

export const macroUsageEventsTable = pgTable("macro_usage_events", {
  id: serial("id").primaryKey(),
  macroId: integer("macro_id").notNull().references(() => ticketMacrosTable.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  ticketId: integer("ticket_id"),
  scope: text("scope").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MacroUsageEvent = typeof macroUsageEventsTable.$inferSelect;

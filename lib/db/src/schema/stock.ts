import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { ticketsTable } from "./tickets";

export const stockItemsTable = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").unique(),
  unit: text("unit").notNull().default("units"),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ticketStockUsageTable = pgTable(
  "ticket_stock_usage",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull().references(() => ticketsTable.id, { onDelete: "cascade" }),
    stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    recordedBy: text("recorded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deductedAt: timestamp("deducted_at", { withTimezone: true }),
  },
  (table) => [index("ticket_stock_usage_ticket_id_idx").on(table.ticketId)],
);

export const stockMovementsTable = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    stockItemId: integer("stock_item_id").notNull().references(() => stockItemsTable.id, { onDelete: "restrict" }),
    ticketId: integer("ticket_id").references(() => ticketsTable.id, { onDelete: "set null" }),
    movementType: text("movement_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    reason: text("reason"),
    recordedBy: text("recorded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("stock_movements_stock_item_id_idx").on(table.stockItemId)],
);

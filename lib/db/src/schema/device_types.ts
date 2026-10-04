import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deviceTypesTable = pgTable(
  "device_types",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [{ name: "device_types_name_category_unique", unique: true, columns: [table.name, table.category] }],
);

export const insertDeviceTypeSchema = createInsertSchema(deviceTypesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeviceType = z.infer<typeof insertDeviceTypeSchema>;
export type DeviceType = typeof deviceTypesTable.$inferSelect;

import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const slaBusinessHoursTable = pgTable("sla_business_hours", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Default business hours"),
  timezone: text("timezone").notNull().default("UTC"),
  organizationId: integer("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(false),
  monday: boolean("monday").notNull().default(true),
  tuesday: boolean("tuesday").notNull().default(true),
  wednesday: boolean("wednesday").notNull().default(true),
  thursday: boolean("thursday").notNull().default(true),
  friday: boolean("friday").notNull().default(true),
  saturday: boolean("saturday").notNull().default(false),
  sunday: boolean("sunday").notNull().default(false),
  startTime: text("start_time").notNull().default("09:00"),
  endTime: text("end_time").notNull().default("17:00"),
  holidayDates: text("holiday_dates").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSlaBusinessHoursSchema = createInsertSchema(slaBusinessHoursTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SlaBusinessHours = typeof slaBusinessHoursTable.$inferSelect;
export type InsertSlaBusinessHours = z.infer<typeof insertSlaBusinessHoursSchema>;

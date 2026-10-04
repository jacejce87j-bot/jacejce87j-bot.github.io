import { pgTable, text, serial, integer, timestamp, real, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { organizationsTable } from "./organizations";
import { ticketsTable } from "./tickets";

export const vehicleHealthReportsTable = pgTable("vehicle_health_reports", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  reportTimestamp: timestamp("report_timestamp", { withTimezone: true }).notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  importedBy: text("imported_by").references(() => usersTable.id, { onDelete: "set null" }),
  totalUnits: integer("total_units").notNull(),
  validUnits: integer("valid_units").notNull(),
  status: text("status").notNull().default("completed"),
  error: text("error"),
});

export const vehicleHealthUnitsTable = pgTable("vehicle_health_units", {
  id: text("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => vehicleHealthReportsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  organizationName: text("organization_name").notNull(),
  registration: text("registration").notNull(),
  deviceId: text("device_id"),
  lastUpdateAt: timestamp("last_update_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  address: text("address"),
  offlineDurationMinutes: integer("offline_duration_minutes").notNull(),
  offlineDurationText: text("offline_duration_text").notNull(),
  offlineDays: integer("offline_days").notNull(),
  severity: text("severity").notNull(),
  ticketId: integer("ticket_id").references(() => ticketsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("vehicle_health_report_org_reg_unique").on(table.reportId, table.organizationName, table.registration),
  index("vehicle_health_units_registration_idx").on(table.registration),
  index("vehicle_health_units_org_reg_idx").on(table.organizationId, table.registration),
  index("vehicle_health_units_severity_idx").on(table.severity),
]);

export const vehicleHealthEmailImportsTable = pgTable("vehicle_health_email_imports", {
  id: serial("id").primaryKey(),
  mailbox: text("mailbox").notNull(),
  uidValidity: text("uid_validity").notNull(),
  uid: text("uid").notNull(),
  attachmentHash: text("attachment_hash").notNull(),
  filename: text("filename").notNull(),
  reportId: integer("report_id").references(() => vehicleHealthReportsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("imported"),
  error: text("error"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("vehicle_health_email_import_uid_attachment_unique")
    .on(table.mailbox, table.uidValidity, table.uid, table.attachmentHash),
]);

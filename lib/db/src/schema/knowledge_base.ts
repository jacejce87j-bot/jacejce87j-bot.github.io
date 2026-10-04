import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ticketsTable } from "./tickets";

export const knowledgeBaseArticlesTable = pgTable("knowledge_base_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default([]),
  status: text("status").notNull().default("draft"),
  sourceTicketId: integer("source_ticket_id").references(() => ticketsTable.id, { onDelete: "set null" }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKnowledgeBaseArticleSchema = createInsertSchema(knowledgeBaseArticlesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKnowledgeBaseArticle = z.infer<typeof insertKnowledgeBaseArticleSchema>;
export type KnowledgeBaseArticle = typeof knowledgeBaseArticlesTable.$inferSelect;

import { sql } from 'drizzle-orm';
import { pgTable, varchar, integer, text, timestamp } from 'drizzle-orm/pg-core';

export const attachmentsTable = pgTable('attachments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  ticketId: integer('ticket_id').references(() => require('./tickets').ticketsTable.id, { onDelete: 'set null' }),
  commentId: integer('comment_id').references(() => require('./comments').commentsTable.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  contentType: varchar('content_type'),
  size: integer('size'),
  uploadedBy: varchar('uploaded_by').references(() => require('./auth').usersTable.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Attachment = typeof attachmentsTable.$inferSelect;
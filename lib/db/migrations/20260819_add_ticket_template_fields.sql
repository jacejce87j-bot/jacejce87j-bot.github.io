-- Up: add fields jsonb column to ticket_templates
ALTER TABLE ticket_templates
ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '[]';

-- Down: remove the fields column
-- Note: dropping this column will delete structured data. Use with caution.
-- To revert:
-- ALTER TABLE ticket_templates DROP COLUMN IF EXISTS fields;
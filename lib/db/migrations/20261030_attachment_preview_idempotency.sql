ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS upload_key TEXT,
  ADD COLUMN IF NOT EXISTS preview_id VARCHAR REFERENCES attachments(id);

CREATE UNIQUE INDEX IF NOT EXISTS attachments_upload_key_unique_idx
  ON attachments (upload_key)
  WHERE upload_key IS NOT NULL;

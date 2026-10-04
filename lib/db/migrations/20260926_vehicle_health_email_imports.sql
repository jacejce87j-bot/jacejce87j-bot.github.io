CREATE TABLE IF NOT EXISTS vehicle_health_email_imports (
  id SERIAL PRIMARY KEY,
  mailbox TEXT NOT NULL,
  uid_validity TEXT NOT NULL,
  uid TEXT NOT NULL,
  attachment_hash TEXT NOT NULL,
  filename TEXT NOT NULL,
  report_id INTEGER REFERENCES vehicle_health_reports(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'imported',
  error TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_health_email_import_uid_attachment_unique
    UNIQUE (mailbox, uid_validity, uid, attachment_hash)
);

ALTER TABLE vehicle_health_email_imports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS error TEXT;

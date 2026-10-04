-- Up: create attachments table to store uploaded file bytes
CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  uploaded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Down: drop attachments table
-- DROP TABLE IF EXISTS attachments;
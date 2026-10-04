CREATE TABLE IF NOT EXISTS macro_usage_events (
  id SERIAL PRIMARY KEY,
  macro_id INTEGER NOT NULL REFERENCES ticket_macros(id) ON DELETE CASCADE,
  user_id TEXT,
  ticket_id INTEGER,
  scope TEXT NOT NULL CHECK (scope IN ('description', 'public_comment', 'internal_comment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS macro_usage_events_macro_id_idx ON macro_usage_events (macro_id);
CREATE INDEX IF NOT EXISTS macro_usage_events_created_at_idx ON macro_usage_events (created_at);

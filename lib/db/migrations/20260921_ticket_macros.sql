CREATE TABLE IF NOT EXISTS ticket_macros (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_macros_scope_check CHECK (scope IN ('all', 'description', 'public_comment', 'internal_comment'))
);

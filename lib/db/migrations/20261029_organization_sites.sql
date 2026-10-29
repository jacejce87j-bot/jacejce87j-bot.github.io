CREATE TABLE IF NOT EXISTS organization_sites (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_sites_organization_id_idx
  ON organization_sites(organization_id);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES organization_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_name TEXT,
  ADD COLUMN IF NOT EXISTS site_address TEXT;

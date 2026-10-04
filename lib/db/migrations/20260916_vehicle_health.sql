CREATE TABLE IF NOT EXISTS vehicle_health_reports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  report_timestamp TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  total_units INTEGER NOT NULL,
  valid_units INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  error TEXT
);

-- The application users table uses varchar IDs. This also repairs databases
-- created from the earlier copied migration, which declared imported_by as INT.
ALTER TABLE vehicle_health_reports
  ALTER COLUMN imported_by TYPE VARCHAR
  USING imported_by::text;

CREATE TABLE IF NOT EXISTS vehicle_health_units (
  id TEXT PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES vehicle_health_reports(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  organization_name TEXT NOT NULL,
  registration TEXT NOT NULL,
  device_id TEXT,
  last_update_at TIMESTAMPTZ,
  last_status TEXT,
  latitude REAL,
  longitude REAL,
  address TEXT,
  offline_duration_minutes INTEGER NOT NULL,
  offline_duration_text TEXT NOT NULL,
  offline_days INTEGER NOT NULL,
  severity TEXT NOT NULL,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_health_report_org_reg_unique UNIQUE (report_id, organization_name, registration)
);

CREATE INDEX IF NOT EXISTS vehicle_health_units_registration_idx ON vehicle_health_units(registration);
CREATE INDEX IF NOT EXISTS vehicle_health_units_org_reg_idx ON vehicle_health_units(organization_id, registration);
CREATE INDEX IF NOT EXISTS vehicle_health_units_severity_idx ON vehicle_health_units(severity);

CREATE UNIQUE INDEX IF NOT EXISTS tickets_org_reg_open_unique
  ON tickets(organization_id, reg)
  WHERE status IN ('open', 'pending') AND organization_id IS NOT NULL AND reg IS NOT NULL;

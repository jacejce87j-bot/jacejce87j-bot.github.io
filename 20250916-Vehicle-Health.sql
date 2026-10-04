-- migrations/20250916_vehicle_health.sql
-- Production tables - authoritative source, not localStorage

CREATE TABLE IF NOT EXISTS vehicle_health_reports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  report_timestamp TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by INT REFERENCES users(id),
  total_units INT NOT NULL,
  valid_units INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  error TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_health_units (
  id TEXT PRIMARY KEY, -- deterministic: org-reg-timestamp hash
  report_id INT NOT NULL REFERENCES vehicle_health_reports(id) ON DELETE CASCADE,
  organization_id INT REFERENCES organizations(id),
  organization_name TEXT NOT NULL,
  registration TEXT NOT NULL,
  device_id TEXT,
  last_update_at TIMESTAMPTZ,
  last_status TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  offline_duration_minutes INT NOT NULL,
  offline_duration_text TEXT NOT NULL,
  offline_days INT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','warning','recent')),
  ticket_id INT REFERENCES tickets(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate import of same report
  UNIQUE (report_id, organization_name, registration)
);

CREATE INDEX IF NOT EXISTS idx_health_units_reg ON vehicle_health_units(registration);
CREATE INDEX IF NOT EXISTS idx_health_units_org_reg ON vehicle_health_units(organization_id, registration);
CREATE INDEX IF NOT EXISTS idx_health_units_severity ON vehicle_health_units(severity);
CREATE INDEX IF NOT EXISTS idx_health_units_ticket ON vehicle_health_units(ticket_id);
CREATE INDEX IF NOT EXISTS idx_health_units_offline_days ON vehicle_health_units(offline_days DESC);

-- Unique partial index for duplicate protection - one open ticket per org+reg
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_org_reg_open_unique 
ON tickets(organization_id, reg) 
WHERE status IN ('open','pending');

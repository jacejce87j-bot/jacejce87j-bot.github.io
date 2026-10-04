-- Up: create registry for tracking and camera device types
CREATE TABLE IF NOT EXISTS device_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tracking', 'camera')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, category)
);

-- Down: remove the device type registry
-- DROP TABLE IF EXISTS device_types;

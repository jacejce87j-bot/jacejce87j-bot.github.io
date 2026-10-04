-- Up: add installation metadata columns to tickets for template-based reporting
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS client TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS fleet_num TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reg TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS vin TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS engine TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS make TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS colour TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS odo TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device_cell_no TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tracking_imei TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tracking_cell_num TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tracking_type TEXT;

-- Down: remove the columns if the installation metadata needs to be reverted
-- ALTER TABLE tickets DROP COLUMN IF EXISTS tracking_type;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS tracking_cell_num;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS tracking_imei;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS device_type;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS device_cell_no;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS device_id;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS odo;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS colour;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS model;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS make;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS engine;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS vin;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS reg;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS fleet_num;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS client;

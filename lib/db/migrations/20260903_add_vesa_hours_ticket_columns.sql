-- Up: persist the remaining template installation fields on tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS vesa_num TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hours TEXT;

-- Existing tickets keep their values in the description and are exposed by
-- the API fallback until they are edited or migrated into these columns.

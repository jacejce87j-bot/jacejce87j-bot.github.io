-- Migration: populate ticket_templates.fields from description
-- Usage: run this SQL against the supportdesk database (e.g. with psql, pgAdmin, DBeaver)

WITH tmpl AS (
  SELECT id,
         regexp_split_to_table(replace(coalesce(description,''),'\\n', E'\n'), E'\n') AS line
  FROM ticket_templates
  WHERE (fields IS NULL OR jsonb_array_length(fields) = 0)
),
pairs AS (
  SELECT id,
         trim((regexp_matches(line, '^([^:]+):\\s*(.*)$'))[1]) AS label,
         trim((regexp_matches(line, '^([^:]+):\\s*(.*)$'))[2]) AS value
  FROM tmpl
  WHERE line ~ '^[^:]+:\\s*.*$'
),
mapped AS (
  SELECT id,
    CASE lower(label)
      WHEN 'fleet no' THEN 'fleetNum'
      WHEN 'fleet number' THEN 'fleetNum'
      WHEN 'fleetnum' THEN 'fleetNum'
      WHEN 'number plate' THEN 'reg'
      WHEN 'numberplate' THEN 'reg'
      WHEN 'reg no' THEN 'reg'
      WHEN 'registration' THEN 'reg'
      WHEN 'cell phone' THEN 'deviceCellNo'
      WHEN 'cell no' THEN 'deviceCellNo'
      WHEN 'phone no' THEN 'deviceCellNo'
      WHEN 'device id' THEN 'deviceId'
      WHEN 'deviceimei' THEN 'trackingImei'
      WHEN 'tracking imei' THEN 'trackingImei'
      WHEN 'tracking imei no' THEN 'trackingImei'
      WHEN 'tracking cell num' THEN 'trackingCellNum'
      WHEN 'tracking cell number' THEN 'trackingCellNum'
      WHEN 'tracking type' THEN 'trackingType'
      WHEN 'camera type' THEN 'deviceType'
      WHEN 'device type' THEN 'deviceType'
      WHEN 'engine type' THEN 'engine'
      WHEN 'odometer' THEN 'odo'
      WHEN 'odometer reading' THEN 'odo'
      WHEN 'colour' THEN 'colour'
      WHEN 'color' THEN 'colour'
      WHEN 'vin number' THEN 'vin'
      WHEN 'vehicle id' THEN 'deviceId'
      WHEN 'vesa num' THEN 'vesaNum'
      WHEN 'vesa' THEN 'vesaNum'
      WHEN 'vesanum' THEN 'vesaNum'
      WHEN 'hours' THEN 'hours'
      WHEN 'hrs' THEN 'hours'
      ELSE NULL
    END AS key,
    label AS label,
    value AS value
  FROM pairs
),
agg AS (
  SELECT id, jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', NULLIF(value, ''))) AS new_fields
  FROM mapped
  WHERE key IS NOT NULL
  GROUP BY id
)
UPDATE ticket_templates t
SET fields = agg.new_fields
FROM agg
WHERE t.id = agg.id;

-- Note: run AFTER backing up your DB. This updates templates that have empty fields arrays by parsing description lines like "Label: value".

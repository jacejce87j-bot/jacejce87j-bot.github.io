-- Add the standard channel detail rows to every existing ticket template.
-- The API also normalizes these fields for templates created before this migration.
UPDATE ticket_templates
SET fields = (
  SELECT COALESCE(jsonb_agg(field), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(ticket_templates.fields, '[]'::jsonb)) AS field
  WHERE lower(field->>'key') NOT SIMILAR TO 'channel[1-8]?'
) || '[{"key":"channel","label":"Channel","type":"text"}]'::jsonb;

UPDATE ticket_templates
SET description = regexp_replace(
  regexp_replace(RTRIM(description), E'(^|\\n)Channel [1-8]:[^\\n]*', '', 'gi'),
  E'\\n{2,}', E'\\n', 'g'
) || E'\nChannel:';

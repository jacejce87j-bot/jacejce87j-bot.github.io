#!/usr/bin/env node
// One-off migration script: populate ticket_templates.fields from description
// Usage: set DATABASE_URL and run `node scripts/migrate-fill-template-fields.js`

const { Client } = require('pg');

function normalize(v) {
  const raw = String(v || '').trim().toLowerCase().replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ');
  const aliases = {
    'fleet no':'fleetNum','fleet number':'fleetNum','fleetnum':'fleetNum',
    'number plate':'reg','numberplate':'reg','reg no':'reg','registration':'reg',
    'cell phone':'deviceCellNo','cell no':'deviceCellNo','phone no':'deviceCellNo',
    'device id':'deviceId','deviceimei':'trackingImei','tracking imei':'trackingImei','tracking imei no':'trackingImei',
    'tracking cell num':'trackingCellNum','tracking cell number':'trackingCellNum','tracking type':'trackingType',
    'camera type':'deviceType','device type':'deviceType','engine type':'engine','odometer':'odo','odometer reading':'odo',
    'colour':'colour','color':'colour','vin number':'vin','vehicle id':'deviceId','vesa num':'vesaNum','vesa':'vesaNum','vesanum':'vesaNum','hours':'hours','hrs':'hours'
  };
  if (aliases[raw]) return aliases[raw];
  return raw.replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean).map((p,i)=>i===0?p:p.charAt(0).toUpperCase()+p.slice(1)).join('');
}

function inferFromDescription(description) {
  const sanitized = String(description || '').replace(/\\n/g, '\n');
  const lines = sanitized.split(/\\n|\r?\n/).map(l=>l.trim()).filter(Boolean);
  const allowed = new Set(['client','fleetNum','reg','vin','engine','make','model','colour','odo','deviceId','deviceCellNo','deviceType','trackingImei','trackingCellNum','trackingType','vesaNum','hours']);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    const key = normalize(label);
    if (!key) continue;
    if (!allowed.has(key)) continue;
    out.push({ key, label, value: value || undefined });
  }
  return out;
}

async function main() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('DATABASE_URL must be set');
    process.exit(2);
  }
  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    const res = await client.query('SELECT id, description, fields FROM ticket_templates');
    let updated = 0;
    for (const row of res.rows) {
      const currentFields = row.fields || [];
      if (Array.isArray(currentFields) && currentFields.length) continue; // already has explicit fields
      const inferred = inferFromDescription(row.description || '');
      if (inferred && inferred.length) {
        await client.query('UPDATE ticket_templates SET fields = $1 WHERE id = $2', [JSON.stringify(inferred), row.id]);
        console.log(`Updated template id=${row.id} -> fields: ${JSON.stringify(inferred)}`);
        updated++;
      } else {
        console.log(`No inferred fields for template id=${row.id}`);
      }
    }
    console.log(`Done. Updated ${updated} templates.`);
  } catch (err) {
    console.error('Migration failed', err);
  } finally {
    await client.end();
  }
}

main();

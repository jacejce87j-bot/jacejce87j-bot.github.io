const fs = require('fs');
const { Pool } = require('pg');

const MIGRATION = './lib/db/migrations/20260820_add_attachments_table.sql';
const sql = fs.readFileSync(MIGRATION, 'utf8');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log('Applying migration...');
    await pool.query(sql);
    console.log('Migration applied');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
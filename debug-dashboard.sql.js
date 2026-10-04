const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const q = `WITH grouped AS (
    SELECT
      MIN(a.id) AS "agentId",
      TRIM(a.name) AS "agentName",
      COUNT(CASE WHEN t.status = 'open' THEN 1 END)::int AS "openCount",
      COUNT(CASE WHEN t.status = 'open' AND t.priority = 'urgent' THEN 1 END)::int AS "urgentCount"
    FROM agents a
    LEFT JOIN tickets t ON t.assignee_id = a.id
    GROUP BY LOWER(TRIM(a.name))
  )
  SELECT
    "agentId",
    "agentName",
    "openCount",
    "urgentCount"
  FROM grouped
  ORDER BY "openCount" DESC, "agentName" ASC
  LIMIT 10`;

  try {
    const res = await client.query(q);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.log(e && e.message || e);
    console.log(e && e.stack || '');
  } finally {
    await client.end();
  }
});

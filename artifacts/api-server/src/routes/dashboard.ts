import { Router } from "express";
import { db } from "@workspace/db";
import {
  ticketsTable,
  agentsTable,
  activityEventsTable,
} from "@workspace/db";
import { eq, count, and, sql, desc, inArray } from "drizzle-orm";
import { GetDashboardActivityQueryParams } from "@workspace/api-zod";

const router = Router();

// ─── STATS ────────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  const [openRow, pendingRow, urgentRow, unassignedRow, solvedTodayRow, slaBreachRow, goodRow, totalRow] =
    await Promise.all([
      db.select({ cnt: count() }).from(ticketsTable).where(eq(ticketsTable.status, "open")).then((r) => r[0]),
      db.select({ cnt: count() }).from(ticketsTable).where(eq(ticketsTable.status, "pending")).then((r) => r[0]),
      db.select({ cnt: count() }).from(ticketsTable).where(and(eq(ticketsTable.priority, "urgent"), eq(ticketsTable.status, "open"))).then((r) => r[0]),
      db.select({ cnt: count() }).from(ticketsTable).where(and(sql`${ticketsTable.assigneeId} IS NULL`, sql`${ticketsTable.status} NOT IN ('solved','closed')`)).then((r) => r[0]),
      db.select({ cnt: count() }).from(ticketsTable).where(and(sql`${ticketsTable.status} IN ('solved','closed')`, sql`DATE(${ticketsTable.resolvedAt}) = CURRENT_DATE`)).then((r) => r[0]),
      db.select({ cnt: count() }).from(ticketsTable).where(and(sql`${ticketsTable.dueAt} < NOW()`, sql`${ticketsTable.status} NOT IN ('solved','closed')`)).then((r) => r[0]).catch(() => ({ cnt: 0 })),
      db.select({ cnt: count() }).from(ticketsTable).where(eq(ticketsTable.satisfaction, "good")).then((r) => r[0]),
      db.select({ cnt: count() }).from(ticketsTable).where(sql`${ticketsTable.satisfaction} IS NOT NULL`).then((r) => r[0]),
    ]);

  // Average response time in hours
  const avgRow = await db
    .execute(sql`SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600) as avg_hours FROM tickets WHERE first_response_at IS NOT NULL`)
    .catch(() => ({ rows: [{ avg_hours: null }] }));
  const avgHours = Number((avgRow as any).rows?.[0]?.avg_hours ?? 4.2);

  const totalSat = Number(totalRow?.cnt ?? 0);
  const goodSat = Number(goodRow?.cnt ?? 0);
  const satisfactionScore = totalSat > 0 ? Math.round((goodSat / totalSat) * 100) : 0;

  res.json({
    openTickets: Number(openRow?.cnt ?? 0),
    pendingTickets: Number(pendingRow?.cnt ?? 0),
    solvedToday: Number(solvedTodayRow?.cnt ?? 0),
    urgentTickets: Number(urgentRow?.cnt ?? 0),
    avgResponseTimeHours: Math.round(avgHours * 10) / 10,
    satisfactionScore,
    slaBreach: Number(slaBreachRow?.cnt ?? 0),
    unassigned: Number(unassignedRow?.cnt ?? 0),
  });
});

// ─── ACTIVITY ─────────────────────────────────────────────────────────────────
router.get("/activity", async (req, res) => {
  const query = GetDashboardActivityQueryParams.parse({
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  const limit = query.limit ?? 20;

  const events = await db
    .select()
    .from(activityEventsTable)
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(limit);

  if (events.length === 0) return res.json([]);

  const agentIds = [...new Set(events.map((e) => e.agentId).filter(Boolean))] as number[];
  const ticketIds = [...new Set(events.map((e) => e.ticketId))];

  const [agents, tickets] = await Promise.all([
    agentIds.length > 0
      ? db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds))
      : [],
    db.select({ id: ticketsTable.id, subject: ticketsTable.subject }).from(ticketsTable).where(inArray(ticketsTable.id, ticketIds)),
  ]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));

  const result = events.map((e) => ({
    id: e.id,
    type: e.type,
    description: e.description,
    ticketId: e.ticketId,
    ticketSubject: ticketMap.get(e.ticketId)?.subject ?? null,
    agentName: e.agentId ? (agentMap.get(e.agentId)?.name ?? null) : null,
    createdAt: e.createdAt.toISOString(),
  }));

  res.json(result);
});

// ─── TICKET VOLUME ────────────────────────────────────────────────────────────
router.get("/ticket-volume", async (req, res) => {
  const result = await db.execute(sql`
    WITH days AS (
      SELECT generate_series(
        DATE_TRUNC('day', NOW() - INTERVAL '13 days'),
        DATE_TRUNC('day', NOW()),
        '1 day'::interval
      ) AS day
    )
    SELECT
      TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
      COUNT(CASE WHEN DATE_TRUNC('day', t.created_at) = d.day THEN 1 END)::int AS created,
      COUNT(CASE WHEN DATE_TRUNC('day', t.resolved_at) = d.day AND t.status IN ('solved','closed') THEN 1 END)::int AS solved
    FROM days d
    LEFT JOIN tickets t ON t.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY d.day
    ORDER BY d.day
  `);
  res.json((result as any).rows ?? []);
});

// ─── AGENT WORKLOAD ───────────────────────────────────────────────────────────
router.get("/agent-workload", async (req, res) => {
  const result = await db.execute(sql`
    SELECT
      a.id AS "agentId",
      a.name AS "agentName",
      COUNT(CASE WHEN t.status = 'open' THEN 1 END)::int AS "openCount",
      COUNT(CASE WHEN t.status = 'open' AND t.priority = 'urgent' THEN 1 END)::int AS "urgentCount"
    FROM agents a
    LEFT JOIN tickets t ON t.assignee_id = a.id
    GROUP BY a.id, a.name
    ORDER BY "openCount" DESC
    LIMIT 10
  `);
  res.json((result as any).rows ?? []);
});

// ─── SLA HEALTH ───────────────────────────────────────────────────────────────
router.get("/sla-health", async (req, res) => {
  const result = await db.execute(sql`
    SELECT
      COUNT(CASE WHEN due_at > NOW() + INTERVAL '4 hours' AND status NOT IN ('solved','closed') THEN 1 END)::int AS "onTrack",
      COUNT(CASE WHEN due_at BETWEEN NOW() AND NOW() + INTERVAL '4 hours' AND status NOT IN ('solved','closed') THEN 1 END)::int AS "atRisk",
      COUNT(CASE WHEN due_at < NOW() AND status NOT IN ('solved','closed') THEN 1 END)::int AS "breached",
      COUNT(CASE WHEN status NOT IN ('solved','closed') THEN 1 END)::int AS "total"
    FROM tickets
    WHERE due_at IS NOT NULL
  `);
  const row = (result as any).rows?.[0] ?? { onTrack: 0, atRisk: 0, breached: 0, total: 0 };
  res.json(row);
});

export default router;

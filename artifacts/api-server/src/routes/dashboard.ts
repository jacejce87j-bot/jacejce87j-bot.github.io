import { Router } from "express";
import { db } from "@workspace/db";
import {
  ticketsTable,
  agentsTable,
  activityEventsTable,
  systemSettingsTable,
  commentsTable,
} from "@workspace/db";
import { runAssignmentBreachEscalation } from "../lib/sla-checker";
import { eq, count, and, or, sql, desc, inArray } from "drizzle-orm";
import { GetDashboardActivityQueryParams } from "@workspace/api-zod";
import { getBusinessMinutesBetween, getDefaultBusinessHoursSchedule } from "../lib/business-hours";

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

router.get("/routing-status", async (_req, res) => {
  const settings = await db.select().from(systemSettingsTable);
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const ids = ["on_call_agent_id", "backup_agent_id"].map((key) => values.get(key)).filter(Boolean).map(Number);
  const agents = ids.length ? await db.select().from(agentsTable).where(inArray(agentsTable.id, ids)) : [];
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const serialize = (id: number | null) => {
    const agent = id == null ? null : byId.get(id);
    return agent ? { id: agent.id, name: agent.name, email: agent.email, isOnline: agent.isOnline } : null;
  };
  res.json({
    onCall: serialize(values.get("on_call_agent_id") ? Number(values.get("on_call_agent_id")) : null),
    backup: serialize(values.get("backup_agent_id") ? Number(values.get("backup_agent_id")) : null),
  });
});

router.get("/assignment-breaches", async (_req, res) => {
  const breachTickets = await db
    .select({
      id: ticketsTable.id,
      subject: ticketsTable.subject,
      createdAt: ticketsTable.createdAt,
      priority: ticketsTable.priority,
      channel: ticketsTable.channel,
    })
    .from(ticketsTable)
    .where(
      and(
        sql`${ticketsTable.assigneeId} IS NULL`,
        sql`${ticketsTable.status} NOT IN ('solved','closed')`,
        sql`${ticketsTable.createdAt} < NOW() - INTERVAL '60 minutes'`,
      ),
    );

  res.json({
    count: breachTickets.length,
    tickets: breachTickets.map((ticket) => ({
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
    })),
  });
});

router.post("/escalate-assignment", async (req, res) => {
  const role = String(req.user?.role ?? "").toLowerCase();
  if (role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const result = await runAssignmentBreachEscalation();
  res.json(result);
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

router.get("/agent-kpis", async (req, res) => {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ error: "from and to must be valid dates, with from no later than to" });
  }

  const [tickets, agents] = await Promise.all([
    db.select().from(ticketsTable).where(and(
      sql`${ticketsTable.createdAt} <= ${to}`,
      or(
        sql`${ticketsTable.createdAt} >= ${from}`,
        sql`${ticketsTable.status} NOT IN ('solved','closed')`,
        sql`${ticketsTable.resolvedAt} >= ${from}`,
      ),
    )),
    db.select({ id: agentsTable.id, name: agentsTable.name, email: agentsTable.email }).from(agentsTable),
  ]);

  const ticketIds = tickets.map((ticket) => ticket.id);
  const [comments, events] = ticketIds.length
    ? await Promise.all([
      db.select().from(commentsTable).where(inArray(commentsTable.ticketId, ticketIds)).orderBy(commentsTable.createdAt),
      db.select().from(activityEventsTable).where(inArray(activityEventsTable.ticketId, ticketIds)).orderBy(activityEventsTable.createdAt),
    ])
    : [[], []];

  const commentsByTicket = new Map<number, typeof comments>();
  for (const comment of comments) {
    const rows = commentsByTicket.get(comment.ticketId) ?? [];
    rows.push(comment);
    commentsByTicket.set(comment.ticketId, rows);
  }
  const eventsByTicket = new Map<number, typeof events>();
  for (const event of events) {
    const rows = eventsByTicket.get(event.ticketId) ?? [];
    rows.push(event);
    eventsByTicket.set(event.ticketId, rows);
  }

  const scheduleCache = new Map<number | null, Awaited<ReturnType<typeof getDefaultBusinessHoursSchedule>>>();
  const businessMinutes = async (start: Date, end: Date, organizationId: number | null) => {
    if (!scheduleCache.has(organizationId)) {
      scheduleCache.set(organizationId, await getDefaultBusinessHoursSchedule(organizationId));
    }
    const schedule = scheduleCache.get(organizationId);
    return schedule
      ? getBusinessMinutesBetween(start, end, schedule)
      : Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  };

  type AgentKpi = {
    agentId: number;
    agentName: string;
    firstReplies: number;
    firstResponseTotalMinutes: number;
    nextReplies: number;
    nextReplyTotalMinutes: number;
    ticketsSolved: number;
    fcrEligible: number;
    fcrSolved: number;
    reopenCount: number;
    assignedTickets: number;
    resolutionTotalMinutes: number;
    resolvedCount: number;
  };
  const perAgent = new Map<number, AgentKpi>();
  const metricFor = (agentId: number) => {
    let metric = perAgent.get(agentId);
    if (!metric) {
      const agent = agents.find((row) => row.id === agentId);
      metric = {
        agentId,
        agentName: agent?.name ?? `Agent ${agentId}`,
        firstReplies: 0,
        firstResponseTotalMinutes: 0,
        nextReplies: 0,
        nextReplyTotalMinutes: 0,
        ticketsSolved: 0,
        fcrEligible: 0,
        fcrSolved: 0,
        reopenCount: 0,
        assignedTickets: 0,
        resolutionTotalMinutes: 0,
        resolvedCount: 0,
      };
      perAgent.set(agentId, metric);
    }
    return metric;
  };
  const responseTimes: number[] = [];
  const nextResponseTimes: number[] = [];
  const resolutionTimes: number[] = [];
  let solvedCount = 0;
  let fcrEligible = 0;
  let fcrSolved = 0;
  let reopenedCount = 0;
  let reopenedEligible = 0;
  let csatPositive = 0;
  let csatResponses = 0;
  let backlog = 0;
  let waitingMinutes = 0;
  let waitingMeasured = 0;
  const now = new Date();

  for (const ticket of tickets) {
    const inReportPeriod = ticket.createdAt >= from;
    const ticketComments = commentsByTicket.get(ticket.id) ?? [];
    const publicAgentReplies = ticketComments.filter((comment) => comment.isPublic && comment.authorId !== null);
    const inboundPublicComments = ticketComments.filter((comment) => comment.isPublic && comment.authorId === null);
    const firstAgentReply = publicAgentReplies[0];
    if (inReportPeriod && firstAgentReply) {
      const minutes = await businessMinutes(ticket.createdAt, firstAgentReply.createdAt, ticket.organizationId);
      responseTimes.push(minutes);
      if (firstAgentReply.authorId !== null) {
        const metric = metricFor(firstAgentReply.authorId);
        metric.firstReplies++;
        metric.firstResponseTotalMinutes += minutes;
      }
    }

    if (inReportPeriod) {
      let latestInbound: (typeof inboundPublicComments)[number] | null = null;
      for (const comment of ticketComments.filter((row) => row.isPublic)) {
        if (comment.authorId === null) {
          latestInbound = comment;
          continue;
        }
        if (latestInbound && comment.createdAt > latestInbound.createdAt) {
          const minutes = await businessMinutes(latestInbound.createdAt, comment.createdAt, ticket.organizationId);
          nextResponseTimes.push(minutes);
          const metric = metricFor(comment.authorId);
          metric.nextReplies++;
          metric.nextReplyTotalMinutes += minutes;
          latestInbound = null;
        }
      }
    }

    const solved = ticket.status === "solved" || ticket.status === "closed";
    if (inReportPeriod && solved) {
      solvedCount++;
      if (ticket.resolvedAt) {
        const minutes = await businessMinutes(ticket.createdAt, ticket.resolvedAt, ticket.organizationId);
        resolutionTimes.push(minutes);
      }
    }
    if (!solved) {
      backlog++;
    }

    const hasSingleResponseWithoutFollowup = publicAgentReplies.length === 1
      && !inboundPublicComments.some((comment) => comment.createdAt > publicAgentReplies[0].createdAt);
    if (inReportPeriod && solved && publicAgentReplies.length > 0) {
      fcrEligible++;
      if (hasSingleResponseWithoutFollowup) fcrSolved++;
    }

    const statusEvents = (eventsByTicket.get(ticket.id) ?? [])
      .filter((event) => event.type === "status_changed")
      .map((event) => {
        const match = event.description.match(/Status changed from ([\w-]+) to ([\w-]+)/i);
        return match ? { at: event.createdAt, status: match[2].toLowerCase(), agentId: event.agentId } : null;
      })
      .filter((event): event is { at: Date; status: string; agentId: number | null } => event !== null);
    let status = "open";
    let intervalStart = ticket.createdAt;
    let ticketWaitingMinutes = 0;
    for (const event of statusEvents) {
      if ((status === "open" || status === "new") && inReportPeriod) {
        ticketWaitingMinutes += await businessMinutes(intervalStart, event.at, ticket.organizationId);
      }
      status = event.status;
      intervalStart = event.at;
    }
    if (inReportPeriod && !solved && (ticket.status === "open" || ticket.status === "new")) {
      ticketWaitingMinutes += await businessMinutes(intervalStart, now, ticket.organizationId);
    }
    if (inReportPeriod) {
      waitingMinutes += ticketWaitingMinutes;
      waitingMeasured++;
    }

    const reopenEvents = statusEvents.filter((event, index) =>
      event.at >= from
      && event.at <= to
      && ["solved", "closed"].includes(statusEvents[index - 1]?.status ?? "")
      && ["open", "new", "pending"].includes(event.status),
    );
    if (inReportPeriod && (solved || reopenEvents.length)) {
      reopenedEligible++;
      if (reopenEvents.length) reopenedCount++;
    }

    if (inReportPeriod && (ticket.satisfaction === "good" || ticket.satisfaction === "bad")) {
      csatResponses++;
      if (ticket.satisfaction === "good") csatPositive++;
    }

    const ownerId = ticket.assigneeId;
    if (inReportPeriod && ownerId !== null) {
      const metric = metricFor(ownerId);
      metric.assignedTickets++;
      if (solved) {
        metric.ticketsSolved++;
        if (ticket.resolvedAt) {
          metric.resolvedCount++;
          metric.resolutionTotalMinutes += await businessMinutes(ticket.createdAt, ticket.resolvedAt, ticket.organizationId);
        }
        if (publicAgentReplies.length) {
          metric.fcrEligible++;
          if (hasSingleResponseWithoutFollowup) metric.fcrSolved++;
        }
      }
      if (reopenEvents.length) metric.reopenCount++;
    }
  }

  const hoursInPeriod = Math.max(1, (to.getTime() - from.getTime()) / 3_600_000);
  const average = (values: number[]) => values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
  const percent = (numerator: number, denominator: number) => denominator
    ? Math.round((numerator / denominator) * 100)
    : null;
  const agentsReport = [...perAgent.values()].map((metric) => ({
    agentId: metric.agentId,
    agentName: metric.agentName,
    ticketsSolved: metric.ticketsSolved,
    ticketsSolvedPerHour: Math.round((metric.ticketsSolved / hoursInPeriod) * 100) / 100,
    firstReplyCount: metric.firstReplies,
    averageFirstReplyMinutes: metric.firstReplies ? Math.round(metric.firstResponseTotalMinutes / metric.firstReplies) : null,
    nextReplyCount: metric.nextReplies,
    averageNextReplyMinutes: metric.nextReplies ? Math.round(metric.nextReplyTotalMinutes / metric.nextReplies) : null,
    firstContactResolutionRate: percent(metric.fcrSolved, metric.fcrEligible),
    averageFullResolutionMinutes: metric.resolvedCount ? Math.round(metric.resolutionTotalMinutes / metric.resolvedCount) : null,
    reopenCount: metric.reopenCount,
    assignedTickets: metric.assignedTickets,
    agentWorkTimeMinutes: null,
    averageHandleTimeMinutes: null,
    utilizationRate: null,
  })).sort((a, b) => b.ticketsSolved - a.ticketsSolved || a.agentName.localeCompare(b.agentName));

  res.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    overall: {
      firstReplyTimeMinutes: average(responseTimes),
      firstReplyCount: responseTimes.length,
      nextReplyTimeMinutes: average(nextResponseTimes),
      nextReplyCount: nextResponseTimes.length,
      requestWaitTimeMinutes: waitingMeasured ? Math.round(waitingMinutes / waitingMeasured) : null,
      fullResolutionTimeMinutes: average(resolutionTimes),
      resolvedTickets: solvedCount,
      ticketsSolvedPerHour: Math.round((solvedCount / hoursInPeriod) * 100) / 100,
      firstContactResolutionRate: percent(fcrSolved, fcrEligible),
      firstContactResolutionCount: fcrEligible,
      reopenRate: percent(reopenedCount, reopenedEligible),
      reopenCount: reopenedCount,
      csatPositiveRate: percent(csatPositive, csatResponses),
      csatResponseCount: csatResponses,
      cesAverage: null,
      cesResponseCount: 0,
      backlog,
      agentWorkTimeMinutes: null,
      averageHandleTimeMinutes: null,
      utilizationRate: null,
    },
    agents: agentsReport,
    measurementNotes: {
      requestWaitTime: "Average business-time spent in new/open status, reconstructed from recorded status changes.",
      firstContactResolution: "Proxy: solved tickets with an agent public reply and no later customer public reply.",
      ticketsSolvedPerHour: "Solved ticket count divided by elapsed clock hours in the selected report period.",
      reopenRate: "Tickets with a recorded solved/closed-to-open/new/pending transition divided by tickets with a recorded resolution or reopen.",
      agentWorkTime: "Unavailable: active-work timers are not recorded.",
      averageHandleTime: "Unavailable: active-work timers are not recorded.",
      utilization: "Unavailable: agent active time and scheduled capacity are not recorded.",
      ces: "Unavailable: customer effort scores are not collected.",
      csat: "Based on existing good/bad satisfaction values; no rating is treated as a negative response.",
    },
  });
});

// ─── AGENT WORKLOAD ───────────────────────────────────────────────────────────
router.get("/agent-workload", async (req, res) => {
  try {
    const result = await db.execute(sql`
      WITH grouped AS (
        SELECT
          a.id AS "agentId",
          TRIM(a.name) AS "agentName",
          COALESCE(SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END), 0)::int AS "openCount",
          COALESCE(SUM(CASE WHEN t.status = 'open' AND t.priority = 'urgent' THEN 1 ELSE 0 END), 0)::int AS "urgentCount"
        FROM agents a
        LEFT JOIN tickets t ON t.assignee_id = a.id
        GROUP BY a.id, a.name
      )
      SELECT
        "agentId",
        "agentName",
        "openCount",
        "urgentCount"
      FROM grouped
      WHERE COALESCE("openCount", 0) > 0 OR COALESCE("urgentCount", 0) > 0
      ORDER BY "openCount" DESC, "agentName" ASC
      LIMIT 10
    `);

    const rows = (result as any).rows ?? [];
    res.json(rows);
  } catch (err) {
    console.error("agent-workload query failed", err);
    res.json([]);
  }
});

// ─── SLA HEALTH ───────────────────────────────────────────────────────────────
router.get("/sla-health", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(CASE WHEN due_at IS NULL AND status NOT IN ('solved','closed') THEN 1 END)::int AS "missingDue",
        COUNT(CASE WHEN due_at IS NOT NULL AND due_at > NOW() + INTERVAL '4 hours' AND status NOT IN ('solved','closed') THEN 1 END)::int AS "onTrack",
        COUNT(CASE WHEN due_at IS NOT NULL AND due_at BETWEEN NOW() AND NOW() + INTERVAL '4 hours' AND status NOT IN ('solved','closed') THEN 1 END)::int AS "atRisk",
        COUNT(CASE WHEN due_at IS NOT NULL AND due_at < NOW() AND status NOT IN ('solved','closed') THEN 1 END)::int AS "breached",
        COUNT(CASE WHEN status NOT IN ('solved','closed') THEN 1 END)::int AS "total"
      FROM tickets
    `);

    const row = (result as any).rows?.[0] ?? { onTrack: 0, atRisk: 0, breached: 0, total: 0 };
    const missingDue = Number(row.missingDue ?? 0);
    const onTrack = Number(row.onTrack ?? 0);
    const atRisk = Number(row.atRisk ?? 0) + missingDue;
    const breached = Number(row.breached ?? 0);
    const total = Number(row.total ?? 0);

    res.json({ onTrack, atRisk, breached, total });
  } catch (err) {
    console.error("sla-health query failed", err);
    res.json({ onTrack: 0, atRisk: 0, breached: 0, total: 0 });
  }
});

export default router;

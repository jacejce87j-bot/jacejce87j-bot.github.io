import { Router } from "express";
import { and, asc, count, eq, gte, inArray, lte } from "drizzle-orm";
import {
  activityEventsTable,
  agentsTable,
  commentsTable,
  db,
  organizationsTable,
  slaPoliciesTable,
  ticketsTable,
} from "@workspace/db";
import { getBusinessMinutesBetween, getDefaultBusinessHoursSchedule } from "../lib/business-hours";
import { evaluateTicketSla } from "../lib/ticket-sla";

const router = Router();

function ticketDetailField(description: string | null, labels: string[]) {
  if (!description) return null;
  const pattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = description.match(new RegExp(`(?:^|\\n)\\s*(?:${pattern})\\s*:\\s*([^\\n]*)`, "i"));
  return match?.[1]?.trim() || null;
}

router.get("/ticket-details", async (req, res) => {
  const role = String(req.user?.role ?? "").toLowerCase();
  if (role !== "admin" && role !== "supervisor") {
    return res.status(403).json({ error: "Admin or supervisor access required" });
  }

  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ error: "from and to must be valid datetimes, with from no later than to" });
  }

  const organizationId = req.query.organizationId === undefined || req.query.organizationId === "all"
    ? undefined
    : Number(req.query.organizationId);
  if (organizationId !== undefined && (!Number.isSafeInteger(organizationId) || organizationId < 1)) {
    return res.status(400).json({ error: "organizationId must be a positive integer or 'all'" });
  }

  const conditions = [gte(ticketsTable.createdAt, from), lte(ticketsTable.createdAt, to)];
  if (organizationId !== undefined) conditions.push(eq(ticketsTable.organizationId, organizationId));
  const where = and(...conditions);
  const [ticketRows, totalRow] = await Promise.all([
    db.select({
      ticket: ticketsTable,
      organizationName: organizationsTable.name,
    })
      .from(ticketsTable)
      .leftJoin(organizationsTable, eq(ticketsTable.organizationId, organizationsTable.id))
      .where(where)
      .orderBy(asc(ticketsTable.createdAt), asc(ticketsTable.id))
      .limit(10001),
    db.select({ total: count() }).from(ticketsTable).where(where).then((rows) => rows[0]),
  ]);

  const truncated = ticketRows.length > 10000;
  const rows = ticketRows.slice(0, 10000).map(({ ticket, organizationName }) => ({
    ticketId: ticket.id,
    subject: ticket.subject,
    createdAt: ticket.createdAt.toISOString(),
    organizationName: organizationName ?? "",
    client: ticket.client ?? ticketDetailField(ticket.description, ["client"]),
    fleetNum: ticket.fleetNum ?? ticketDetailField(ticket.description, ["fleet num", "fleet no", "fleet number"]),
    reg: ticket.reg ?? ticketDetailField(ticket.description, ["reg", "registration", "number plate"]),
    vin: ticket.vin ?? ticketDetailField(ticket.description, ["vin"]),
    engine: ticket.engine ?? ticketDetailField(ticket.description, ["engine"]),
    make: ticket.make ?? ticketDetailField(ticket.description, ["make"]),
    model: ticket.model ?? ticketDetailField(ticket.description, ["model"]),
    colour: ticket.colour ?? ticketDetailField(ticket.description, ["colour", "color"]),
    odo: ticket.odo ?? ticketDetailField(ticket.description, ["odo", "odometer"]),
    deviceId: ticket.deviceId ?? ticketDetailField(ticket.description, ["device id"]),
    deviceCellNo: ticket.deviceCellNo ?? ticketDetailField(ticket.description, ["device cell no", "device cell"]),
    trackingType: ticket.trackingType
      ?? ticketDetailField(ticket.description, ["tracking type", "tracking device type"]),
    cameraType: ticket.deviceType
      ?? ticketDetailField(ticket.description, ["camera type", "device type"]),
    trackingImei: ticket.trackingImei ?? ticketDetailField(ticket.description, ["tracking imei"]),
    trackingCellNum: ticket.trackingCellNum ?? ticketDetailField(ticket.description, ["tracking cell num", "tracking cell number", "tracking cell"]),
    vesaNum: ticket.vesaNum ?? ticketDetailField(ticket.description, ["vesa num", "vesa"]),
    hours: ticket.hours ?? ticketDetailField(ticket.description, ["hours", "hrs"]),
    channel: ticket.channel,
  }));

  return res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    organizationId: organizationId ?? null,
    total: Number(totalRow?.total ?? 0),
    truncated,
    rows,
  });
});

router.get("/pivot-data", async (req, res) => {
  const role = String(req.user?.role ?? "").toLowerCase();
  if (role !== "admin" && role !== "supervisor") {
    return res.status(403).json({ error: "Admin or supervisor access required" });
  }

  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ error: "from and to must be valid dates, with from no later than to" });
  }
  const organizationId = req.query.organizationId === undefined ? undefined : Number(req.query.organizationId);
  const agentId = req.query.agentId === undefined ? undefined : Number(req.query.agentId);
  if ((organizationId !== undefined && (!Number.isSafeInteger(organizationId) || organizationId < 1))
    || (agentId !== undefined && (!Number.isSafeInteger(agentId) || agentId < 1))) {
    return res.status(400).json({ error: "organizationId and agentId must be positive integers" });
  }

  const conditions = [
    gte(ticketsTable.createdAt, from),
    lte(ticketsTable.createdAt, to),
  ];
  if (organizationId !== undefined) conditions.push(eq(ticketsTable.organizationId, organizationId));
  if (agentId !== undefined) conditions.push(eq(ticketsTable.assigneeId, agentId));

  const [tickets, totalRow, agents, organizations, policies] = await Promise.all([
    db.select().from(ticketsTable).where(and(...conditions)).orderBy(asc(ticketsTable.createdAt)).limit(10000),
    db.select({ total: count() }).from(ticketsTable).where(and(...conditions)).then((result) => result[0]),
    db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable),
    db.select({ id: organizationsTable.id, name: organizationsTable.name }).from(organizationsTable),
    db.select().from(slaPoliciesTable).where(eq(slaPoliciesTable.isActive, true)),
  ]);
  const totalTickets = Number(totalRow?.total ?? 0);
  if (!tickets.length) return res.json({ from: from.toISOString(), to: to.toISOString(), truncated: false, rows: [] });

  const ticketIds = tickets.map((ticket) => ticket.id);
  const [comments, events] = await Promise.all([
    db.select().from(commentsTable).where(inArray(commentsTable.ticketId, ticketIds)).orderBy(asc(commentsTable.createdAt)),
    db.select().from(activityEventsTable).where(inArray(activityEventsTable.ticketId, ticketIds)).orderBy(asc(activityEventsTable.createdAt)),
  ]);
  const commentsByTicket = new Map<number, typeof comments>();
  const eventsByTicket = new Map<number, typeof events>();
  for (const comment of comments) {
    const rows = commentsByTicket.get(comment.ticketId) ?? [];
    rows.push(comment);
    commentsByTicket.set(comment.ticketId, rows);
  }
  for (const event of events) {
    const rows = eventsByTicket.get(event.ticketId) ?? [];
    rows.push(event);
    eventsByTicket.set(event.ticketId, rows);
  }

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const organizationNames = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const policiesByPriority = new Map(policies.map((policy) => [policy.priority.toLowerCase(), policy]));
  const schedules = new Map<number | null, Awaited<ReturnType<typeof getDefaultBusinessHoursSchedule>>>();
  const businessMinutes = async (start: Date, end: Date, orgId: number | null) => {
    if (!schedules.has(orgId)) schedules.set(orgId, await getDefaultBusinessHoursSchedule(orgId ?? undefined));
    const schedule = schedules.get(orgId);
    return schedule
      ? getBusinessMinutesBetween(start, end, schedule)
      : Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  };

  const now = new Date();
  const rows = await Promise.all(tickets.map(async (ticket) => {
    const ticketComments = commentsByTicket.get(ticket.id) ?? [];
    const ticketEvents = eventsByTicket.get(ticket.id) ?? [];
    if (!schedules.has(ticket.organizationId)) {
      schedules.set(ticket.organizationId, await getDefaultBusinessHoursSchedule(ticket.organizationId ?? undefined));
    }
    const schedule = schedules.get(ticket.organizationId) ?? null;
    const publicAgentReplies = ticketComments.filter((comment) => comment.isPublic && comment.authorId !== null);
    const inboundReplies = ticketComments.filter((comment) => comment.isPublic && comment.authorId === null);
    const firstReply = publicAgentReplies[0];
    let nextReplyTotalMinutes = 0;
    let nextReplyCount = 0;
    let latestInbound: (typeof inboundReplies)[number] | null = null;
    for (const comment of ticketComments.filter((row) => row.isPublic)) {
      if (comment.authorId === null) {
        latestInbound = comment;
      } else if (latestInbound && comment.createdAt > latestInbound.createdAt) {
        nextReplyTotalMinutes += await businessMinutes(latestInbound.createdAt, comment.createdAt, ticket.organizationId);
        nextReplyCount++;
        latestInbound = null;
      }
    }

    const solved = ticket.status === "solved" || ticket.status === "closed";
    const resolvedAt = ticket.resolvedAt;
    const policy = policiesByPriority.get(ticket.priority.toLowerCase());
    const sla = evaluateTicketSla(ticket, ticketComments, ticketEvents, policy, schedule, now);
    const firstReplyMinutes = firstReply ? sla.firstResponseMinutes : null;
    const resolutionMinutes = resolvedAt ? sla.resolutionMinutes : null;

    let waitingMinutes = 0;
    let status = "open";
    let intervalStart = ticket.createdAt;
    for (const event of ticketEvents.filter((row) => row.type === "status_changed")) {
      const match = event.description.match(/Status changed from ([\w-]+) to ([\w-]+)/i);
      if (!match) continue;
      if ((status === "open" || status === "new") && event.createdAt > intervalStart) {
        waitingMinutes += await businessMinutes(intervalStart, event.createdAt, ticket.organizationId);
      }
      status = match[2].toLowerCase();
      intervalStart = event.createdAt;
    }
    if (!solved && (ticket.status === "open" || ticket.status === "new") && now > intervalStart) {
      waitingMinutes += await businessMinutes(intervalStart, now, ticket.organizationId);
    }

    const statusTransitions = ticketEvents
      .filter((event) => event.type === "status_changed")
      .map((event) => {
        const match = event.description.match(/Status changed from ([\w-]+) to ([\w-]+)/i);
        return match ? { from: match[1].toLowerCase(), to: match[2].toLowerCase() } : null;
      })
      .filter((event): event is { from: string; to: string } => event !== null);
    const reopenCount = statusTransitions.filter((event) =>
      ["solved", "closed"].includes(event.from) && ["open", "new", "pending"].includes(event.to),
    ).length;
    const hasSingleResponseWithoutFollowup = publicAgentReplies.length === 1
      && !inboundReplies.some((comment) => comment.createdAt > publicAgentReplies[0].createdAt);
    const fcrEligible = solved && publicAgentReplies.length > 0;
    const fcrSolved = fcrEligible && hasSingleResponseWithoutFollowup;

    const assignmentEvents = ticketEvents.filter((event) =>
      (event.type === "ticket_created" || event.type === "assignment_changed") && event.agentId !== null,
    );
    const lastAssignment = assignmentEvents.at(-1);
    const firstAssignment = assignmentEvents[0];
    const assignmentWaitMinutes = sla.assignmentWaitMinutes;
    const currentAssignmentMinutes = ticket.assigneeId !== null
      ? await businessMinutes(lastAssignment?.createdAt ?? ticket.createdAt, resolvedAt ?? now, ticket.organizationId)
      : null;

    const firstResponseWithinSla = sla.firstResponseWithinSla;
    const resolutionWithinSla = sla.resolutionWithinSla;
    const assignmentWithinSla = sla.assignmentWithinSla;

    return {
      ticketId: ticket.id,
      subject: ticket.subject,
      createdAt: ticket.createdAt.toISOString(),
      createdMonth: ticket.createdAt.toISOString().slice(0, 7),
      organizationId: ticket.organizationId,
      organization: ticket.organizationId ? organizationNames.get(ticket.organizationId) ?? `Organization ${ticket.organizationId}` : "Unassigned organization",
      agentId: ticket.assigneeId,
      agent: ticket.assigneeId ? agentNames.get(ticket.assigneeId) ?? `Agent ${ticket.assigneeId}` : "Unassigned",
      status: ticket.status,
      priority: ticket.priority,
      channel: ticket.channel,
      client: ticket.client ?? "",
      fleetNum: ticket.fleetNum ?? "",
      reg: ticket.reg ?? "",
      ticketCount: 1,
      solvedCount: solved ? 1 : 0,
      backlogCount: solved ? 0 : 1,
      firstReplyTotalMinutes: firstReplyMinutes ?? 0,
      firstReplyCount: firstReplyMinutes === null ? 0 : 1,
      nextReplyTotalMinutes,
      nextReplyCount,
      requestWaitTotalMinutes: waitingMinutes,
      requestWaitCount: 1,
      resolutionTotalMinutes: resolutionMinutes ?? 0,
      resolutionCount: resolutionMinutes === null ? 0 : 1,
      fcrEligibleCount: fcrEligible ? 1 : 0,
      fcrSolvedCount: fcrSolved ? 1 : 0,
      firstResponseMeasuredCount: firstResponseWithinSla === null ? 0 : 1,
      firstResponseWithinSlaCount: firstResponseWithinSla ? 1 : 0,
      firstResponseBreachCount: firstResponseWithinSla === false ? 1 : 0,
      resolutionMeasuredCount: resolutionWithinSla === null ? 0 : 1,
      resolutionWithinSlaCount: resolutionWithinSla ? 1 : 0,
      resolutionBreachCount: resolutionWithinSla === false ? 1 : 0,
      assignmentWaitTotalMinutes: assignmentWaitMinutes,
      assignmentWaitCount: 1,
      assignmentBreachCount: assignmentWithinSla === false ? 1 : 0,
      currentAssignmentTotalMinutes: currentAssignmentMinutes ?? 0,
      currentAssignmentCount: currentAssignmentMinutes === null ? 0 : 1,
      reopenCount,
      csatResponseCount: ticket.satisfaction === "good" || ticket.satisfaction === "bad" ? 1 : 0,
      csatPositiveCount: ticket.satisfaction === "good" ? 1 : 0,
    };
  }));

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    truncated: totalTickets > tickets.length,
    rows,
    trackingNotes: {
      agentWorkTime: "Active work time, average handle time, and utilization are not available because work sessions and scheduled capacity are not tracked.",
      assignmentTime: "Current assignment age is elapsed business time since the latest recorded assignment; it is not active work time.",
      sla: "SLA measures use the active priority policy and the organization’s configured business-hours calendar. Missing policies are excluded from compliance rates.",
      dateRange: "The report includes tickets created within the selected date range; backlog is unresolved tickets in that same ticket cohort.",
    },
  });
});

export default router;

import { Router, type Request, type Response } from "express";
import { broadcast } from "../lib/ws-manager";
import { db, slaPoliciesTable, systemSettingsTable } from "@workspace/db";
import {
  ticketsTable,
  agentsTable,
  contactsTable,
  organizationsTable,
  commentsTable,
  activityEventsTable,
} from "@workspace/db";
import {
  eq,
  count,
  and,
  or,
  ilike,
  sql,
  desc,
  asc,
  inArray,
  gte,
  lte,
} from "drizzle-orm";
import {
  CreateTicketBody,
  UpdateTicketBody,
  UpdateTicketParams,
  GetTicketParams,
  DeleteTicketParams,
  ListTicketsQueryParams,
  ListTicketCommentsParams,
  CreateTicketCommentBody,
  CreateTicketCommentParams,
} from "@workspace/api-zod";
import { notifyMentionedContacts, resolveMentionedContacts } from "../lib/mentions";
import { addBusinessMinutes, getDefaultBusinessHoursSchedule } from "../lib/business-hours";
import { evaluateTicketSla } from "../lib/ticket-sla";
import { evaluateTicketRules } from "../lib/ticket-rules";
import { z } from "zod";

const router = Router();

type AgentRow = typeof agentsTable.$inferSelect;
type ContactRow = typeof contactsTable.$inferSelect;
type OrgRow = typeof organizationsTable.$inferSelect;

function descriptionField(description: string | null | undefined, labels: string[]) {
  if (!description) return null;
  const pattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = description.match(new RegExp(`(?:^|\\n)\\s*(?:${pattern})\\s*:\\s*([^\\n]*)`, "i"));
  return match?.[1]?.trim() || null;
}

async function resolvePolicyDueAt(priority: string, explicitDueAt?: string | null) {
  if (explicitDueAt) return new Date(explicitDueAt);

  const normalizedPriority = priority.toLowerCase();
  const [policy] = await db
    .select()
    .from(slaPoliciesTable)
    .where(and(eq(slaPoliciesTable.priority, normalizedPriority), eq(slaPoliciesTable.isActive, true)))
    .orderBy(desc(slaPoliciesTable.id))
    .limit(1);

  if (!policy) return null;

  const baseStart = new Date();
  const schedule = await getDefaultBusinessHoursSchedule();
  return addBusinessMinutes(baseStart, policy.resolutionMinutes, schedule);
}

async function findLeastLoadedOnlineAgent(excludedAgentIds: number[] = []) {
  const onlineAgents = await db
    .select({
      id: agentsTable.id,
      name: agentsTable.name,
      isOnline: agentsTable.isOnline,
    })
    .from(agentsTable)
    .where(and(eq(agentsTable.isOnline, true), excludedAgentIds.length ? sql`${agentsTable.id} NOT IN (${excludedAgentIds})` : sql`TRUE`));

  const agentsWithLoad = await Promise.all(
    onlineAgents.map(async (agent) => {
      const [loadRow] = await db
        .select({ cnt: count() })
        .from(ticketsTable)
        .where(and(eq(ticketsTable.assigneeId, agent.id), sql`${ticketsTable.status} NOT IN ('solved','closed')`));

      return {
        ...agent,
        openTicketCount: Number(loadRow?.cnt ?? 0),
      };
    }),
  );

  agentsWithLoad.sort((a, b) => a.openTicketCount - b.openTicketCount || a.name.localeCompare(b.name));
  return agentsWithLoad[0] ?? null;
}

function serializeAgent(a: AgentRow | null | undefined, openCount = 0) {
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    avatarUrl: a.avatarUrl,
    isOnline: a.isOnline,
    openTicketCount: openCount,
    createdAt: a.createdAt.toISOString(),
  };
}

function serializeContact(c: ContactRow | null | undefined) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    organizationId: c.organizationId,
    organization: null,
    role: c.role,
    tags: c.tags,
    notes: c.notes,
    ticketCount: 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeOrg(o: OrgRow | null | undefined) {
  if (!o) return null;
  return {
    id: o.id,
    name: o.name,
    domain: o.domain,
    industry: o.industry,
    plan: o.plan,
    notes: o.notes,
    contactCount: 0,
    ticketCount: 0,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function serializeTicket(
  t: typeof ticketsTable.$inferSelect,
  agent: AgentRow | null | undefined,
  contact: ContactRow | null | undefined,
  org: OrgRow | null | undefined,
  commentCount: number,
  routingReason?: string | null,
) {
  const row = t as any;

  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    type: row.type,
    channel: row.channel,
    assigneeId: row.assigneeId,
    assignee: serializeAgent(agent),
    requesterId: row.requesterId,
    requester: serializeContact(contact),
    organizationId: row.organizationId,
    organization: serializeOrg(org),
    tags: row.tags,
    dueAt: row.dueAt?.toISOString() ?? null,
    firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    satisfaction: row.satisfaction,
    mergedIntoId: row.mergedIntoId ?? null,
    attachments: row.attachments ?? [],
    client: row.client ?? null,
    fleetNum: row.fleetNum ?? descriptionField(row.description, ["fleet num", "fleet no", "fleet number"]),
    reg: row.reg ?? descriptionField(row.description, ["reg", "registration", "number plate"]),
    vin: row.vin ?? descriptionField(row.description, ["vin"]),
    engine: row.engine ?? descriptionField(row.description, ["engine"]),
    make: row.make ?? descriptionField(row.description, ["make"]),
    model: row.model ?? descriptionField(row.description, ["model"]),
    colour: row.colour ?? descriptionField(row.description, ["colour", "color"]),
    odo: row.odo ?? descriptionField(row.description, ["odo", "odometer"]),
    deviceId: row.deviceId ?? descriptionField(row.description, ["device id"]),
    deviceCellNo: row.deviceCellNo ?? descriptionField(row.description, ["device cell no", "device cell"]),
    deviceType: row.deviceType ?? descriptionField(row.description, ["device type", "camera type"]),
    trackingImei: row.trackingImei ?? descriptionField(row.description, ["tracking imei"]),
    trackingCellNum: row.trackingCellNum ?? descriptionField(row.description, ["tracking cell num", "tracking cell number"]),
    trackingType: row.trackingType ?? descriptionField(row.description, ["tracking type"]),
    vesaNum: row.vesaNum ?? descriptionField(row.description, ["vesa num", "vesa"]),
    hours: row.hours ?? descriptionField(row.description, ["hours", "hrs"]),
    commentCount,
    routingReason: routingReason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── LIST TICKETS ─────────────────────────────────────────────────────────────
async function listTickets(req: Request, res: Response) {
  const slaBreach = typeof req.query.slaBreach === "string" ? req.query.slaBreach : undefined;
  if (slaBreach && !["firstResponse", "resolution", "assignment"].includes(slaBreach)) {
    return res.status(400).json({ error: "slaBreach must be firstResponse, resolution, or assignment" });
  }
  const ticketIdsParam = typeof req.query.ticketIds === "string" ? req.query.ticketIds : undefined;
  const rawPostedTicketIds: unknown = req.body?.ticketIds;
  if (rawPostedTicketIds !== undefined && !Array.isArray(rawPostedTicketIds)) {
    return res.status(400).json({ error: "ticketIds must be an array of positive ticket IDs" });
  }
  const postedTicketIds = Array.isArray(rawPostedTicketIds)
    ? rawPostedTicketIds.map((id: unknown) => typeof id === "number" ? id : Number.NaN)
    : undefined;
  const requestedTicketIds: number[] | undefined = ticketIdsParam?.split(",").map(Number) ?? postedTicketIds;
  if (requestedTicketIds?.some((id) => !Number.isSafeInteger(id) || id < 1) || (requestedTicketIds && requestedTicketIds.length > 10000)) {
    return res.status(400).json({ error: "ticketIds must contain up to 10,000 positive ticket IDs" });
  }
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) {
    return res.status(400).json({ error: "from and to must be valid dates, with from no later than to" });
  }
  const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
  const client = typeof req.query.client === "string" ? req.query.client : undefined;
  const createdMonth = typeof req.query.createdMonth === "string" ? req.query.createdMonth : undefined;
  const unassignedOrganization = req.query.organizationId === "unassigned";
  const unassignedAssignee = req.query.assigneeId === "unassigned";
  if (createdMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(createdMonth)) {
    return res.status(400).json({ error: "createdMonth must use YYYY-MM format" });
  }
  const query = ListTicketsQueryParams.parse({
    status: req.query.status,
    priority: req.query.priority,
    assigneeId: req.query.assigneeId && !unassignedAssignee ? Number(req.query.assigneeId) : undefined,
    organizationId: req.query.organizationId && !unassignedOrganization ? Number(req.query.organizationId) : undefined,
    contactId: req.query.contactId ? Number(req.query.contactId) : undefined,
    q: req.query.q,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortDir: req.query.sortDir as string | undefined,
  });

  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (query.status) conditions.push(eq(ticketsTable.status, query.status));
  if (query.priority) conditions.push(eq(ticketsTable.priority, query.priority));
  if (query.assigneeId) conditions.push(eq(ticketsTable.assigneeId, query.assigneeId));
  if (query.organizationId) conditions.push(eq(ticketsTable.organizationId, query.organizationId));
  if (query.contactId) conditions.push(eq(ticketsTable.requesterId, query.contactId));
  if (query.q) {
    const search = `%${query.q}%`;
    const ticketTableAny = ticketsTable as any;
    conditions.push(
      or(
        ilike(ticketsTable.subject, search),
        ilike(ticketsTable.description, search),
        ilike(ticketTableAny.client, search),
        ilike(ticketTableAny.fleetNum, search),
        ilike(ticketTableAny.reg, search),
        ilike(ticketTableAny.vin, search),
        ilike(ticketTableAny.engine, search),
        ilike(ticketTableAny.make, search),
        ilike(ticketTableAny.model, search),
        ilike(ticketTableAny.colour, search),
        ilike(ticketTableAny.odo, search),
        ilike(ticketTableAny.deviceId, search),
        ilike(ticketTableAny.deviceCellNo, search),
        ilike(ticketTableAny.deviceType, search),
        ilike(ticketTableAny.trackingImei, search),
        ilike(ticketTableAny.trackingCellNum, search),
        ilike(ticketTableAny.trackingType, search),
      ),
    );
  }
  if (requestedTicketIds) conditions.push(requestedTicketIds.length ? inArray(ticketsTable.id, requestedTicketIds) : sql`FALSE`);
  if (unassignedOrganization) conditions.push(sql`${ticketsTable.organizationId} IS NULL`);
  if (unassignedAssignee) conditions.push(sql`${ticketsTable.assigneeId} IS NULL`);
  if (from) conditions.push(gte(ticketsTable.createdAt, from));
  if (to) conditions.push(lte(ticketsTable.createdAt, to));
  if (channel) conditions.push(eq(ticketsTable.channel, channel));
  if (client) conditions.push(ilike((ticketsTable as any).client, client));
  if (createdMonth) {
    const monthStart = new Date(`${createdMonth}-01T00:00:00.000Z`);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    conditions.push(gte(ticketsTable.createdAt, monthStart), sql`${ticketsTable.createdAt} < ${monthEnd}`);
  }

  let where = conditions.length > 0 ? and(...conditions) : undefined;
  if (slaBreach) {
    const candidates = await db.select().from(ticketsTable).where(where).limit(10001);
    if (candidates.length > 10000) {
      return res.status(400).json({ error: "SLA breach filtering is limited to 10,000 tickets; narrow the date range." });
    }
    if (!candidates.length) {
      conditions.push(sql`FALSE`);
    } else {
      const ids = candidates.map((ticket) => ticket.id);
      const [comments, events, policies] = await Promise.all([
        db.select().from(commentsTable).where(inArray(commentsTable.ticketId, ids)).orderBy(asc(commentsTable.createdAt)),
        db.select().from(activityEventsTable).where(inArray(activityEventsTable.ticketId, ids)).orderBy(asc(activityEventsTable.createdAt)),
        db.select().from(slaPoliciesTable).where(eq(slaPoliciesTable.isActive, true)),
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
      const policyByPriority = new Map(policies.map((policy) => [policy.priority.toLowerCase(), policy]));
      const scheduleByOrg = new Map<number | null, Awaited<ReturnType<typeof getDefaultBusinessHoursSchedule>>>();
      const now = new Date();
      const breachedIds: number[] = [];
      for (const ticket of candidates) {
        if (!scheduleByOrg.has(ticket.organizationId)) {
          scheduleByOrg.set(ticket.organizationId, await getDefaultBusinessHoursSchedule(ticket.organizationId ?? undefined));
        }
        const evaluation = evaluateTicketSla(
          ticket,
          commentsByTicket.get(ticket.id) ?? [],
          eventsByTicket.get(ticket.id) ?? [],
          policyByPriority.get(ticket.priority.toLowerCase()),
          scheduleByOrg.get(ticket.organizationId) ?? null,
          now,
        );
        const breached = slaBreach === "firstResponse"
          ? evaluation.firstResponseWithinSla === false
          : slaBreach === "resolution"
            ? evaluation.resolutionWithinSla === false
            : evaluation.assignmentWithinSla === false;
        if (breached) breachedIds.push(ticket.id);
      }
      conditions.push(breachedIds.length ? inArray(ticketsTable.id, breachedIds) : sql`FALSE`);
    }
    where = and(...conditions);
  }

  const sortMap: Record<string, any> = {
    createdAt: ticketsTable.createdAt,
    updatedAt: ticketsTable.updatedAt,
    priority: ticketsTable.priority,
    dueAt: ticketsTable.dueAt,
  };
  const sortCol = sortMap[query.sortBy ?? "createdAt"] ?? ticketsTable.createdAt;
  const orderFn = query.sortDir === "asc" ? asc : desc;

  const [totalRow] = await db.select({ cnt: count() }).from(ticketsTable).where(where);
  const tickets = await db
    .select()
    .from(ticketsTable)
    .where(where)
    .orderBy(orderFn(sortCol))
    .limit(limit)
    .offset(offset);

  if (tickets.length === 0) {
    return res.json({ data: [], total: Number(totalRow?.cnt ?? 0), page, limit });
  }

  const agentIds = [...new Set(tickets.map((t) => t.assigneeId).filter(Boolean))] as number[];
  const contactIds = [...new Set(tickets.map((t) => t.requesterId).filter(Boolean))] as number[];
  const orgIds = [...new Set(tickets.map((t) => t.organizationId).filter(Boolean))] as number[];
  const ticketIds = tickets.map((t) => t.id);

  const [agents, contacts, orgs, commentRows, routingRows] = await Promise.all([
    agentIds.length > 0 ? db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds)) : [],
    contactIds.length > 0 ? db.select().from(contactsTable).where(inArray(contactsTable.id, contactIds)) : [],
    orgIds.length > 0 ? db.select().from(organizationsTable).where(inArray(organizationsTable.id, orgIds)) : [],
    db.select({ ticketId: commentsTable.ticketId, cnt: count() }).from(commentsTable).where(inArray(commentsTable.ticketId, ticketIds)).groupBy(commentsTable.ticketId),
    db.select({ ticketId: activityEventsTable.ticketId, description: activityEventsTable.description })
      .from(activityEventsTable)
      .where(and(inArray(activityEventsTable.ticketId, ticketIds), eq(activityEventsTable.type, "ticket_created"))),
  ]);

  const agentMap = new Map((agents as AgentRow[]).map((a) => [a.id, a]));
  const contactMap = new Map((contacts as ContactRow[]).map((c) => [c.id, c]));
  const orgMap = new Map((orgs as OrgRow[]).map((o) => [o.id, o]));
  const ccMap = new Map(commentRows.map((r) => [r.ticketId, Number(r.cnt)]));
  const routingMap = new Map(routingRows.map((row) => [
    row.ticketId,
    row.description.includes("left unassigned because")
      ? row.description.includes("backup agent") ? "No online agents: primary and backup unavailable" : "No online agents"
      : row.description.includes("assigned to backup agent") ? "Assigned to backup" : "Awaiting manual assignment",
  ]));

  const data = tickets.map((t) =>
    serializeTicket(
      t,
      t.assigneeId ? agentMap.get(t.assigneeId) : null,
      t.requesterId ? contactMap.get(t.requesterId) : null,
      t.organizationId ? orgMap.get(t.organizationId) : null,
      ccMap.get(t.id) ?? 0,
      routingMap.get(t.id) ?? null,
    ),
  );

  res.json({ data, total: Number(totalRow?.cnt ?? 0), page, limit });
}

router.get("/", listTickets);
router.post("/search", listTickets);

// ─── CREATE TICKET ────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  // Parse and normalise incoming ticket payload
  let body: ReturnType<typeof CreateTicketBody.parse>;
  try {
    body = CreateTicketBody.parse({
      ...req.body,
      channel: req.body?.channel || "web",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid ticket payload", details: error.issues });
    }
    throw error;
  }
  if (body.requesterId == null || body.organizationId == null) {
    return res.status(400).json({
      error: "Requester and organization are required",
      details: [
        ...(body.requesterId == null ? [{ path: ["requesterId"], message: "Requester is required" }] : []),
        ...(body.organizationId == null ? [{ path: ["organizationId"], message: "Organization is required" }] : []),
      ],
    });
  }
  const [requester, organization] = await Promise.all([
    db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.id, body.requesterId)).then((rows) => rows[0]),
    db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.id, body.organizationId)).then((rows) => rows[0]),
  ]);
  if (!requester || !organization) {
    return res.status(400).json({
      error: "Select a valid requester and organization",
      details: [
        ...(!requester ? [{ path: ["requesterId"], message: "Requester was not found" }] : []),
        ...(!organization ? [{ path: ["organizationId"], message: "Organization was not found" }] : []),
      ],
    });
  }
  const dueAt = await resolvePolicyDueAt(body.priority ?? "standard", body.dueAt ?? null);

  const resolvedRequesterId = body.requesterId;

  try {
    // Insert ticket forcing the resolved requesterId (if any)
    const [onCallSetting] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "on_call_agent_id"));
    const [backupSetting] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "backup_agent_id"));
    const configuredOnCallAgentId = onCallSetting?.value ? Number(onCallSetting.value) : null;
    const configuredBackupAgentId = backupSetting?.value ? Number(backupSetting.value) : null;
    const [configuredOnCallAgent] = configuredOnCallAgentId
      ? await db.select({ id: agentsTable.id, name: agentsTable.name, isOnline: agentsTable.isOnline }).from(agentsTable).where(eq(agentsTable.id, configuredOnCallAgentId))
      : [];
    const [configuredBackupAgent] = configuredBackupAgentId
      ? await db.select({ id: agentsTable.id, name: agentsTable.name, isOnline: agentsTable.isOnline }).from(agentsTable).where(eq(agentsTable.id, configuredBackupAgentId))
      : [];

    const manualAssignmentApplied = body.assigneeId !== undefined && body.assigneeId !== null;
    const primaryAgentOnline = Boolean(configuredOnCallAgent && configuredOnCallAgent.isOnline);
    const backupAgentOnline = Boolean(configuredBackupAgent && configuredBackupAgent.isOnline);
    const fallbackExclusions = [configuredOnCallAgentId, configuredBackupAgentId].filter((id): id is number => Number.isFinite(id));
    const leastLoadedOnlineAgent = !manualAssignmentApplied && !primaryAgentOnline && !backupAgentOnline
      ? await findLeastLoadedOnlineAgent(fallbackExclusions)
      : null;

    const resolvedAssigneeId = body.assigneeId
      ?? (primaryAgentOnline ? configuredOnCallAgentId : backupAgentOnline ? configuredBackupAgentId : leastLoadedOnlineAgent?.id ?? null);

    const ruleEvaluation = await evaluateTicketRules({
      organizationId: body.organizationId ?? null,
      priority: body.priority ?? "normal",
      tags: body.tags ?? [],
      description: String(body.description ?? ""),
      manualAssignmentApplied,
    });
    const ruleAssigneeId = !manualAssignmentApplied && ruleEvaluation.assigneeId !== null
      ? ruleEvaluation.assigneeId
      : resolvedAssigneeId;
    const insertPayload = {
      ...body,
      description: ruleEvaluation.description,
      tags: ruleEvaluation.tags,
      dueAt,
      requesterId: resolvedRequesterId,
      assigneeId: ruleAssigneeId,
    } as any;
    const [ticket] = await db.insert(ticketsTable).values(insertPayload).returning();

    const mentionedContacts = await resolveMentionedContacts(String(body.description ?? ""));
    if (mentionedContacts.length) {
      await notifyMentionedContacts({
        ticketId: ticket.id,
        ticketSubject: ticket.subject,
        body: String(body.description ?? ""),
        mentions: mentionedContacts.map((contact) => ({ id: contact.id, name: contact.name, email: contact.email })),
        kind: "ticket",
      });
    }

    // Log activity
    const activityDescription = manualAssignmentApplied
      ? `Ticket "${ticket.subject}" was created and assigned to agent "${ticket.assigneeId ? (await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.id, ticket.assigneeId))).find(Boolean)?.name ?? "selected agent" : "selected agent"}"`
      : ruleEvaluation.appliedRules.length
        ? `Ticket "${ticket.subject}" was created with rules applied: ${ruleEvaluation.appliedRules.map((rule) => rule.name).join(", ")}`
      : ticket.assigneeId === configuredOnCallAgentId
        ? `Ticket "${ticket.subject}" was created and assigned to on-call agent "${configuredOnCallAgent?.name ?? "configured agent"}"`
        : ticket.assigneeId === configuredBackupAgentId
        ? `Ticket "${ticket.subject}" was created and assigned to backup agent "${configuredBackupAgent?.name ?? "backup agent"}" because configured on-call agent "${configuredOnCallAgent?.name ?? "configured on-call agent"}" is offline`
        : leastLoadedOnlineAgent
          ? `Ticket "${ticket.subject}" was created and assigned to least-loaded online agent "${leastLoadedOnlineAgent.name}" because configured on-call agent "${configuredOnCallAgent?.name ?? "configured on-call agent"}" is offline and backup agent "${configuredBackupAgent?.name ?? "backup agent"}" is unavailable`
          : `Ticket "${ticket.subject}" was created and left unassigned because No online agents were available`;

    await db.insert(activityEventsTable).values({
      type: "ticket_created",
      description: activityDescription,
      ticketId: ticket.id,
      agentId: ticket.assigneeId ?? null,
    });
    if (ruleEvaluation.appliedRules.length) {
      await db.insert(activityEventsTable).values({
        type: "ticket_rule_applied",
        description: `Applied ticket rules: ${ruleEvaluation.appliedRules.map((rule) => rule.name).join(", ")}`,
        ticketId: ticket.id,
        agentId: ticket.assigneeId ?? null,
      });
    }

    broadcast({
      type: "ticket:created",
      ticketId: ticket.id,
      subject: ticket.subject,
      priority: ticket.priority,
      assigneeId: ticket.assigneeId,
    });

    // Fetch requester/contact to include in the response
    const contactRow = ticket.requesterId ? (await db.select().from(contactsTable).where(eq(contactsTable.id, ticket.requesterId)))[0] : null;

    res.status(201).json(serializeTicket(ticket, null, contactRow, null, 0));
  } catch (err: any) {
    console.error('Create ticket failed:', err);
    res.status(500).json({ error: 'Failed to create ticket', message: err?.message, stack: err?.stack });
  }
});

// ─── GET TICKET ───────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const { id } = GetTicketParams.parse({ id: Number(req.params.id) });
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const [agent, contact, org, ccRow] = await Promise.all([
    ticket.assigneeId ? db.select().from(agentsTable).where(eq(agentsTable.id, ticket.assigneeId)).then((r) => r[0]) : null,
    ticket.requesterId ? db.select().from(contactsTable).where(eq(contactsTable.id, ticket.requesterId)).then((r) => r[0]) : null,
    ticket.organizationId ? db.select().from(organizationsTable).where(eq(organizationsTable.id, ticket.organizationId)).then((r) => r[0]) : null,
    db.select({ cnt: count() }).from(commentsTable).where(eq(commentsTable.ticketId, id)).then((r) => r[0]),
  ]);

  res.json(serializeTicket(ticket, agent, contact, org, Number(ccRow?.cnt ?? 0)));
});

// ─── UPDATE TICKET ────────────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const { id } = UpdateTicketParams.parse({ id: Number(req.params.id) });
  const body = UpdateTicketBody.parse(req.body);

  const [existing] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Ticket not found" });

  const updates: Record<string, any> = { ...body };
  if (body.dueAt !== undefined) {
    updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  } else if (body.priority !== undefined && body.priority !== existing.priority) {
    const policyDueAt = await resolvePolicyDueAt(body.priority, null);
    if (policyDueAt) updates.dueAt = policyDueAt;
  }
  // Track status changes
  let statusChanged = false;
  let assigneeChanged = false;
  if (body.status && body.status !== existing.status) {
    statusChanged = true;
    if (body.status === "solved" || body.status === "closed") {
      updates.resolvedAt = new Date();
    } else if (existing.status === "solved" || existing.status === "closed") {
      updates.resolvedAt = null;
    }
    await db.insert(activityEventsTable).values({
      type: "status_changed",
      description: `Status changed from ${existing.status} to ${body.status}`,
      ticketId: id,
    });
  }

  if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
    assigneeChanged = true;
    await db.insert(activityEventsTable).values({
      type: "assignment_changed",
      description: `Ticket reassigned`,
      ticketId: id,
      agentId: body.assigneeId,
    });
  }

  const [ticket] = await db.update(ticketsTable).set(updates).where(eq(ticketsTable.id, id)).returning();

  const [agent, contact, org, ccRow] = await Promise.all([
    ticket.assigneeId ? db.select().from(agentsTable).where(eq(agentsTable.id, ticket.assigneeId)).then((r) => r[0]) : null,
    ticket.requesterId ? db.select().from(contactsTable).where(eq(contactsTable.id, ticket.requesterId)).then((r) => r[0]) : null,
    ticket.organizationId ? db.select().from(organizationsTable).where(eq(organizationsTable.id, ticket.organizationId)).then((r) => r[0]) : null,
    db.select({ cnt: count() }).from(commentsTable).where(eq(commentsTable.ticketId, id)).then((r) => r[0]),
  ]);

  if (statusChanged) {
    broadcast({
      type: "ticket:status_changed",
      ticketId: ticket.id,
      subject: ticket.subject,
      oldStatus: existing.status,
      newStatus: ticket.status,
    });
  }
  if (assigneeChanged && agent) {
    broadcast({
      type: "ticket:assigned",
      ticketId: ticket.id,
      subject: ticket.subject,
      agentId: agent.id,
      agentName: agent.name,
    });
  }

  res.json(serializeTicket(ticket, agent, contact, org, Number(ccRow?.cnt ?? 0)));
});

// ─── MERGE TICKET ─────────────────────────────────────────────────────────────
router.post("/:id/merge", async (req, res) => {
  const sourceId = Number(req.params.id);
  const { targetTicketId } = req.body as { targetTicketId: number };

  if (!targetTicketId || typeof targetTicketId !== "number") {
    return res.status(400).json({ error: "targetTicketId is required" });
  }
  if (sourceId === targetTicketId) {
    return res.status(400).json({ error: "Cannot merge a ticket into itself" });
  }

  const [[source], [target]] = await Promise.all([
    db.select().from(ticketsTable).where(eq(ticketsTable.id, sourceId)),
    db.select().from(ticketsTable).where(eq(ticketsTable.id, targetTicketId)),
  ]);

  if (!source) return res.status(404).json({ error: "Source ticket not found" });
  if (!target) return res.status(404).json({ error: "Target ticket not found" });
  if (source.mergedIntoId) {
    return res.status(400).json({ error: "Source ticket has already been merged" });
  }

  // Move all comments from source → target
  await db
    .update(commentsTable)
    .set({ ticketId: targetTicketId })
    .where(eq(commentsTable.ticketId, sourceId));

  // Move all activity events from source → target
  await db
    .update(activityEventsTable)
    .set({ ticketId: targetTicketId })
    .where(eq(activityEventsTable.ticketId, sourceId));

  // Close the source ticket and record the merge
  await db
    .update(ticketsTable)
    .set({ status: "closed", mergedIntoId: targetTicketId, resolvedAt: new Date() })
    .where(eq(ticketsTable.id, sourceId));

  // Log the merge on the target ticket
  await db.insert(activityEventsTable).values({
    type: "ticket_created",
    description: `Ticket #${sourceId} ("${source.subject}") was merged into this ticket`,
    ticketId: targetTicketId,
  });

  broadcast({
    type: "ticket:status_changed",
    ticketId: sourceId,
    subject: source.subject,
    oldStatus: source.status,
    newStatus: "closed",
  });

  // Return the updated target ticket
  const [agent, contact, org, ccRow] = await Promise.all([
    target.assigneeId ? db.select().from(agentsTable).where(eq(agentsTable.id, target.assigneeId)).then((r) => r[0]) : null,
    target.requesterId ? db.select().from(contactsTable).where(eq(contactsTable.id, target.requesterId)).then((r) => r[0]) : null,
    target.organizationId ? db.select().from(organizationsTable).where(eq(organizationsTable.id, target.organizationId)).then((r) => r[0]) : null,
    db.select({ cnt: count() }).from(commentsTable).where(eq(commentsTable.ticketId, targetTicketId)).then((r) => r[0]),
  ]);

  res.json(serializeTicket(target, agent, contact, org, Number(ccRow?.cnt ?? 0)));
});

// ─── DELETE TICKET ────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const { id } = DeleteTicketParams.parse({ id: Number(req.params.id) });
  await db.delete(ticketsTable).where(eq(ticketsTable.id, id));
  res.status(204).send();
});

// ─── LIST COMMENTS ────────────────────────────────────────────────────────────
router.get("/:id/comments", async (req, res) => {
  const { id } = ListTicketCommentsParams.parse({ id: Number(req.params.id) });
  const comments = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.ticketId, id))
    .orderBy(asc(commentsTable.createdAt));

  const agentIds = [...new Set(comments.map((c) => c.authorId).filter(Boolean))] as number[];
  const agents =
    agentIds.length > 0
      ? await db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds))
      : [];
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const result = comments.map((c) => {
    const author = c.authorId ? agentMap.get(c.authorId) : null;
    return {
      id: c.id,
      ticketId: c.ticketId,
      body: c.body,
      isPublic: c.isPublic,
      authorId: c.authorId,
      authorName: author?.name ?? null,
      authorRole: author?.role ?? null,
      attachments: c.attachments ?? [],
      createdAt: c.createdAt.toISOString(),
    };
  });

  res.json(result);
});

// ─── CREATE COMMENT ───────────────────────────────────────────────────────────
router.post("/:id/comments", async (req, res) => {
  const { id } = CreateTicketCommentParams.parse({ id: Number(req.params.id) });
  const rawBody = req.body as any;
  const body = CreateTicketCommentBody.parse(rawBody);

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  let resolvedAuthorId: number | null = typeof rawBody.authorId === "number" ? rawBody.authorId : null;
  if (!resolvedAuthorId && req.isAuthenticated?.()) {
    const userEmail = String(req.user?.email ?? "").trim().toLowerCase();
    if (userEmail) {
      const [existingAgent] = await db.select().from(agentsTable).where(eq(agentsTable.email, userEmail)).limit(1);
      if (existingAgent) {
        resolvedAuthorId = existingAgent.id;
      } else {
        const displayName = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(" ") || userEmail.split("@", 2)[0];
        const [createdAgent] = await db
          .insert(agentsTable)
          .values({
            name: displayName,
            email: userEmail,
            role: "agent",
            isOnline: true,
          })
          .returning();
        resolvedAuthorId = createdAgent?.id ?? null;
      }
    }
  }

  const [comment] = await db.insert(commentsTable).values({ ...body, ticketId: id, authorId: resolvedAuthorId }).returning();

  const mentionedContacts = await resolveMentionedContacts(String(body.body ?? ""));
  if (mentionedContacts.length) {
    await notifyMentionedContacts({
      ticketId: id,
      ticketSubject: ticket.subject,
      body: String(body.body ?? ""),
      mentions: mentionedContacts.map((contact) => ({ id: contact.id, name: contact.name, email: contact.email })),
      kind: "comment",
    });
  }

  // First response is the first public reply authored by an agent.
  if (!ticket.firstResponseAt && body.isPublic && resolvedAuthorId !== null) {
    await db.update(ticketsTable).set({ firstResponseAt: comment.createdAt }).where(eq(ticketsTable.id, id));
  }

  // Log activity
  await db.insert(activityEventsTable).values({
    type: "comment_added",
    description: `${body.isPublic ? "Public" : "Internal"} comment added`,
    ticketId: id,
    agentId: resolvedAuthorId ?? null,
  });

  const author = resolvedAuthorId ? (await db.select().from(agentsTable).where(eq(agentsTable.id, resolvedAuthorId)))[0] : null;

  broadcast({
    type: "comment:added",
    ticketId: id,
    subject: ticket.subject,
    authorName: author?.name ?? null,
    isPublic: body.isPublic ?? true,
  });

  res.status(201).json({
    id: comment.id,
    ticketId: comment.ticketId,
    body: comment.body,
    isPublic: comment.isPublic,
    authorId: comment.authorId,
    authorName: author?.name ?? null,
    authorRole: author?.role ?? null,
    attachments: comment.attachments ?? [],
    createdAt: comment.createdAt.toISOString(),
  });
});

export default router;

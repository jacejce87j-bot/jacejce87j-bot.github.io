import { Router } from "express";
import { db } from "@workspace/db";
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
  ilike,
  sql,
  desc,
  asc,
  inArray,
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

const router = Router();

type AgentRow = typeof agentsTable.$inferSelect;
type ContactRow = typeof contactsTable.$inferSelect;
type OrgRow = typeof organizationsTable.$inferSelect;

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

function serializeTicket(
  t: typeof ticketsTable.$inferSelect,
  agent: AgentRow | null | undefined,
  contact: ContactRow | null | undefined,
  org: OrgRow | null | undefined,
  commentCount: number,
) {
  return {
    id: t.id,
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    type: t.type,
    channel: t.channel,
    assigneeId: t.assigneeId,
    assignee: serializeAgent(agent),
    requesterId: t.requesterId,
    requester: serializeContact(contact),
    organizationId: t.organizationId,
    organization: serializeOrg(org),
    tags: t.tags,
    dueAt: t.dueAt?.toISOString() ?? null,
    firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    satisfaction: t.satisfaction,
    commentCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ─── LIST TICKETS ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const query = ListTicketsQueryParams.parse({
    status: req.query.status,
    priority: req.query.priority,
    assigneeId: req.query.assigneeId ? Number(req.query.assigneeId) : undefined,
    organizationId: req.query.organizationId ? Number(req.query.organizationId) : undefined,
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
  if (query.q) conditions.push(ilike(ticketsTable.subject, `%${query.q}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

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

  const [agents, contacts, orgs, commentRows] = await Promise.all([
    agentIds.length > 0 ? db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds)) : [],
    contactIds.length > 0 ? db.select().from(contactsTable).where(inArray(contactsTable.id, contactIds)) : [],
    orgIds.length > 0 ? db.select().from(organizationsTable).where(inArray(organizationsTable.id, orgIds)) : [],
    db.select({ ticketId: commentsTable.ticketId, cnt: count() }).from(commentsTable).where(inArray(commentsTable.ticketId, ticketIds)).groupBy(commentsTable.ticketId),
  ]);

  const agentMap = new Map((agents as AgentRow[]).map((a) => [a.id, a]));
  const contactMap = new Map((contacts as ContactRow[]).map((c) => [c.id, c]));
  const orgMap = new Map((orgs as OrgRow[]).map((o) => [o.id, o]));
  const ccMap = new Map(commentRows.map((r) => [r.ticketId, Number(r.cnt)]));

  const data = tickets.map((t) =>
    serializeTicket(
      t,
      t.assigneeId ? agentMap.get(t.assigneeId) : null,
      t.requesterId ? contactMap.get(t.requesterId) : null,
      t.organizationId ? orgMap.get(t.organizationId) : null,
      ccMap.get(t.id) ?? 0,
    ),
  );

  res.json({ data, total: Number(totalRow?.cnt ?? 0), page, limit });
});

// ─── CREATE TICKET ────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const body = CreateTicketBody.parse(req.body);
  const dueAt = body.dueAt ? new Date(body.dueAt) : null;
  const [ticket] = await db
    .insert(ticketsTable)
    .values({ ...body, dueAt })
    .returning();

  // Log activity
  await db.insert(activityEventsTable).values({
    type: "ticket_created",
    description: `Ticket "${ticket.subject}" was created`,
    ticketId: ticket.id,
    agentId: body.assigneeId ?? null,
  });

  res.status(201).json(serializeTicket(ticket, null, null, null, 0));
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
  if (body.dueAt !== undefined) updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;

  // Track status changes
  if (body.status && body.status !== existing.status) {
    if (body.status === "solved" || body.status === "closed") {
      updates.resolvedAt = new Date();
    }
    await db.insert(activityEventsTable).values({
      type: "status_changed",
      description: `Status changed from ${existing.status} to ${body.status}`,
      ticketId: id,
    });
  }

  if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
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

  res.json(serializeTicket(ticket, agent, contact, org, Number(ccRow?.cnt ?? 0)));
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
      createdAt: c.createdAt.toISOString(),
    };
  });

  res.json(result);
});

// ─── CREATE COMMENT ───────────────────────────────────────────────────────────
router.post("/:id/comments", async (req, res) => {
  const { id } = CreateTicketCommentParams.parse({ id: Number(req.params.id) });
  const body = CreateTicketCommentBody.parse(req.body);

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const [comment] = await db.insert(commentsTable).values({ ...body, ticketId: id }).returning();

  // Set firstResponseAt if not set and assignee is adding a public comment
  if (!ticket.firstResponseAt && body.isPublic) {
    await db.update(ticketsTable).set({ firstResponseAt: new Date() }).where(eq(ticketsTable.id, id));
  }

  // Log activity
  await db.insert(activityEventsTable).values({
    type: "comment_added",
    description: `${body.isPublic ? "Public" : "Internal"} comment added`,
    ticketId: id,
    agentId: body.authorId ?? null,
  });

  const author = body.authorId ? (await db.select().from(agentsTable).where(eq(agentsTable.id, body.authorId)))[0] : null;

  res.status(201).json({
    id: comment.id,
    ticketId: comment.ticketId,
    body: comment.body,
    isPublic: comment.isPublic,
    authorId: comment.authorId,
    authorName: author?.name ?? null,
    authorRole: author?.role ?? null,
    createdAt: comment.createdAt.toISOString(),
  });
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import {
  activityEventsTable,
  agentsTable,
  commentsTable,
  contactsTable,
  organizationsTable,
  ticketsTable,
} from "@workspace/db";
import {
  CreateMobileTicketBody,
  GetMobileTicketParams,
  ListMobileTicketsQueryParams,
  UpdateMobileTicketBody,
} from "@workspace/api-zod";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { broadcast } from "../lib/ws-manager";
import { serializeTicket } from "./tickets";

const router = Router();

async function getSignedInAgent(req: Express.Request) {
  const email = req.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.email, email));
  return agent ?? null;
}

async function serializeTicketRows(rows: (typeof ticketsTable.$inferSelect)[]) {
  if (rows.length === 0) return [];

  const agentIds = [...new Set(rows.map((ticket) => ticket.assigneeId).filter(Boolean))] as number[];
  const contactIds = [...new Set(rows.map((ticket) => ticket.requesterId).filter(Boolean))] as number[];
  const orgIds = [...new Set(rows.map((ticket) => ticket.organizationId).filter(Boolean))] as number[];
  const ticketIds = rows.map((ticket) => ticket.id);

  const [agents, contacts, orgs, commentRows] = await Promise.all([
    agentIds.length ? db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds)) : [],
    contactIds.length ? db.select().from(contactsTable).where(inArray(contactsTable.id, contactIds)) : [],
    orgIds.length ? db.select().from(organizationsTable).where(inArray(organizationsTable.id, orgIds)) : [],
    db
      .select({ ticketId: commentsTable.ticketId, cnt: count() })
      .from(commentsTable)
      .where(inArray(commentsTable.ticketId, ticketIds))
      .groupBy(commentsTable.ticketId),
  ]);

  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
  const orgMap = new Map(orgs.map((org) => [org.id, org]));
  const commentMap = new Map(commentRows.map((row) => [row.ticketId, Number(row.cnt)]));

  return rows.map((ticket) =>
    serializeTicket(
      ticket,
      ticket.assigneeId ? agentMap.get(ticket.assigneeId) : null,
      ticket.requesterId ? contactMap.get(ticket.requesterId) : null,
      ticket.organizationId ? orgMap.get(ticket.organizationId) : null,
      commentMap.get(ticket.id) ?? 0,
    ),
  );
}

async function serializeSingleTicket(ticket: typeof ticketsTable.$inferSelect) {
  const [serialized] = await serializeTicketRows([ticket]);
  return serialized;
}

router.get("/tickets", async (req, res) => {
  const agent = await getSignedInAgent(req);
  if (!agent) {
    res.status(403).json({ error: "Your SupportDesk account is not linked to an agent" });
    return;
  }

  const query = ListMobileTicketsQueryParams.parse({
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
  });
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const conditions = [eq(ticketsTable.assigneeId, agent.id)];
  if (query.status) conditions.push(eq(ticketsTable.status, query.status));
  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ cnt: count() }).from(ticketsTable).where(where),
    db
      .select()
      .from(ticketsTable)
      .where(where)
      .orderBy(desc(ticketsTable.updatedAt), asc(ticketsTable.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  res.json({
    data: await serializeTicketRows(rows),
    total: Number(totalRow[0]?.cnt ?? 0),
    page,
    limit,
  });
});

router.post("/tickets", async (req, res) => {
  const agent = await getSignedInAgent(req);
  if (!agent) {
    res.status(403).json({ error: "Your SupportDesk account is not linked to an agent" });
    return;
  }

  const body = CreateMobileTicketBody.parse(req.body);
  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      ...body,
      assigneeId: agent.id,
      attachments: body.attachments ?? [],
    })
    .returning();

  await db.insert(activityEventsTable).values({
    type: "ticket_created",
    description: `Ticket "${ticket.subject}" was created from mobile`,
    ticketId: ticket.id,
    agentId: agent.id,
  });
  broadcast({
    type: "ticket:created",
    ticketId: ticket.id,
    subject: ticket.subject,
    priority: ticket.priority,
    assigneeId: ticket.assigneeId,
  });

  res.status(201).json(await serializeSingleTicket(ticket));
});

router.get("/tickets/:id", async (req, res) => {
  const agent = await getSignedInAgent(req);
  if (!agent) {
    res.status(403).json({ error: "Your SupportDesk account is not linked to an agent" });
    return;
  }
  const { id } = GetMobileTicketParams.parse({ id: Number(req.params.id) });
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, id), eq(ticketsTable.assigneeId, agent.id)));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  res.json(await serializeSingleTicket(ticket));
});

router.patch("/tickets/:id", async (req, res) => {
  const agent = await getSignedInAgent(req);
  if (!agent) {
    res.status(403).json({ error: "Your SupportDesk account is not linked to an agent" });
    return;
  }
  const { id } = GetMobileTicketParams.parse({ id: Number(req.params.id) });
  const body = UpdateMobileTicketBody.parse(req.body);
  const [existing] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, id), eq(ticketsTable.assigneeId, agent.id)));
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const updates: Record<string, unknown> = { ...body };
  if (
    body.status &&
    body.status !== existing.status &&
    (body.status === "solved" || body.status === "closed")
  ) {
    updates.resolvedAt = new Date();
  }
  const [ticket] = await db
    .update(ticketsTable)
    .set(updates)
    .where(and(eq(ticketsTable.id, id), eq(ticketsTable.assigneeId, agent.id)))
    .returning();

  if (body.status && body.status !== existing.status) {
    await db.insert(activityEventsTable).values({
      type: "status_changed",
      description: `Status changed from ${existing.status} to ${body.status} from mobile`,
      ticketId: id,
      agentId: agent.id,
    });
    broadcast({
      type: "ticket:status_changed",
      ticketId: id,
      subject: ticket.subject,
      oldStatus: existing.status,
      newStatus: ticket.status,
    });
  }

  res.json(await serializeSingleTicket(ticket));
});

export default router;
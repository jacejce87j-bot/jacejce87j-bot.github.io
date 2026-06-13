import { Router } from "express";
import { db } from "@workspace/db";
import { contactsTable, organizationsTable, ticketsTable, agentsTable } from "@workspace/db";
import { eq, count, ilike, and, sql, inArray } from "drizzle-orm";
import {
  CreateContactBody,
  UpdateContactBody,
  UpdateContactParams,
  GetContactParams,
  DeleteContactParams,
  ListContactsQueryParams,
  ListContactTicketsParams,
} from "@workspace/api-zod";

const router = Router();

async function formatContact(c: typeof contactsTable.$inferSelect, ticketCnt: number, org?: typeof organizationsTable.$inferSelect | null) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    organizationId: c.organizationId,
    organization: org
      ? { id: org.id, name: org.name, domain: org.domain, industry: org.industry, plan: org.plan, notes: org.notes, contactCount: 0, ticketCount: 0, createdAt: org.createdAt.toISOString(), updatedAt: org.updatedAt.toISOString() }
      : null,
    role: c.role,
    tags: c.tags,
    notes: c.notes,
    ticketCount: ticketCnt,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/", async (req, res) => {
  const query = ListContactsQueryParams.parse({
    q: req.query.q,
    organizationId: req.query.organizationId ? Number(req.query.organizationId) : undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (query.q) conditions.push(ilike(contactsTable.name, `%${query.q}%`));
  if (query.organizationId) conditions.push(eq(contactsTable.organizationId, query.organizationId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ cnt: count() }).from(contactsTable).where(where);
  const contacts = await db.select().from(contactsTable).where(where).limit(limit).offset(offset).orderBy(contactsTable.name);

  const orgIds = [...new Set(contacts.map((c) => c.organizationId).filter(Boolean))] as number[];
  const orgs = orgIds.length > 0 ? await db.select().from(organizationsTable).where(inArray(organizationsTable.id, orgIds)) : [];
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const ticketCounts = await db.select({ requesterId: ticketsTable.requesterId, cnt: count() }).from(ticketsTable).groupBy(ticketsTable.requesterId);
  const tcMap = new Map(ticketCounts.map((r) => [r.requesterId, Number(r.cnt)]));

  const data = await Promise.all(contacts.map((c) => formatContact(c, tcMap.get(c.id) ?? 0, c.organizationId ? orgMap.get(c.organizationId) : null)));
  res.json({ data, total: Number(totalRow?.cnt ?? 0), page, limit });
});

router.post("/", async (req, res) => {
  const body = CreateContactBody.parse(req.body);
  const [contact] = await db.insert(contactsTable).values(body).returning();
  res.status(201).json(await formatContact(contact, 0, null));
});

router.get("/:id", async (req, res) => {
  const { id } = GetContactParams.parse({ id: Number(req.params.id) });
  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id));
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  const org = contact.organizationId ? (await db.select().from(organizationsTable).where(eq(organizationsTable.id, contact.organizationId)))[0] : null;
  const [tRow] = await db.select({ cnt: count() }).from(ticketsTable).where(eq(ticketsTable.requesterId, id));
  res.json(await formatContact(contact, Number(tRow?.cnt ?? 0), org));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateContactParams.parse({ id: Number(req.params.id) });
  const body = UpdateContactBody.parse(req.body);
  const [contact] = await db.update(contactsTable).set(body).where(eq(contactsTable.id, id)).returning();
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  res.json(await formatContact(contact, 0, null));
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteContactParams.parse({ id: Number(req.params.id) });
  await db.delete(contactsTable).where(eq(contactsTable.id, id));
  res.status(204).send();
});

router.get("/:id/tickets", async (req, res) => {
  const { id } = ListContactTicketsParams.parse({ id: Number(req.params.id) });
  const tickets = await db.select().from(ticketsTable).where(eq(ticketsTable.requesterId, id)).orderBy(sql`${ticketsTable.createdAt} DESC`);
  const agents = await db.select().from(agentsTable);
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const commentCounts = await db.select({ ticketId: ticketsTable.id, cnt: count() }).from(ticketsTable).groupBy(ticketsTable.id);
  const result = tickets.map((t) => formatTicket(t, agentMap, null, null, 0));
  res.json(result);
});

function formatTicket(t: any, agentMap: Map<number, any>, contact: any, org: any, commentCount: number) {
  const assignee = t.assigneeId ? agentMap.get(t.assigneeId) : null;
  return {
    id: t.id,
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    type: t.type,
    channel: t.channel,
    assigneeId: t.assigneeId,
    assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, role: assignee.role, avatarUrl: assignee.avatarUrl, isOnline: assignee.isOnline, openTicketCount: 0, createdAt: assignee.createdAt.toISOString() } : null,
    requesterId: t.requesterId,
    requester: contact,
    organizationId: t.organizationId,
    organization: org,
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

export default router;

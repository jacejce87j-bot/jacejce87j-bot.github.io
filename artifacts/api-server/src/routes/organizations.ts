import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable, contactsTable, ticketsTable } from "@workspace/db";
import { eq, count, ilike, or, sql } from "drizzle-orm";
import {
  CreateOrganizationBody,
  UpdateOrganizationBody,
  UpdateOrganizationParams,
  GetOrganizationParams,
  DeleteOrganizationParams,
  ListOrganizationsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const query = ListOrganizationsQueryParams.parse({
    q: req.query.q,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const offset = (page - 1) * limit;

  let baseQuery = db.select().from(organizationsTable);
  if (query.q) {
    baseQuery = baseQuery.where(ilike(organizationsTable.name, `%${query.q}%`)) as typeof baseQuery;
  }

  const [totalRow] = await db
    .select({ cnt: count() })
    .from(organizationsTable)
    .where(query.q ? ilike(organizationsTable.name, `%${query.q}%`) : undefined);

  const orgs = await baseQuery.limit(limit).offset(offset).orderBy(organizationsTable.name);

  const contactCounts = await db
    .select({ organizationId: contactsTable.organizationId, cnt: count() })
    .from(contactsTable)
    .groupBy(contactsTable.organizationId);
  const ticketCounts = await db
    .select({ organizationId: ticketsTable.organizationId, cnt: count() })
    .from(ticketsTable)
    .groupBy(ticketsTable.organizationId);

  const contactMap = new Map(contactCounts.map((r) => [r.organizationId, Number(r.cnt)]));
  const ticketMap = new Map(ticketCounts.map((r) => [r.organizationId, Number(r.cnt)]));

  const data = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    domain: o.domain,
    industry: o.industry,
    plan: o.plan,
    notes: o.notes,
    contactCount: contactMap.get(o.id) ?? 0,
    ticketCount: ticketMap.get(o.id) ?? 0,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));

  res.json({ data, total: Number(totalRow?.cnt ?? 0), page, limit });
});

router.post("/", async (req, res) => {
  const body = CreateOrganizationBody.parse(req.body);
  const [org] = await db.insert(organizationsTable).values(body).returning();
  res.status(201).json({ ...org, contactCount: 0, ticketCount: 0, createdAt: org.createdAt.toISOString(), updatedAt: org.updatedAt.toISOString() });
});

router.get("/:id", async (req, res) => {
  const { id } = GetOrganizationParams.parse({ id: Number(req.params.id) });
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!org) return res.status(404).json({ error: "Organization not found" });
  const [cRow] = await db.select({ cnt: count() }).from(contactsTable).where(eq(contactsTable.organizationId, id));
  const [tRow] = await db.select({ cnt: count() }).from(ticketsTable).where(eq(ticketsTable.organizationId, id));
  res.json({
    ...org,
    contactCount: Number(cRow?.cnt ?? 0),
    ticketCount: Number(tRow?.cnt ?? 0),
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  });
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateOrganizationParams.parse({ id: Number(req.params.id) });
  const body = UpdateOrganizationBody.parse(req.body);
  const [org] = await db.update(organizationsTable).set(body).where(eq(organizationsTable.id, id)).returning();
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({ ...org, contactCount: 0, ticketCount: 0, createdAt: org.createdAt.toISOString(), updatedAt: org.updatedAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteOrganizationParams.parse({ id: Number(req.params.id) });
  await db.delete(organizationsTable).where(eq(organizationsTable.id, id));
  res.status(204).send();
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable, organizationSitesTable, contactsTable, ticketsTable } from "@workspace/db";
import { and, eq, count, ilike } from "drizzle-orm";
import { z } from "zod";
import {
  CreateOrganizationBody,
  UpdateOrganizationBody,
  UpdateOrganizationParams,
  GetOrganizationParams,
  DeleteOrganizationParams,
  ListOrganizationsQueryParams,
} from "@workspace/api-zod";

const router = Router();
const siteInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(2000),
});

router.get("/:id/sites", async (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
    return res.status(400).json({ error: "valid organization id is required" });
  }
  const [organization] = await db.select({ id: organizationsTable.id })
    .from(organizationsTable).where(eq(organizationsTable.id, organizationId));
  if (!organization) return res.status(404).json({ error: "Organization not found" });
  const sites = await db.select().from(organizationSitesTable)
    .where(eq(organizationSitesTable.organizationId, organizationId))
    .orderBy(organizationSitesTable.name);
  res.json(sites.map((site) => ({
    id: site.id,
    organizationId: site.organizationId,
    name: site.name,
    address: site.address,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  })));
});

router.post("/:id/sites", async (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
    return res.status(400).json({ error: "valid organization id is required" });
  }
  const parsed = siteInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "name and address are required", details: parsed.error.issues });
  const [organization] = await db.select({ id: organizationsTable.id })
    .from(organizationsTable).where(eq(organizationsTable.id, organizationId));
  if (!organization) return res.status(404).json({ error: "Organization not found" });
  const [site] = await db.insert(organizationSitesTable)
    .values({ organizationId, ...parsed.data }).returning();
  res.status(201).json({
    id: site.id,
    organizationId: site.organizationId,
    name: site.name,
    address: site.address,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  });
});

router.patch("/:id/sites/:siteId", async (req, res) => {
  const organizationId = Number(req.params.id);
  const siteId = Number(req.params.siteId);
  if (!Number.isSafeInteger(organizationId) || organizationId < 1 || !Number.isSafeInteger(siteId) || siteId < 1) {
    return res.status(400).json({ error: "valid organization and site ids are required" });
  }
  const parsed = siteInputSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return res.status(400).json({ error: "at least one valid site field is required", details: parsed.success ? undefined : parsed.error.issues });
  }
  const [site] = await db.update(organizationSitesTable).set(parsed.data)
    .where(and(eq(organizationSitesTable.id, siteId), eq(organizationSitesTable.organizationId, organizationId)))
    .returning();
  if (!site) return res.status(404).json({ error: "Site not found for this organization" });
  res.json({
    id: site.id,
    organizationId: site.organizationId,
    name: site.name,
    address: site.address,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  });
});

router.delete("/:id/sites/:siteId", async (req, res) => {
  const organizationId = Number(req.params.id);
  const siteId = Number(req.params.siteId);
  if (!Number.isSafeInteger(organizationId) || organizationId < 1 || !Number.isSafeInteger(siteId) || siteId < 1) {
    return res.status(400).json({ error: "valid organization and site ids are required" });
  }
  const deleted = await db.delete(organizationSitesTable)
    .where(and(eq(organizationSitesTable.id, siteId), eq(organizationSitesTable.organizationId, organizationId)))
    .returning({ id: organizationSitesTable.id });
  if (!deleted.length) return res.status(404).json({ error: "Site not found for this organization" });
  res.status(204).send();
});

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
    address: o.address,
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

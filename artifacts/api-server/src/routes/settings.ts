import { Router } from "express";
import { db, slaPoliciesTable, ticketTemplatesTable } from "@workspace/db";
import {
  CreateSlaPolicyBody,
  UpdateSlaPolicyBody,
  UpdateSlaPolicyParams,
  CreateTicketTemplateBody,
  UpdateTicketTemplateBody,
  UpdateTicketTemplateParams,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router = Router();

function isAdmin(req: any) {
  return Boolean(req.user?.role === "admin");
}

function serializePolicy(policy: typeof slaPoliciesTable.$inferSelect) {
  return {
    id: policy.id,
    name: policy.name,
    priority: policy.priority,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    isActive: policy.isActive,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

function serializeTemplate(template: typeof ticketTemplatesTable.$inferSelect) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

router.get("/sla-policies", async (_req, res) => {
  const policies = await db.select().from(slaPoliciesTable).orderBy(slaPoliciesTable.priority);
  res.json(policies.map(serializePolicy));
});

router.post("/sla-policies", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const body = CreateSlaPolicyBody.parse(req.body);
  const [policy] = await db.insert(slaPoliciesTable).values(body).returning();
  res.status(201).json(serializePolicy(policy));
});

router.patch("/sla-policies/:id", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const { id } = UpdateSlaPolicyParams.parse({ id: Number(req.params.id) });
  const body = UpdateSlaPolicyBody.parse(req.body);
  const [policy] = await db.update(slaPoliciesTable).set(body).where(eq(slaPoliciesTable.id, id)).returning();
  if (!policy) return res.status(404).json({ error: "SLA policy not found" });
  res.json(serializePolicy(policy));
});

router.get("/ticket-templates", async (_req, res) => {
  const templates = await db
    .select()
    .from(ticketTemplatesTable)
    .orderBy(ticketTemplatesTable.name);
  res.json(templates.map(serializeTemplate));
});

router.post("/ticket-templates", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const body = CreateTicketTemplateBody.parse(req.body);
  const [template] = await db.insert(ticketTemplatesTable).values(body).returning();
  res.status(201).json(serializeTemplate(template));
});

router.patch("/ticket-templates/:id", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const { id } = UpdateTicketTemplateParams.parse({ id: Number(req.params.id) });
  const body = UpdateTicketTemplateBody.parse(req.body);
  const [template] = await db
    .update(ticketTemplatesTable)
    .set(body)
    .where(eq(ticketTemplatesTable.id, id))
    .returning();
  if (!template) return res.status(404).json({ error: "Ticket template not found" });
  res.json(serializeTemplate(template));
});

router.delete("/ticket-templates/:id", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const { id } = UpdateTicketTemplateParams.parse({ id: Number(req.params.id) });
  const deleted = await db
    .delete(ticketTemplatesTable)
    .where(eq(ticketTemplatesTable.id, id))
    .returning({ id: ticketTemplatesTable.id });
  if (!deleted.length) return res.status(404).json({ error: "Ticket template not found" });
  res.status(204).send();
});

export default router;
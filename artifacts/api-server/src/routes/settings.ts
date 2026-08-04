import { Router } from "express";
import { db, slaPoliciesTable } from "@workspace/db";
import {
  CreateSlaPolicyBody,
  UpdateSlaPolicyBody,
  UpdateSlaPolicyParams,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router = Router();

function isAdmin(req: any) {
  return Boolean(req.isAuthenticated?.() && req.user?.role === "admin");
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

export default router;
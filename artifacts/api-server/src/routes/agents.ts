import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, ticketsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { CreateAgentBody, UpdateAgentBody, UpdateAgentParams, GetAgentParams } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.name);
  const openCounts = await db
    .select({ assigneeId: ticketsTable.assigneeId, cnt: count() })
    .from(ticketsTable)
    .where(eq(ticketsTable.status, "open"))
    .groupBy(ticketsTable.assigneeId);
  const countMap = new Map(openCounts.map((r) => [r.assigneeId, Number(r.cnt)]));
  const result = agents.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    avatarUrl: a.avatarUrl,
    isOnline: a.isOnline,
    openTicketCount: countMap.get(a.id) ?? 0,
    createdAt: a.createdAt.toISOString(),
  }));
  res.json(result);
});

router.post("/", async (req, res) => {
  const body = CreateAgentBody.parse(req.body);
  const [agent] = await db.insert(agentsTable).values(body).returning();
  res.status(201).json({
    ...agent,
    openTicketCount: 0,
    createdAt: agent.createdAt.toISOString(),
  });
});

router.get("/:id", async (req, res) => {
  const { id } = GetAgentParams.parse({ id: Number(req.params.id) });
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const [openRow] = await db
    .select({ cnt: count() })
    .from(ticketsTable)
    .where(sql`${ticketsTable.assigneeId} = ${id} AND ${ticketsTable.status} = 'open'`);
  res.json({
    ...agent,
    openTicketCount: Number(openRow?.cnt ?? 0),
    createdAt: agent.createdAt.toISOString(),
  });
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateAgentParams.parse({ id: Number(req.params.id) });
  const body = UpdateAgentBody.parse(req.body);
  const [agent] = await db.update(agentsTable).set(body).where(eq(agentsTable.id, id)).returning();
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json({ ...agent, createdAt: agent.createdAt.toISOString() });
});

router.delete(":id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid agent id" });
  }

  const [deleted] = await db.delete(agentsTable).where(eq(agentsTable.id, id)).returning({ id: agentsTable.id });
  if (!deleted) {
    return res.status(404).json({ error: "Agent not found" });
  }

  res.status(204).send();
});

export default router;
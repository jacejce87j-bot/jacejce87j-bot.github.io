import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  fieldAgentStockTable,
  fieldAgentsTable,
  stockItemsTable,
  stockMovementsTable,
} from "@workspace/db";

const router = Router();

const createStockItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(80).optional().nullable(),
  unit: z.string().trim().min(1).max(32).default("units"),
  initialQuantity: z.number().int().min(0).max(1_000_000),
});

const adjustStockSchema = z.object({
  quantityOnHand: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(1).max(500),
});

const createFieldAgentSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

const transferStockSchema = z.object({
  fieldAgentId: z.number().int().positive(),
  stockItemId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100_000),
});

router.get("/stock", async (_req, res) => {
  try {
    const items = await db.select().from(stockItemsTable).orderBy(asc(stockItemsTable.name));
    const allocated = await db
      .select({
        stockItemId: fieldAgentStockTable.stockItemId,
        quantity: fieldAgentStockTable.quantityOnHand,
      })
      .from(fieldAgentStockTable);
    const allocatedByItem = new Map<number, number>();
    for (const row of allocated) {
      allocatedByItem.set(row.stockItemId, (allocatedByItem.get(row.stockItemId) ?? 0) + row.quantity);
    }
    res.json({
      data: items.map((item) => ({
        ...item,
        allocatedToFieldAgents: allocatedByItem.get(item.id) ?? 0,
      })),
    });
  } catch {
    res.status(500).json({ error: "Unable to load stock items." });
  }
});

router.get("/stock/field-agents", async (_req, res) => {
  try {
    const agents = await db.select().from(fieldAgentsTable).orderBy(asc(fieldAgentsTable.name));
    const balances = await db
      .select({
        fieldAgentId: fieldAgentStockTable.fieldAgentId,
        stockItemId: fieldAgentStockTable.stockItemId,
        stockItemName: stockItemsTable.name,
        sku: stockItemsTable.sku,
        unit: stockItemsTable.unit,
        quantityOnHand: fieldAgentStockTable.quantityOnHand,
      })
      .from(fieldAgentStockTable)
      .innerJoin(stockItemsTable, eq(fieldAgentStockTable.stockItemId, stockItemsTable.id))
      .orderBy(asc(stockItemsTable.name));
    const balancesByAgent = new Map<number, typeof balances>();
    for (const balance of balances) {
      const current = balancesByAgent.get(balance.fieldAgentId) ?? [];
      current.push(balance);
      balancesByAgent.set(balance.fieldAgentId, current);
    }
    res.json({
      data: agents.map((agent) => ({
        ...agent,
        inventory: balancesByAgent.get(agent.id) ?? [],
      })),
    });
  } catch {
    res.status(500).json({ error: "Unable to load Field Agents." });
  }
});

router.post("/stock/field-agents", async (req, res) => {
  if (!["admin", "supervisor"].includes(req.user?.role ?? "")) {
    res.status(403).json({ error: "Only administrators and supervisors can add Field Agents." });
    return;
  }
  const parsed = createFieldAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a Field Agent name." });
    return;
  }
  try {
    const [agent] = await db.insert(fieldAgentsTable).values({ name: parsed.data.name }).returning();
    res.status(201).json({ agent });
  } catch {
    res.status(500).json({ error: "Unable to add Field Agent." });
  }
});

router.post("/stock/transfers", async (req, res) => {
  if (!["admin", "supervisor"].includes(req.user?.role ?? "")) {
    res.status(403).json({ error: "Only administrators and supervisors can allocate stock to Field Agents." });
    return;
  }
  const parsed = transferStockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Select a Field Agent and stock item, and enter a positive quantity." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [agent] = await tx
        .select()
        .from(fieldAgentsTable)
        .where(eq(fieldAgentsTable.id, parsed.data.fieldAgentId))
        .for("update");
      if (!agent) return { error: "agent_not_found" as const };

      const [item] = await tx
        .select()
        .from(stockItemsTable)
        .where(eq(stockItemsTable.id, parsed.data.stockItemId))
        .for("update");
      if (!item) return { error: "stock_not_found" as const };
      if (item.quantityOnHand < parsed.data.quantity) {
        return {
          error: "insufficient_stock" as const,
          details: `${item.name}: need ${parsed.data.quantity}, have ${item.quantityOnHand}`,
        };
      }

      const [balance] = await tx
        .select()
        .from(fieldAgentStockTable)
        .where(and(
          eq(fieldAgentStockTable.fieldAgentId, agent.id),
          eq(fieldAgentStockTable.stockItemId, item.id),
        ))
        .for("update");

      const transferredAt = new Date();
      await tx
        .update(stockItemsTable)
        .set({ quantityOnHand: item.quantityOnHand - parsed.data.quantity, updatedAt: transferredAt })
        .where(eq(stockItemsTable.id, item.id));
      if (balance) {
        await tx
          .update(fieldAgentStockTable)
          .set({
            quantityOnHand: balance.quantityOnHand + parsed.data.quantity,
            updatedAt: transferredAt,
          })
          .where(and(
            eq(fieldAgentStockTable.fieldAgentId, agent.id),
            eq(fieldAgentStockTable.stockItemId, item.id),
          ));
      } else {
        await tx.insert(fieldAgentStockTable).values({
          fieldAgentId: agent.id,
          stockItemId: item.id,
          quantityOnHand: parsed.data.quantity,
          updatedAt: transferredAt,
        });
      }
      await tx.insert(stockMovementsTable).values([
        {
          stockItemId: item.id,
          movementType: "transfer_to_field_agent",
          quantityDelta: -parsed.data.quantity,
          reason: `Transferred to ${agent.name}`,
          recordedBy: req.user?.id ?? null,
          createdAt: transferredAt,
        },
        {
          stockItemId: item.id,
          fieldAgentId: agent.id,
          movementType: "received_by_field_agent",
          quantityDelta: parsed.data.quantity,
          reason: "Received from Orion Stock",
          recordedBy: req.user?.id ?? null,
          createdAt: transferredAt,
        },
      ]);
      return {
        error: "ok" as const,
        item: { ...item, quantityOnHand: item.quantityOnHand - parsed.data.quantity },
        fieldAgent: agent,
        quantity: parsed.data.quantity,
      };
    });
    if (result.error === "agent_not_found") {
      res.status(404).json({ error: "Field Agent not found." });
      return;
    }
    if (result.error === "stock_not_found") {
      res.status(404).json({ error: "Stock item not found." });
      return;
    }
    if (result.error === "insufficient_stock") {
      res.status(409).json({ error: `Insufficient Orion Stock: ${result.details}.` });
      return;
    }
    res.status(201).json({
      transfer: { item: result.item, fieldAgent: result.fieldAgent, quantity: result.quantity },
    });
  } catch {
    res.status(500).json({ error: "Unable to transfer stock to the Field Agent." });
  }
});

router.post("/stock", async (req, res) => {
  if (!["admin", "supervisor"].includes(req.user?.role ?? "")) {
    res.status(403).json({ error: "Only administrators and supervisors can add stock items." });
    return;
  }
  const parsed = createStockItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a stock name, unit, and non-negative initial quantity." });
    return;
  }

  try {
    const values = parsed.data;
    const [item] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(stockItemsTable)
        .values({
          name: values.name,
          sku: values.sku || null,
          unit: values.unit,
          quantityOnHand: values.initialQuantity,
        })
        .returning();
      if (values.initialQuantity > 0) {
        await tx.insert(stockMovementsTable).values({
          stockItemId: created.id,
          movementType: "opening_balance",
          quantityDelta: values.initialQuantity,
          reason: "Opening balance",
          recordedBy: req.user?.id ?? null,
        });
      }
      return [created];
    });
    res.status(201).json({ item });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That SKU is already in use." });
      return;
    }
    res.status(500).json({ error: "Unable to create stock item." });
  }
});

router.patch("/stock/:id", async (req, res) => {
  if (!["admin", "supervisor"].includes(req.user?.role ?? "")) {
    res.status(403).json({ error: "Only administrators and supervisors can adjust stock balances." });
    return;
  }
  const id = Number(req.params.id);
  const parsed = adjustStockSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: "Provide a valid item and a non-negative counted balance with a reason." });
    return;
  }

  try {
    const item = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(stockItemsTable)
        .where(eq(stockItemsTable.id, id))
        .for("update");
      if (!current) return null;

      const delta = parsed.data.quantityOnHand - current.quantityOnHand;
      if (delta !== 0) {
        await tx
          .update(stockItemsTable)
          .set({ quantityOnHand: parsed.data.quantityOnHand, updatedAt: new Date() })
          .where(eq(stockItemsTable.id, id));
        await tx.insert(stockMovementsTable).values({
          stockItemId: id,
          movementType: "adjustment",
          quantityDelta: delta,
          reason: parsed.data.reason,
          recordedBy: req.user?.id ?? null,
        });
      }
      return { ...current, quantityOnHand: parsed.data.quantityOnHand };
    });
    if (!item) {
      res.status(404).json({ error: "Stock item not found." });
      return;
    }
    res.json({ item });
  } catch {
    res.status(500).json({ error: "Unable to adjust stock balance." });
  }
});

router.get("/stock/:id/movements", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid stock item ID." });
    return;
  }
  try {
    const movements = await db
      .select({
        id: stockMovementsTable.id,
        stockItemId: stockMovementsTable.stockItemId,
        fieldAgentId: stockMovementsTable.fieldAgentId,
        fieldAgentName: fieldAgentsTable.name,
        ticketId: stockMovementsTable.ticketId,
        movementType: stockMovementsTable.movementType,
        quantityDelta: stockMovementsTable.quantityDelta,
        reason: stockMovementsTable.reason,
        recordedBy: stockMovementsTable.recordedBy,
        createdAt: stockMovementsTable.createdAt,
      })
      .from(stockMovementsTable)
      .leftJoin(fieldAgentsTable, eq(stockMovementsTable.fieldAgentId, fieldAgentsTable.id))
      .where(eq(stockMovementsTable.stockItemId, id))
      .orderBy(sql`${stockMovementsTable.createdAt} DESC`, sql`${stockMovementsTable.id} DESC`)
      .limit(100);
    res.json({ data: movements });
  } catch {
    res.status(500).json({ error: "Unable to load stock movement history." });
  }
});

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export default router;

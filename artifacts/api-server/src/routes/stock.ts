import { Router } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, stockItemsTable, stockMovementsTable } from "@workspace/db";

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

router.get("/stock", async (_req, res) => {
  try {
    const items = await db.select().from(stockItemsTable).orderBy(asc(stockItemsTable.name));
    res.json({ data: items });
  } catch {
    res.status(500).json({ error: "Unable to load stock items." });
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
      .select()
      .from(stockMovementsTable)
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

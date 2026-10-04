import { Router } from "express";
import { db, deviceTypesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function normalizeCategory(value: unknown) {
  if (value === "tracking" || value === "camera") return value;
  return null;
}

router.get("/", async (req, res) => {
  const category = normalizeCategory(req.query.category);
  const rows = category
    ? await db.select().from(deviceTypesTable).where(eq(deviceTypesTable.category, category)).orderBy(deviceTypesTable.name)
    : await db.select().from(deviceTypesTable).orderBy(deviceTypesTable.category, deviceTypesTable.name);

  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })));
});

router.post("/", async (req, res) => {
  const category = normalizeCategory(req.body?.category);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!category) {
    return res.status(400).json({ error: "category must be either 'tracking' or 'camera'" });
  }

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const existing = await db
    .select()
    .from(deviceTypesTable)
    .where(and(eq(deviceTypesTable.category, category), eq(deviceTypesTable.name, name)))
    .limit(1);

  if (existing[0]) {
    return res.status(200).json({
      id: existing[0].id,
      name: existing[0].name,
      category: existing[0].category,
      createdAt: existing[0].createdAt.toISOString(),
      updatedAt: existing[0].updatedAt.toISOString(),
    });
  }

  const [created] = await db.insert(deviceTypesTable).values({ name, category }).returning();

  return res.status(201).json({
    id: created.id,
    name: created.name,
    category: created.category,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "valid device type id is required" });
  }

  const deleted = await db
    .delete(deviceTypesTable)
    .where(eq(deviceTypesTable.id, id))
    .returning({ id: deviceTypesTable.id });

  if (!deleted.length) {
    return res.status(404).json({ error: "device type not found" });
  }

  res.status(204).send();
});

export default router;

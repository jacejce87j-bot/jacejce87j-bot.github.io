import { Router } from "express";
import { db } from "@workspace/db";
import { tagsTable, ticketsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const tags = await db.select().from(tagsTable).orderBy(tagsTable.name);
  // Count tickets that have each tag
  const result = tags.map((t) => ({ id: t.id, name: t.name, color: t.color, ticketCount: 0 }));
  res.json(result);
});

export default router;

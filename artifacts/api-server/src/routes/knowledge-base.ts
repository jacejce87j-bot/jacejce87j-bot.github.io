import { Router, type Request } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { commentsTable, db, knowledgeBaseArticlesTable, ticketsTable } from "@workspace/db";

const router = Router();
const validStatuses = new Set(["draft", "published", "archived"]);

function parseArticleInput(body: Record<string, unknown>, allowStatus: boolean) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (Array.isArray(body.tags) && body.tags.some((tag) => typeof tag !== "string")) {
    throw new Error("Tags must be strings");
  }
  if (body.tags !== undefined && !Array.isArray(body.tags) && typeof body.tags !== "string") {
    throw new Error("Tags must be a list or comma-separated string");
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => tag.trim()).filter(Boolean)
    : typeof body.tags === "string"
      ? body.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      : [];
  const status = body.status === undefined ? "draft" : body.status;

  if (!title || title.length > 200) throw new Error("Title is required and must be 200 characters or fewer");
  if (!content || content.length > 50000) throw new Error("Content is required and must be 50,000 characters or fewer");
  if (summary.length > 500) throw new Error("Summary must be 500 characters or fewer");
  if (tags.some((tag) => tag.length > 50)) throw new Error("Tags must be 50 characters or fewer");
  if (allowStatus && (typeof status !== "string" || !validStatuses.has(status))) {
    throw new Error("Status must be draft, published, or archived");
  }

  return { title, summary, content, tags: [...new Set(tags)], ...(allowStatus ? { status: status as string } : {}) };
}

function getCreator(req: Request) {
  const user = req.user;
  return user?.email || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.id || null;
}

router.get("/", async (req, res) => {
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !validStatuses.has(status)) return res.status(400).json({ error: "Invalid article status" });

  const filters = [];
  if (status) filters.push(eq(knowledgeBaseArticlesTable.status, status));
  if (search) {
    const pattern = `%${search}%`;
    filters.push(or(
      ilike(knowledgeBaseArticlesTable.title, pattern),
      ilike(knowledgeBaseArticlesTable.summary, pattern),
      ilike(knowledgeBaseArticlesTable.content, pattern),
    )!);
  }
  const articles = await db.select().from(knowledgeBaseArticlesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(knowledgeBaseArticlesTable.updatedAt))
    .limit(100);
  res.json(articles);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid article id" });
  const [article] = await db.select().from(knowledgeBaseArticlesTable)
    .where(eq(knowledgeBaseArticlesTable.id, id)).limit(1);
  if (!article) return res.status(404).json({ error: "Knowledge base article not found" });
  res.json(article);
});

router.post("/", async (req, res) => {
  let input;
  try {
    input = parseArticleInput(req.body ?? {}, true);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid article" });
  }
  const [article] = await db.insert(knowledgeBaseArticlesTable)
    .values({ ...input, createdBy: getCreator(req) })
    .returning();
  res.status(201).json(article);
});

router.post("/from-ticket", async (req, res) => {
  const sourceTicketId = Number(req.body?.sourceTicketId);
  if (!Number.isSafeInteger(sourceTicketId) || sourceTicketId < 1) {
    return res.status(400).json({ error: "A valid sourceTicketId is required" });
  }
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, sourceTicketId)).limit(1);
  if (!ticket) return res.status(404).json({ error: "Source ticket not found" });

  const publicComments = await db.select({
    body: commentsTable.body,
    createdAt: commentsTable.createdAt,
  }).from(commentsTable)
    .where(and(eq(commentsTable.ticketId, ticket.id), eq(commentsTable.isPublic, true)))
    .orderBy(commentsTable.createdAt);
  const generatedContent = [
    ticket.description?.trim(),
    ...publicComments.map((comment) => comment.body.trim()).filter(Boolean),
  ].filter(Boolean).join("\n\n");

  let input;
  try {
    input = parseArticleInput({
      title: req.body?.title ?? ticket.subject,
      summary: req.body?.summary ?? "",
      content: req.body?.content ?? generatedContent,
      tags: req.body?.tags ?? ticket.tags,
      status: "draft",
    }, true);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid article" });
  }
  const [article] = await db.insert(knowledgeBaseArticlesTable)
    .values({ ...input, sourceTicketId: ticket.id, createdBy: getCreator(req) })
    .returning();
  res.status(201).json(article);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid article id" });
  let input;
  try {
    input = parseArticleInput(req.body ?? {}, true);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid article" });
  }
  const [article] = await db.update(knowledgeBaseArticlesTable)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(knowledgeBaseArticlesTable.id, id))
    .returning();
  if (!article) return res.status(404).json({ error: "Knowledge base article not found" });
  res.json(article);
});

export default router;

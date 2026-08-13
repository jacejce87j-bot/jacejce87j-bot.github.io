import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/users
// Returns a list of application users (minimal safe fields)
router.get("/users", async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.email);
    const out = users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      profileImageUrl: u.profileImageUrl,
      role: u.role,
      createdAt: u.createdAt?.toISOString?.() ?? null,
    }));
    res.json({ data: out });
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// PATCH /api/users/role
// Body: { email: string, role: 'end_user' | 'agent' | 'admin' }
router.patch('/users/role', async (req, res) => {
  try {
    const { email, role } = req.body ?? {};
    if (!email || !role) return res.status(400).json({ error: 'Missing email or role' });

    const normalized = String(email).trim().toLowerCase();
    const allowed = ['end_user', 'agent', 'admin'];
    if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const [updated] = await db
      .update(usersTable)
      .set({ role })
      .where(eq(usersTable.email, normalized))
      .returning();

    if (!updated) return res.status(404).json({ error: 'User not found' });

    res.json({ user: { id: updated.id, email: updated.email, role: updated.role } });
  } catch (err) {
    console.error('PATCH /api/users/role error:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});
export default router;

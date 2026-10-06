import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
  } catch (_err) {
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.post('/users', async (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const fullName = String(req.body?.fullName ?? '').trim();
    const role = String(req.body?.role ?? 'end_user').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!['end_user', 'agent', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [firstName = '', lastName = ''] = fullName.split(/\s+/, 2);
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        role,
        mustChangePassword: true,
      })
      .returning();

    res.status(201).json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(204).send();
  } catch (_err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.patch('/users/:id/password', async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!id) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [updated] = await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });

    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password updated' });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

router.patch('/users/role', async (req, res) => {
  try {
    const { email, role } = req.body ?? {};
    if (!email || !role) return res.status(400).json({ error: 'Missing email or role' });

    const normalized = String(email).trim().toLowerCase();
    const allowed = ['end_user', 'agent', 'admin'];
    const normalizedRole = String(role).trim().toLowerCase();
    if (!allowed.includes(normalizedRole)) return res.status(400).json({ error: 'Invalid role' });

    const [updated] = await db
      .update(usersTable)
      .set({ role: normalizedRole })
      .where(eq(usersTable.email, normalized))
      .returning();

    if (!updated) return res.status(404).json({ error: 'User not found' });

    res.json({ user: { id: updated.id, email: updated.email, role: updated.role } });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

export default router;

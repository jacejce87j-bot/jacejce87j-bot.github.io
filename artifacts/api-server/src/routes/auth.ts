import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { JWT_SECRET } from "../lib/jwt-secret";

const router: IRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * Internal login endpoint that validates user credentials and issues a JWT token.
 */
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid email or password format." });
      return;
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    if ("passwordHash" in user && typeof user.passwordHash === "string" && user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }
    }

    const safeRole = String(user.role ?? "admin").trim().toLowerCase();
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: safeRole,
      },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    const responseBody = {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: safeRole,
      },
    };
    res.json(responseBody);
  } catch (_err) {
    res.status(500).json({ error: "Internal server authentication error." });
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().optional(),
  role: z.enum(["end_user", "agent", "admin"]).optional(),
});

router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid registration payload." });
    }

    const { email, password, fullName, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
    if (existing) {
      return res.status(400).json({ error: "User already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [firstName = "", lastName = ""] = (fullName || "").trim().split(/\s+/, 2);
    const desiredRole = (role as any) ?? "admin";

    const [user] = await db
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        firstName: firstName || null,
        lastName: lastName || null,
        passwordHash,
        role: desiredRole,
      })
      .returning();

    const safeRole = String(user.role ?? "admin").trim().toLowerCase();
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: safeRole,
      },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: safeRole,
      },
    });
  } catch (_err) {
    res.status(500).json({ error: "Internal server registration error." });
  }
});

router.get("/auth/user", (req: Request, res: Response) => {
  const isAuthenticated = req.isAuthenticated?.();
  const responseBody = {
    user: isAuthenticated ? req.user : null,
  } as any;

  if (responseBody.user) {
    responseBody.user.role = String(responseBody.user.role ?? "agent").trim().toLowerCase();
    if (responseBody.user.role === "end_user") {
      responseBody.user.role = "agent";
    } else if (!["agent", "admin", "supervisor"].includes(responseBody.user.role)) {
      responseBody.user.role = "agent";
    }
  }

  try {
    const parsed = GetCurrentAuthUserResponse.parse(responseBody);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: "Internal error: " + err.message });
  }
});

export default router;

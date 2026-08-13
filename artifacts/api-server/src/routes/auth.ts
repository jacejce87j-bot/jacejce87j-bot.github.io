import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";

const router: IRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || "internal-whiteboard-secret-key";

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
      console.error("Login validation failed:", parseResult.error);
      res.status(400).json({ error: "Invalid email or password format." });
      return;
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();
    console.log("Login attempt for:", normalizedEmail);

    // 1. Fetch user from database
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (!user) {
      console.log("User not found:", normalizedEmail);
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    console.log("User found, checking password:", user.email, "Has hash:", !!user.passwordHash);

    // 2. Verify password hash if present on DB record
    if ("passwordHash" in user && typeof user.passwordHash === "string" && user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      console.log("Password valid:", isValid);
      if (!isValid) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }
    }

    // 3. Issue internal JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role ?? "admin",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const responseBody = {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role ?? "admin",
      },
    };
    console.log("Sending login response:", JSON.stringify(responseBody));
    res.json(responseBody);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server authentication error." });
  }
});

// POST /api/auth/register
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
      console.error("Register validation failed:", parsed.error);
      return res.status(400).json({ error: "Invalid registration payload." });
    }

    const { email, password, fullName, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check existing
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
    if (existing) {
      return res.status(400).json({ error: "User already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [firstName = "", lastName = ""] = (fullName || "").trim().split(/\s+/, 2);

    // Allow creating users with explicit role; default to 'admin' when not provided
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

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role ?? "admin",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role ?? "admin",
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server registration error." });
  }
});

/**
 * GET /api/auth/user
 * Exposes current session state evaluated by authMiddleware.
 */
router.get("/auth/user", (req: Request, res: Response) => {
  console.log("===== GET /api/auth/user called =====");
  console.log("Authorization header:", req.headers.authorization);
  console.log("req.isAuthenticated:", req.isAuthenticated?.());
  console.log("req.user:", req.user);
  
  const isAuthenticated = req.isAuthenticated?.();
  const responseBody = {
    user: isAuthenticated ? req.user : null,
  } as any;

  // Normalize role to match API schema enum ['agent','admin','supervisor']
  if (responseBody.user) {
    if (responseBody.user.role === "end_user") {
      // Treat end-users as 'agent' for the application auth shape so UI validation passes
      responseBody.user.role = "agent";
    } else if (!["agent", "admin", "supervisor"].includes(responseBody.user.role)) {
      responseBody.user.role = "agent";
    }
  }
  
  console.log("Sending auth/user response:", JSON.stringify(responseBody));
  
  try {
    const parsed = GetCurrentAuthUserResponse.parse(responseBody);
    console.log("Response passed validation, sending:", JSON.stringify(parsed));
    res.json(parsed);
  } catch (err: any) {
    console.error("Error parsing response:", err.message);
    res.status(500).json({ error: "Internal error: " + err.message });
  }
});

export default router;
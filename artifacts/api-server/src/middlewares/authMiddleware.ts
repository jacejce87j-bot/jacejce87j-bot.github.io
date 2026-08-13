import type { AuthUser } from "@workspace/api-zod";
import { agentsTable, db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User;
    }

    interface AuthedRequest {
      user: User;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "internal-whiteboard-secret-key";

interface JWTPayload {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string;
}

/**
 * In-house authentication middleware.
 * Verifies standard 'Authorization: Bearer <token>' headers
 * and syncs identity state to the local DB user & agent tables.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const authHeader = req.headers.authorization;
  console.log(`[authMiddleware] ${req.method} ${req.url} - Authorization header: ${authHeader ? "present" : "missing"}`);
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[authMiddleware] No Bearer token found, skipping auth");
    next();
    return;
  }

  const token = authHeader.split(" ")[1];
  console.log("[authMiddleware] Token found, verifying...");

  try {
    // 1. Verify standard internal JWT
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    console.log("[authMiddleware] Token verified:", decoded);

    if (!decoded || !decoded.id) {
      console.log("[authMiddleware] Invalid token payload");
      next();
      return;
    }

    const identity = {
      id: decoded.id,
      email: decoded.email ? decoded.email.trim().toLowerCase() : null,
      firstName: decoded.firstName ?? null,
      lastName: decoded.lastName ?? null,
      profileImageUrl: decoded.profileImageUrl ?? null,
    };

    console.log("[authMiddleware] Upserting user:", identity.email);

    // 2. Upsert local SupportDesk user row
    const [dbUser] = await db
      .insert(usersTable)
      .values({ ...identity, role: (decoded.role as any) ?? "admin" })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          profileImageUrl: identity.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    console.log("[authMiddleware] User upserted:", dbUser.email);

    // 3. Attach user context to Request
    // Normalize role to the API enum ['agent','admin','supervisor']
    const VALID_ROLES = ["agent", "admin", "supervisor"] as const;
    let normalizedRole = (dbUser.role ?? "admin") as string;
    if (!VALID_ROLES.includes(normalizedRole as any)) {
      normalizedRole = "admin";
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: normalizedRole as AuthUser["role"],
    };

    console.log("[authMiddleware] User attached to request:", req.user.email);

    // 4. Update online agent status
    if (identity.email) {
      await db
        .update(agentsTable)
        .set({ isOnline: true })
        .where(eq(agentsTable.email, identity.email));
    }
  } catch (err) {
    console.error("[authMiddleware] Error verifying token:", err);
    // If token is invalid or expired, proceed unauthenticated (user = undefined)
  }

  next();
}
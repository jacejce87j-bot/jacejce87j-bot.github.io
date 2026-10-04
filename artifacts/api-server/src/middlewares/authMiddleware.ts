import type { AuthUser } from "@workspace/api-zod";
import { agentsTable, db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/jwt-secret";

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

function normalizeRole(value: unknown): string {
  return String(value ?? "admin").trim().toLowerCase();
}

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
  const queryToken = typeof req.query?.token === "string" ? req.query.token :
    typeof req.query?.auth_token === "string" ? req.query.auth_token :
    typeof req.query?.authToken === "string" ? req.query.authToken : null;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const token = bearerToken || queryToken;

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    if (!decoded || !decoded.id) {
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

    const safeRole = normalizeRole(decoded.role ?? "admin");
    const [dbUser] = await db
      .insert(usersTable)
      .values({ ...identity, role: safeRole })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          profileImageUrl: identity.profileImageUrl,
          role: safeRole,
          updatedAt: new Date(),
        },
      })
      .returning();

    const VALID_ROLES = ["agent", "admin", "supervisor"] as const;
    let normalizedRole = normalizeRole(dbUser.role ?? safeRole);
    if (!VALID_ROLES.includes(normalizedRole as any)) {
      normalizedRole = ["agent", "admin", "supervisor"].includes(safeRole) ? safeRole : "admin";
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: normalizedRole as AuthUser["role"],
    };

    if (identity.email) {
      await db
        .update(agentsTable)
        .set({ isOnline: true })
        .where(eq(agentsTable.email, identity.email));
    }
  } catch (_err) {
    // If token is invalid or expired, proceed unauthenticated (user = undefined)
  }

  next();
}

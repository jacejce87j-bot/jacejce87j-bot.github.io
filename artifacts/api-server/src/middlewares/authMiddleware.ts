import { clerkClient, getAuth } from "@clerk/express";
import type { AuthUser } from "@workspace/api-zod";
import { agentsTable, db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type NextFunction, type Request, type Response } from "express";

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

function stringClaim(
  claims: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    if (typeof claims[key] === "string" && claims[key]) return claims[key] as string;
  }
  return null;
}

async function resolveEmail(
  userId: string,
  claims: Record<string, unknown>,
): Promise<string | null> {
  const claimEmail = stringClaim(
    claims,
    "email",
    "emailAddress",
    "email_address",
  );
  if (claimEmail) return claimEmail.trim().toLowerCase();

  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    return clerkUser.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Clerk owns the browser session. This middleware bridges an authenticated
 * Clerk identity to the local SupportDesk user row that stores app roles.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const auth = getAuth(req);
  if (!auth.userId) {
    next();
    return;
  }

  const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
  const identity = {
    id: auth.userId,
    email: await resolveEmail(auth.userId, claims),
    firstName: stringClaim(claims, "firstName", "first_name"),
    lastName: stringClaim(claims, "lastName", "last_name"),
    profileImageUrl: stringClaim(claims, "imageUrl", "picture", "profile_image_url"),
  };

  const [dbUser] = await db
    .insert(usersTable)
    .values({ ...identity, role: "admin" })
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

  req.user = {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    profileImageUrl: dbUser.profileImageUrl,
    role: (dbUser.role ?? "admin") as AuthUser["role"],
  };

  if (identity.email) {
    await db
      .update(agentsTable)
      .set({ isOnline: true })
      .where(eq(agentsTable.email, identity.email));
  }

  next();
}
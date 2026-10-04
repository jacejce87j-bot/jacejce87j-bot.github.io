const configuredJwtSecret = process.env.JWT_SECRET;

if (process.env.NODE_ENV === "production" && (!configuredJwtSecret || configuredJwtSecret.length < 32)) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production.");
}

export const JWT_SECRET = configuredJwtSecret || "internal-whiteboard-secret-key";

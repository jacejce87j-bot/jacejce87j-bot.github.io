import type { NextFunction, Request, Response } from "express";

/**
 * Protects the SupportDesk workspace API with the session loaded by
 * authMiddleware. Authentication endpoints and public health/storage asset
 * routes are mounted separately before this middleware.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}
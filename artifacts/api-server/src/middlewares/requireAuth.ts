import type { NextFunction, Request, Response } from "express";

/** Protects the SupportDesk API after Clerk has loaded the local user. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}
import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Bypass auth check during local development
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}

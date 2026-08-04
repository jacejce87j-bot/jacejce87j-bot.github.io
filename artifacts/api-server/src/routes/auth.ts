import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// Clerk owns sign-in, sign-up, and logout. This endpoint only exposes the
// local SupportDesk role and identity after Clerk middleware has run.
router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated?.() ? req.user : null,
    }),
  );
});

export default router;
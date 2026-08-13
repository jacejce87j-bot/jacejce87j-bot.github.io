import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ticketsRouter from "./tickets";
import contactsRouter from "./contacts";
import organizationsRouter from "./organizations";
import agentsRouter from "./agents";
import tagsRouter from "./tags";
import dashboardRouter from "./dashboard";
import authRouter from "./auth";
import usersRouter from "./users";
import storageRouter from "./storage";
import settingsRouter from "./settings";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(storageRouter);
router.use(requireAuth);
router.use("/tickets", ticketsRouter);
router.use("/contacts", contactsRouter);
router.use("/organizations", organizationsRouter);
router.use("/agents", agentsRouter);
router.use("/tags", tagsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/settings", settingsRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ticketsRouter from "./tickets";
import contactsRouter from "./contacts";
import organizationsRouter from "./organizations";
import agentsRouter from "./agents";
import tagsRouter from "./tags";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tickets", ticketsRouter);
router.use("/contacts", contactsRouter);
router.use("/organizations", organizationsRouter);
router.use("/agents", agentsRouter);
router.use("/tags", tagsRouter);
router.use("/dashboard", dashboardRouter);

export default router;

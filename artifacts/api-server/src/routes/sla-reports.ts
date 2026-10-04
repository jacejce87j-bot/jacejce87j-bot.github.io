import { Router } from "express";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  activityEventsTable,
  agentsTable,
  db,
  organizationsTable,
  slaPoliciesTable,
  ticketsTable,
} from "@workspace/db";
import { getBusinessMinutesBetween, getDefaultBusinessHoursSchedule } from "../lib/business-hours";

const router = Router();

async function minutesBetween(start: Date, end: Date, organizationId?: number | null) {
  const schedule = await getDefaultBusinessHoursSchedule(organizationId ?? undefined);
  return getBusinessMinutesBetween(start, end, schedule);
}

router.get("/sla", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return res.status(400).json({ error: "Invalid from or to date" });
  }

  const ticketConditions = [];
  if (from) ticketConditions.push(gte(ticketsTable.createdAt, from));
  if (to) ticketConditions.push(lte(ticketsTable.createdAt, to));

  const [tickets, policies, agents, organizations] = await Promise.all([
    db.select().from(ticketsTable).where(ticketConditions.length ? and(...ticketConditions) : undefined),
    db.select().from(slaPoliciesTable).where(eq(slaPoliciesTable.isActive, true)),
    db.select().from(agentsTable),
    db.select().from(organizationsTable),
  ]);
  const ticketIds = tickets.map((ticket) => ticket.id);
  const events = ticketIds.length
    ? await db.select().from(activityEventsTable)
      .where(inArray(activityEventsTable.ticketId, ticketIds))
      .orderBy(asc(activityEventsTable.createdAt))
    : [];

  const policyByPriority = new Map(policies.map((policy) => [policy.priority.toLowerCase(), policy]));
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const eventsByTicket = new Map<number, typeof events>();
  for (const event of events) {
    const current = eventsByTicket.get(event.ticketId) ?? [];
    current.push(event);
    eventsByTicket.set(event.ticketId, current);
  }

  type Metric = {
    id: number | null;
    name: string;
    tickets: number;
    solved: number;
    firstResponseMeasured: number;
    firstResponseWithinSla: number;
    resolutionMeasured: number;
    resolutionWithinSla: number;
    resolutionBreaches: number;
    firstResponseBreaches: number;
    assignmentBreaches: number;
    assignmentIntervals: number;
    completedAssignments: number;
    totalAssignmentMinutes: number;
    totalAssignedToSolvedMinutes: number;
    assignedToSolvedCount: number;
    totalResolutionMinutes: number;
  };
  const createMetric = (id: number | null, name: string): Metric => ({
    id, name, tickets: 0, solved: 0, firstResponseMeasured: 0, firstResponseWithinSla: 0,
    resolutionMeasured: 0, resolutionWithinSla: 0, resolutionBreaches: 0, firstResponseBreaches: 0, assignmentBreaches: 0,
    assignmentIntervals: 0, completedAssignments: 0,     totalAssignmentMinutes: 0, totalAssignedToSolvedMinutes: 0, assignedToSolvedCount: 0, totalResolutionMinutes: 0,
  });
  const orgMetrics = new Map<number | null, Metric>();
  const agentMetrics = new Map<number, Metric>();

  for (const ticket of tickets) {
    const schedule = await getDefaultBusinessHoursSchedule(ticket.organizationId ?? undefined);
    const policy = policyByPriority.get(ticket.priority.toLowerCase());
    const resolvedAt = ticket.resolvedAt;
    const resolutionEnd = resolvedAt ?? new Date();
    const organization = ticket.organizationId ? organizationById.get(ticket.organizationId) : null;
    const orgKey = ticket.organizationId ?? null;
    if (!orgMetrics.has(orgKey)) orgMetrics.set(orgKey, createMetric(orgKey, organization?.name ?? "Unassigned organization"));
    const orgMetric = orgMetrics.get(orgKey)!;
    orgMetric.tickets++;

    if (ticket.firstResponseAt && policy) {
      const firstResponseMinutes = getBusinessMinutesBetween(ticket.createdAt, ticket.firstResponseAt, schedule);
      orgMetric.firstResponseMeasured++;
      if (firstResponseMinutes <= policy.firstResponseMinutes) orgMetric.firstResponseWithinSla++;
      else orgMetric.firstResponseBreaches++;
    }
    if (resolvedAt && policy) {
      const resolutionMinutes = getBusinessMinutesBetween(ticket.createdAt, resolvedAt, schedule);
      orgMetric.solved++;
      orgMetric.resolutionMeasured++;
      orgMetric.totalResolutionMinutes += resolutionMinutes;
      if (resolutionMinutes <= policy.resolutionMinutes) orgMetric.resolutionWithinSla++;
      else orgMetric.resolutionBreaches++;
    }

    const ticketEvents = eventsByTicket.get(ticket.id) ?? [];
    const assignments = ticketEvents
      .filter((event) => event.type === "ticket_created" || event.type === "assignment_changed")
      .filter((event) => event.agentId !== null)
      .map((event) => ({ agentId: event.agentId!, start: event.createdAt }));
    if (!assignments.length && ticket.assigneeId) assignments.push({ agentId: ticket.assigneeId, start: ticket.createdAt });

    const firstAssignment = assignments[0]?.start;
    if (firstAssignment && firstAssignment > ticket.createdAt) {
      const assignmentMinutes = getBusinessMinutesBetween(ticket.createdAt, firstAssignment, schedule);
      orgMetric.assignmentIntervals++;
      orgMetric.totalAssignmentMinutes += assignmentMinutes;
      if (policy && assignmentMinutes > policy.firstResponseMinutes) orgMetric.assignmentBreaches++;
    } else if (!assignments.length) {
      const assignmentMinutes = getBusinessMinutesBetween(ticket.createdAt, resolutionEnd, schedule);
      orgMetric.assignmentIntervals++;
      orgMetric.totalAssignmentMinutes += assignmentMinutes;
      if (policy && assignmentMinutes > policy.firstResponseMinutes) orgMetric.assignmentBreaches++;
    }

    assignments.forEach((assignment, index) => {
      const nextAssignment = assignments[index + 1];
      const end = nextAssignment?.start ?? resolutionEnd;
      const metric = agentMetrics.get(assignment.agentId)
        ?? createMetric(
          assignment.agentId,
          agentById.get(assignment.agentId)
            ? `${agentById.get(assignment.agentId)!.name} (${agentById.get(assignment.agentId)!.email})`
            : `Agent ${assignment.agentId}`,
        );
      agentMetrics.set(assignment.agentId, metric);
      metric.tickets++;
      metric.assignmentIntervals++;
      const assignmentWindowMinutes = getBusinessMinutesBetween(assignment.start, end, schedule);
      metric.totalAssignmentMinutes += assignmentWindowMinutes;
      if (policy && assignmentWindowMinutes > policy.resolutionMinutes) metric.assignmentBreaches++;
      if (resolvedAt && !nextAssignment) {
        const solvedMinutes = getBusinessMinutesBetween(assignment.start, resolvedAt, schedule);
        orgMetric.completedAssignments++;
        orgMetric.assignedToSolvedCount++;
        orgMetric.totalAssignedToSolvedMinutes += solvedMinutes;
        metric.solved++;
        metric.completedAssignments++;
        metric.totalAssignedToSolvedMinutes += solvedMinutes;
        metric.assignedToSolvedCount++;
        if (policy) {
          metric.resolutionMeasured++;
          const resolutionMinutes = getBusinessMinutesBetween(ticket.createdAt, resolvedAt, schedule);
          metric.totalResolutionMinutes += resolutionMinutes;
          if (resolutionMinutes <= policy.resolutionMinutes) metric.resolutionWithinSla++;
          else metric.resolutionBreaches++;
        }
      }
      if (ticket.firstResponseAt && policy && ticket.firstResponseAt >= assignment.start && ticket.firstResponseAt <= end) {
        metric.firstResponseMeasured++;
        const firstResponseMinutes = getBusinessMinutesBetween(ticket.createdAt, ticket.firstResponseAt, schedule);
        if (firstResponseMinutes <= policy.firstResponseMinutes) metric.firstResponseWithinSla++;
        else metric.firstResponseBreaches++;
      }
    });
  }

  const serialize = (metric: Metric) => ({
    ...metric,
    firstResponseCompliance: metric.firstResponseMeasured ? Math.round(metric.firstResponseWithinSla / metric.firstResponseMeasured * 100) : null,
    resolutionCompliance: metric.resolutionMeasured ? Math.round(metric.resolutionWithinSla / metric.resolutionMeasured * 100) : null,
    breachReasons: {
      firstResponse: metric.firstResponseBreaches,
      resolution: metric.resolutionBreaches,
      assignment: metric.assignmentBreaches,
    },
    averageAssignmentMinutes: metric.assignmentIntervals ? Math.round(metric.totalAssignmentMinutes / metric.assignmentIntervals) : null,
    averageAssignedToSolvedMinutes: metric.assignedToSolvedCount ? Math.round(metric.totalAssignedToSolvedMinutes / metric.assignedToSolvedCount) : null,
    averageResolutionMinutes: metric.resolutionMeasured ? Math.round(metric.totalResolutionMinutes / metric.resolutionMeasured) : null,
  });

  res.json({
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    tickets: tickets.length,
    organizations: [...orgMetrics.values()].map(serialize).sort((a, b) => b.tickets - a.tickets),
    agents: [...agentMetrics.values()].map(serialize).sort((a, b) => b.tickets - a.tickets),
  });
});

export default router;

import { db } from "@workspace/db";
import { ticketsTable, agentsTable, commentsTable, activityEventsTable } from "@workspace/db";
import { sql, and, eq, asc } from "drizzle-orm";
import { getBusinessMinutesBetween, getDefaultBusinessHoursSchedule } from "./business-hours";
import { broadcast } from "./ws-manager";
import { logger } from "./logger";

const WARNING_MINUTES = 30;
const ASSIGNMENT_BREACH_MINUTES = 60;
// Track tickets already warned so we don't spam on every tick
const warnedTickets = new Set<number>();
const breachedTickets = new Set<number>();

async function findLeastLoadedOnlineAgent(excludedAgentIds: number[] = []) {
  const rows = await db
    .select({
      id: agentsTable.id,
      name: agentsTable.name,
      isOnline: agentsTable.isOnline,
    })
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.isOnline, true),
        excludedAgentIds.length ? sql`${agentsTable.id} NOT IN (${excludedAgentIds})` : sql`TRUE`,
      ),
    )
    .orderBy(asc(agentsTable.name));

  const candidates = await Promise.all(
    rows.map(async (agent) => {
      const [loadRow] = await db
        .select({ cnt: sql<number>`COUNT(*)::int` })
        .from(ticketsTable)
        .where(and(eq(ticketsTable.assigneeId, agent.id), sql`${ticketsTable.status} NOT IN ('solved','closed')`));

      return {
        ...agent,
        openTicketCount: Number(loadRow?.cnt ?? 0),
      };
    }),
  );

  candidates.sort((a, b) => a.openTicketCount - b.openTicketCount || a.name.localeCompare(b.name));
  return candidates[0] ?? null;
}

export async function runAssignmentBreachEscalation(): Promise<{ checked: number; escalated: number; skipped: number }> {
  const eligibleTickets = await db
    .select({
      id: ticketsTable.id,
      subject: ticketsTable.subject,
      tags: ticketsTable.tags,
      createdAt: ticketsTable.createdAt,
    })
    .from(ticketsTable)
    .where(
      and(
        sql`${ticketsTable.assigneeId} IS NULL`,
        sql`${ticketsTable.status} NOT IN ('solved','closed')`,
      ),
    );

  const defaultSchedule = await getDefaultBusinessHoursSchedule();
  let escalated = 0;
  let skipped = 0;

  for (const ticket of eligibleTickets) {
    const businessMinutes = getBusinessMinutesBetween(ticket.createdAt, new Date(), defaultSchedule);
    if (businessMinutes < ASSIGNMENT_BREACH_MINUTES) {
      continue;
    }

    const leastLoadedAgent = await findLeastLoadedOnlineAgent();

    if (!leastLoadedAgent) {
      skipped += 1;
      await db.insert(activityEventsTable).values({
        type: "sla_assignment_breach",
        description: `Assignment breach ${ASSIGNMENT_BREACH_MINUTES}m: ticket "${ticket.subject}" could not be reassigned because no online agents were available`,
        ticketId: ticket.id,
        agentId: null,
      }).catch(() => undefined);
      continue;
    }

    const nextTags = Array.from(new Set([...(ticket.tags ?? []), "escalated"]));
    const [updatedTicket] = await db
      .update(ticketsTable)
      .set({ assigneeId: leastLoadedAgent.id, tags: nextTags, updatedAt: new Date() })
      .where(eq(ticketsTable.id, ticket.id))
      .returning();

    if (!updatedTicket) {
      skipped += 1;
      continue;
    }

    await db.insert(commentsTable).values({
      ticketId: ticket.id,
      body: `SLA AUTO-ESCALATION: Assignment breach exceeded ${ASSIGNMENT_BREACH_MINUTES} minutes. Reassigned to "${leastLoadedAgent.name}" due to least-loaded online routing.`,
      isPublic: false,
      authorId: null,
      attachments: [],
    });

    await db.insert(activityEventsTable).values({
      type: "sla_assignment_breach",
      description: `Assignment breach ${ASSIGNMENT_BREACH_MINUTES}m: auto-escalated to "${leastLoadedAgent.name}" (${leastLoadedAgent.openTicketCount ?? 0} open tickets)`,
      ticketId: ticket.id,
      agentId: leastLoadedAgent.id,
    });

    escalated += 1;
    broadcast({
      type: "ticket:sla_breach",
      ticketId: ticket.id,
      subject: ticket.subject,
      priority: "normal",
      minutesOverdue: ASSIGNMENT_BREACH_MINUTES,
    });
  }

  return { checked: eligibleTickets.length, escalated, skipped };
}

export async function checkSlaBreaches(): Promise<void> {
  try {
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + WARNING_MINUTES * 60 * 1000);
    await runAssignmentBreachEscalation();

    // Tickets that are overdue (due_at < now) and not closed/solved
    const overdueTickets = await db
      .select({
        id: ticketsTable.id,
        subject: ticketsTable.subject,
        priority: ticketsTable.priority,
        dueAt: ticketsTable.dueAt,
      })
      .from(ticketsTable)
      .where(
        sql`${ticketsTable.dueAt} IS NOT NULL
          AND ${ticketsTable.dueAt} < NOW()
          AND ${ticketsTable.status} NOT IN ('solved', 'closed')`,
      );

    for (const ticket of overdueTickets) {
      if (breachedTickets.has(ticket.id)) continue;
      breachedTickets.add(ticket.id);
      warnedTickets.delete(ticket.id); // escalated past warning

      const minutesOverdue = Math.round(
        (now.getTime() - (ticket.dueAt as Date).getTime()) / 60000,
      );
      broadcast({
        type: "ticket:sla_breach",
        ticketId: ticket.id,
        subject: ticket.subject,
        priority: ticket.priority,
        minutesOverdue,
      });
    }

    // Tickets approaching SLA (due_at between now and now+30min)
    const warningTickets = await db
      .select({
        id: ticketsTable.id,
        subject: ticketsTable.subject,
        priority: ticketsTable.priority,
        dueAt: ticketsTable.dueAt,
      })
      .from(ticketsTable)
      .where(
        sql`${ticketsTable.dueAt} IS NOT NULL
          AND ${ticketsTable.dueAt} BETWEEN NOW() AND ${warningCutoff.toISOString()}
          AND ${ticketsTable.status} NOT IN ('solved', 'closed')`,
      );

    for (const ticket of warningTickets) {
      if (warnedTickets.has(ticket.id) || breachedTickets.has(ticket.id)) continue;
      warnedTickets.add(ticket.id);

      const minutesUntilBreach = Math.round(
        ((ticket.dueAt as Date).getTime() - now.getTime()) / 60000,
      );
      broadcast({
        type: "ticket:sla_warning",
        ticketId: ticket.id,
        subject: ticket.subject,
        priority: ticket.priority,
        minutesUntilBreach,
      });
    }
  } catch (err) {
    logger.error({ err }, "SLA checker error");
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startSlaChecker(intervalMs = 60_000): void {
  if (intervalHandle) return;
  // Run once immediately, then on interval
  checkSlaBreaches();
  intervalHandle = setInterval(checkSlaBreaches, intervalMs);
  logger.info({ intervalMs }, "SLA checker started");
}

export function stopSlaChecker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

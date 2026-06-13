import { db } from "@workspace/db";
import { ticketsTable } from "@workspace/db";
import { sql, and, notInArray } from "drizzle-orm";
import { broadcast } from "./ws-manager";
import { logger } from "./logger";

const WARNING_MINUTES = 30;
// Track tickets already warned so we don't spam on every tick
const warnedTickets = new Set<number>();
const breachedTickets = new Set<number>();

export async function checkSlaBreaches(): Promise<void> {
  try {
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + WARNING_MINUTES * 60 * 1000);

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

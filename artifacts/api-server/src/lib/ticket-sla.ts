import {
  getBusinessMinutesBetween,
  getBusinessMinutesBetweenExcludingIntervals,
  type BusinessHoursSchedule,
} from "./business-hours";

type SlaTicket = {
  createdAt: Date;
  resolvedAt: Date | null;
  status: string;
  priority: string;
  assigneeId: number | null;
};

type SlaComment = {
  isPublic: boolean;
  authorId: number | null;
  createdAt: Date;
};

type SlaEvent = {
  type: string;
  description: string;
  agentId: number | null;
  createdAt: Date;
};

type SlaPolicy = {
  priority: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
};

function ticketStatusIsPaused(status: string) {
  return status === "pending" || status === "on_hold";
}

function getSlaCycleStart(events: SlaEvent[], end: Date, createdAt: Date) {
  let cycleStart = createdAt;
  const resolvedStatuses = new Set(["solved", "closed"]);
  const statusEvents = events
    .filter((event) => event.type === "status_changed" && event.createdAt <= end)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const event of statusEvents) {
    const match = event.description.match(/Status changed from ([\w-]+) to ([\w-]+)/i);
    if (!match) continue;
    const previousStatus = match[1].toLowerCase();
    const nextStatus = match[2].toLowerCase();
    if (resolvedStatuses.has(previousStatus) && !resolvedStatuses.has(nextStatus)) {
      cycleStart = event.createdAt;
    }
  }
  return cycleStart;
}

function getPausedIntervals(events: SlaEvent[], end: Date, createdAt: Date, currentStatus: string) {
  const intervals: Array<{ start: Date; end: Date }> = [];
  let pauseStart: Date | null = null;
  const statusEvents = events
    .filter((event) => event.type === "status_changed" && event.createdAt < end)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (!statusEvents.length && ticketStatusIsPaused(currentStatus)) {
    return [{ start: createdAt, end }];
  }

  for (const event of statusEvents) {
    const match = event.description.match(/Status changed from ([\w-]+) to ([\w-]+)/i);
    if (!match) continue;
    const previousStatus = match[1].toLowerCase();
    const nextStatus = match[2].toLowerCase();
    if (!pauseStart && ticketStatusIsPaused(previousStatus)) pauseStart = createdAt;
    const isPaused = nextStatus === "pending" || nextStatus === "on_hold";
    if (isPaused && !pauseStart) pauseStart = event.createdAt;
    else if (!isPaused && pauseStart) {
      intervals.push({ start: pauseStart, end: event.createdAt });
      pauseStart = null;
    }

  }
  if (pauseStart) intervals.push({ start: pauseStart, end });
  return intervals;
}

function getElapsedMinutes(
  start: Date,
  end: Date,
  schedule: BusinessHoursSchedule | null,
  pauses: Array<{ start: Date; end: Date }>,
) {
  if (schedule) return getBusinessMinutesBetweenExcludingIntervals(start, end, schedule, pauses);
  let elapsedMs = Math.max(0, end.getTime() - start.getTime());
  for (const pause of pauses) {
    const overlapStart = Math.max(start.getTime(), pause.start.getTime());
    const overlapEnd = Math.min(end.getTime(), pause.end.getTime());
    elapsedMs -= Math.max(0, overlapEnd - overlapStart);
  }
  return Math.max(0, Math.round(elapsedMs / 60_000));
}

export function evaluateTicketSla(
  ticket: SlaTicket,
  comments: SlaComment[],
  events: SlaEvent[],
  policy: SlaPolicy | undefined,
  schedule: BusinessHoursSchedule | null,
  now = new Date(),
) {
  const isCurrentlyResolved = ticket.status === "solved" || ticket.status === "closed";
  const end = isCurrentlyResolved ? ticket.resolvedAt ?? now : now;
  const cycleStart = getSlaCycleStart(events, end, ticket.createdAt);
  const publicAgentReplies = comments
    .filter((comment) => comment.isPublic && comment.authorId !== null && comment.createdAt >= cycleStart && comment.createdAt <= end)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const firstReply = publicAgentReplies[0];
  const responseEnd = firstReply?.createdAt ?? end;
  const responseElapsedMinutes = getElapsedMinutes(
    cycleStart,
    responseEnd,
    schedule,
    getPausedIntervals(events, responseEnd, cycleStart, ticket.status),
  );
  const resolutionElapsedMinutes = getElapsedMinutes(
    cycleStart,
    end,
    schedule,
    getPausedIntervals(events, end, cycleStart, ticket.status),
  );

  const assignmentEvents = events
    .filter((event) =>
      (event.type === "ticket_created" || event.type === "assignment_changed")
      && event.agentId !== null
      && event.createdAt >= cycleStart
      && event.createdAt <= end,
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const assignmentEnd = assignmentEvents[0]?.createdAt
    ?? (ticket.assigneeId === null ? end : cycleStart);
  const assignmentWaitMinutes = getElapsedMinutes(
    cycleStart,
    assignmentEnd,
    schedule,
    getPausedIntervals(events, assignmentEnd, cycleStart, ticket.status),
  );
  return {
    firstResponseMinutes: firstReply ? responseElapsedMinutes : null,
    firstResponseElapsedMinutes: responseElapsedMinutes,
    resolutionMinutes: ticket.resolvedAt ? resolutionElapsedMinutes : null,
    resolutionElapsedMinutes,
    assignmentWaitMinutes,
    firstResponseWithinSla: policy ? responseElapsedMinutes <= policy.firstResponseMinutes : null,
    resolutionWithinSla: policy ? resolutionElapsedMinutes <= policy.resolutionMinutes : null,
    assignmentWithinSla: policy ? assignmentWaitMinutes <= policy.firstResponseMinutes : null,
    paused: !isCurrentlyResolved && (ticket.status === "pending" || ticket.status === "on_hold"),
  };
}

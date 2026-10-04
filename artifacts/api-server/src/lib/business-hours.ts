import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type BusinessHoursSchedule = {
  id: number;
  name: string;
  timezone: string;
  organizationId: number | null;
  isDefault: boolean;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startTime: string;
  endTime: string;
  holidayDates: string[];
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function getDateParts(date: Date, timezone: string) {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    dateFormatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTime(value: string) {
  const [rawHour, rawMinute] = String(value ?? "09:00").split(":");
  const hour = Number(rawHour ?? 9);
  const minute = Number(rawMinute ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 9 * 60;
  return hour * 60 + minute;
}

function zonedTimeToDate(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getDateParts(new Date(timestamp), timezone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const difference = target - represented;
    if (!difference) break;
    timestamp += difference;
  }
  return new Date(timestamp);
}

function getBusinessWindowForDay(year: number, month: number, day: number, schedule: BusinessHoursSchedule) {
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dayKey = DAY_KEYS[dayOfWeek];
  const isBusinessDay = Boolean(schedule[dayKey]);
  if (!isBusinessDay || schedule.holidayDates.includes(toDateKey(year, month, day))) {
    return null;
  }

  const startMinutes = parseTime(schedule.startTime);
  const endMinutes = parseTime(schedule.endTime);
  if (endMinutes <= startMinutes) {
    return null;
  }

  const start = zonedTimeToDate(year, month, day, Math.floor(startMinutes / 60), startMinutes % 60, schedule.timezone);
  const end = zonedTimeToDate(year, month, day, Math.floor(endMinutes / 60), endMinutes % 60, schedule.timezone);
  return { start, end };
}

export async function getDefaultBusinessHoursSchedule(organizationId?: number | null): Promise<BusinessHoursSchedule | null> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS sla_business_hours (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Default business hours',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    organization_id INTEGER NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    monday BOOLEAN NOT NULL DEFAULT TRUE,
    tuesday BOOLEAN NOT NULL DEFAULT TRUE,
    wednesday BOOLEAN NOT NULL DEFAULT TRUE,
    thursday BOOLEAN NOT NULL DEFAULT TRUE,
    friday BOOLEAN NOT NULL DEFAULT TRUE,
    saturday BOOLEAN NOT NULL DEFAULT FALSE,
    sunday BOOLEAN NOT NULL DEFAULT FALSE,
    start_time TEXT NOT NULL DEFAULT '09:00',
    end_time TEXT NOT NULL DEFAULT '17:00',
    holiday_dates TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const result = await db.execute(sql`SELECT * FROM sla_business_hours ORDER BY is_default DESC, created_at DESC`);
  const rows = Array.isArray((result as any).rows) ? (result as any).rows : [];
  const matched = rows.find((row: any) => organizationId && Number(row.organization_id) === Number(organizationId))
    ?? rows.find((row: any) => row.is_default)
    ?? rows[0] ?? null;

  if (!matched) return null;

  return {
    id: Number(matched.id),
    name: String(matched.name ?? "Default business hours"),
    timezone: String(matched.timezone ?? "UTC"),
    organizationId: matched.organization_id == null ? null : Number(matched.organization_id),
    isDefault: Boolean(matched.is_default),
    monday: Boolean(matched.monday),
    tuesday: Boolean(matched.tuesday),
    wednesday: Boolean(matched.wednesday),
    thursday: Boolean(matched.thursday),
    friday: Boolean(matched.friday),
    saturday: Boolean(matched.saturday),
    sunday: Boolean(matched.sunday),
    startTime: String(matched.start_time ?? "09:00"),
    endTime: String(matched.end_time ?? "17:00"),
    holidayDates: Array.isArray(matched.holiday_dates) ? matched.holiday_dates.map((value: unknown) => String(value)) : [],
  };
}

export function getBusinessMinutesBetween(start: Date, end: Date, schedule?: BusinessHoursSchedule | null): number {
  if (!schedule || end <= start) return 0;

  let totalMinutes = 0;
  const firstDay = getDateParts(start, schedule.timezone);
  const lastDay = getDateParts(end, schedule.timezone);
  let day = new Date(Date.UTC(firstDay.year, firstDay.month - 1, firstDay.day));
  const lastDayTimestamp = Date.UTC(lastDay.year, lastDay.month - 1, lastDay.day);

  while (day.getTime() <= lastDayTimestamp) {
    const dayWindow = getBusinessWindowForDay(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), schedule);
    if (dayWindow) {
      const intervalStart = new Date(Math.max(start.getTime(), dayWindow.start.getTime()));
      const intervalEnd = new Date(Math.min(end.getTime(), dayWindow.end.getTime()));
      if (intervalEnd > intervalStart) {
        totalMinutes += Math.max(0, Math.round((intervalEnd.getTime() - intervalStart.getTime()) / 60000));
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }

  return totalMinutes;
}

export function getBusinessMinutesBetweenExcludingIntervals(
  start: Date,
  end: Date,
  schedule: BusinessHoursSchedule | null | undefined,
  excludedIntervals: Array<{ start: Date; end: Date }>,
): number {
  if (end <= start) return 0;
  const intervals = excludedIntervals
    .map((interval) => ({
      start: new Date(Math.max(start.getTime(), interval.start.getTime())),
      end: new Date(Math.min(end.getTime(), interval.end.getTime())),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0;
  let cursor = start;
  for (const interval of intervals) {
    if (interval.start > cursor) total += getBusinessMinutesBetween(cursor, interval.start, schedule);
    if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor < end) total += getBusinessMinutesBetween(cursor, end, schedule);
  return total;
}

export function addBusinessMinutes(start: Date, minutes: number, schedule?: BusinessHoursSchedule | null): Date {
  if (!schedule || minutes <= 0) {
    return new Date(start.getTime() + minutes * 60_000);
  }

  let remaining = minutes;
  const cursor = new Date(start);

  while (remaining > 0) {
    const parts = getDateParts(cursor, schedule.timezone);
    const dayWindow = getBusinessWindowForDay(parts.year, parts.month, parts.day, schedule);
    if (!dayWindow) {
      const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
      cursor.setTime(zonedTimeToDate(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), 0, 0, schedule.timezone).getTime());
      continue;
    }

    const effectiveStart = new Date(Math.max(cursor.getTime(), dayWindow.start.getTime()));
    const windowAvailable = Math.max(0, Math.round((dayWindow.end.getTime() - effectiveStart.getTime()) / 60000));
    if (windowAvailable <= 0) {
      const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
      cursor.setTime(zonedTimeToDate(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), 0, 0, schedule.timezone).getTime());
      continue;
    }

    const chunk = Math.min(remaining, windowAvailable);
    cursor.setTime(effectiveStart.getTime() + chunk * 60_000);
    remaining -= chunk;

    if (remaining > 0) {
      const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
      cursor.setTime(zonedTimeToDate(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), 0, 0, schedule.timezone).getTime());
    }
  }

  return cursor;
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, isToday, isYesterday } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, "MMM d, yyyy");
  } catch (e) {
    return dateString;
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, "MMM d, yyyy h:mm a");
  } catch (e) {
    return dateString;
  }
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    if (isToday(date)) {
      return `Today at ${format(date, "h:mm a")}`;
    }
    if (isYesterday(date)) {
      return `Yesterday at ${format(date, "h:mm a")}`;
    }
    return format(date, "MMM d, h:mm a");
  } catch (e) {
    return dateString;
  }
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

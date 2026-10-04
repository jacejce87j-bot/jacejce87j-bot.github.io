import nodemailer from "nodemailer";
import { db, contactsTable } from "@workspace/db";
import { eq, ilike, or } from "drizzle-orm";
import { logger } from "./logger";

export const mentionPattern = /(?:^|\s)@([^\s]+)/g;

export function extractMentionHandles(text: string) {
  if (!text) return [];
  return [...new Set((text.match(mentionPattern) ?? []).map((part) => part.trim().replace(/^@/, "")).filter(Boolean))];
}

export async function resolveMentionedContacts(text: string) {
  const handles = extractMentionHandles(text);
  if (!handles.length) return [];

  const uniqueHandles = [...new Set(handles.map((handle) => handle.trim().toLowerCase()).filter(Boolean))];
  const conditionGroups = uniqueHandles.map((handle) => {
    const normalized = handle.trim().toLowerCase();
    if (normalized.includes("@")) {
      return eq(contactsTable.email, normalized);
    }
    return or(
      ilike(contactsTable.email, `${normalized}@%`),
      ilike(contactsTable.name, `${normalized}%`),
      ilike(contactsTable.name, `% ${normalized}%`),
    );
  });

  if (!conditionGroups.length) return [];

  const rows = await db.select().from(contactsTable).where(or(...conditionGroups));
  const seen = new Set<number>();
  return rows.filter((row) => {
    if (!row.email || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function notifyMentionedContacts({
  ticketId,
  ticketSubject,
  body,
  mentions,
  kind,
}: {
  ticketId: number;
  ticketSubject: string;
  body: string;
  mentions: Array<{ id: number; name: string; email: string | null }>;
  kind: "ticket" | "comment";
}) {
  const contacts = mentions.filter((contact) => !!contact.email);
  if (!contacts.length) return;

  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    logger.warn({ ticketId, kind, recipients: contacts.map((c) => c.email) }, "Skipping email mention notification because SMTP_HOST is not configured");
    return;
  }

  const appBaseUrl = process.env.APP_URL || "http://localhost:5173";
  const ticketUrl = `${appBaseUrl.replace(/\/$/, "")}/tickets/${ticketId}`;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE || "false").toLowerCase() === "true" || Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });

  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || "no-reply@supportdesk.local";
  const summary = body.trim().replace(/\s+/g, " ").slice(0, 220) || "No message preview available.";

  for (const contact of contacts) {
    const message = [
      `Hi ${contact.name || "there"},`,
      "",
      `You were mentioned in a ${kind === "ticket" ? "ticket" : "comment"} for "${ticketSubject}".`,
      "",
      `Ticket link: ${ticketUrl}`,
      "",
      `Message: ${summary}`,
      "",
      "Thanks,",
      "SupportDesk",
    ].join("\n");

    try {
      await transporter.sendMail({
        from: fromAddress,
        to: contact.email!,
        subject: `SupportDesk mention: ${ticketSubject}`,
        text: message,
      });
    } catch (error) {
      logger.warn({ err: error, ticketId, recipient: contact.email }, "Failed to deliver mention email");
    }
  }
}

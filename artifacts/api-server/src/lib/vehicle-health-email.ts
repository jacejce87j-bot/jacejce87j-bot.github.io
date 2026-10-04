import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  importVehicleHealthPdf,
  recordFailedVehicleHealthEmailImport,
  type EmailImportSource,
} from "../routes/health-reports";
import { logger } from "./logger";

type MailboxConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  fromFilter: string | null;
  subjectFilter: string | null;
  pollIntervalMs: number;
  lookbackDays: number;
  batchSize: number;
  maxMessageBytes: number;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInProgress = false;
const warnedMessages = new Set<string>();

function readConfig(): MailboxConfig | null {
  const host = process.env.VEHICLE_HEALTH_IMAP_HOST?.trim();
  const user = process.env.VEHICLE_HEALTH_IMAP_USER?.trim();
  const pass = process.env.VEHICLE_HEALTH_IMAP_PASS;

  if (!host && !user && !pass) return null;
  if (!host || !user || !pass) {
    logger.error(
      { requiredVariables: ["VEHICLE_HEALTH_IMAP_HOST", "VEHICLE_HEALTH_IMAP_USER", "VEHICLE_HEALTH_IMAP_PASS"] },
      "Vehicle health email import is disabled because mailbox configuration is incomplete",
    );
    return null;
  }

  const port = Number(process.env.VEHICLE_HEALTH_IMAP_PORT ?? 993);
  const pollIntervalMs = Number(process.env.VEHICLE_HEALTH_IMAP_POLL_INTERVAL_MS ?? 60_000);
  const lookbackDays = Number(process.env.VEHICLE_HEALTH_IMAP_LOOKBACK_DAYS ?? 30);
  const batchSize = Number(process.env.VEHICLE_HEALTH_IMAP_BATCH_SIZE ?? 10);
  const maxMessageBytes = Number(process.env.VEHICLE_HEALTH_IMAP_MAX_MESSAGE_BYTES ?? 15 * 1024 * 1024);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    logger.error({ port }, "Vehicle health email import is disabled because IMAP port is invalid");
    return null;
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 15_000) {
    logger.error({ pollIntervalMs }, "Vehicle health email import is disabled because polling interval must be at least 15000ms");
    return null;
  }
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 365) {
    logger.error({ lookbackDays }, "Vehicle health email import is disabled because lookback days must be from 1 to 365");
    return null;
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    logger.error({ batchSize }, "Vehicle health email import is disabled because batch size must be from 1 to 50");
    return null;
  }
  if (!Number.isInteger(maxMessageBytes) || maxMessageBytes < 1_048_576 || maxMessageBytes > 20 * 1024 * 1024) {
    logger.error({ maxMessageBytes }, "Vehicle health email import is disabled because maximum message size must be from 1 to 20 MiB");
    return null;
  }

  const fromFilter = process.env.VEHICLE_HEALTH_IMAP_FROM?.trim().toLowerCase() || null;
  const subjectFilter = process.env.VEHICLE_HEALTH_IMAP_SUBJECT?.trim().toLowerCase() || null;
  if (!fromFilter && !subjectFilter) {
    logger.error(
      { requiredVariables: ["VEHICLE_HEALTH_IMAP_FROM", "VEHICLE_HEALTH_IMAP_SUBJECT"] },
      "Vehicle health email import is disabled until a sender or subject filter is configured",
    );
    return null;
  }

  return {
    host,
    port,
    secure: (process.env.VEHICLE_HEALTH_IMAP_SECURE ?? "true").toLowerCase() !== "false",
    user,
    pass,
    mailbox: process.env.VEHICLE_HEALTH_IMAP_MAILBOX?.trim() || "INBOX",
    fromFilter,
    subjectFilter,
    pollIntervalMs,
    lookbackDays,
    batchSize,
    maxMessageBytes,
  };
}

function messageMatches(
  message: { envelope?: { subject?: string | null; from?: Array<{ address?: string | null }> } },
  config: MailboxConfig,
) {
  if (config.subjectFilter && !String(message.envelope?.subject ?? "").toLowerCase().includes(config.subjectFilter)) {
    return false;
  }
  if (config.fromFilter) {
    const fromAddresses = message.envelope?.from?.map((address) => String(address.address ?? "").toLowerCase()) ?? [];
    if (!fromAddresses.includes(config.fromFilter)) return false;
  }
  return true;
}

async function pollMailbox(config: MailboxConfig) {
  if (pollInProgress) return;
  pollInProgress = true;

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error(`IMAP mailbox "${config.mailbox}" did not open`);
      const uidValidity = String(mailbox.uidValidity ?? "unknown");
      const mailboxKey = `${config.user.toLowerCase()}|${config.mailbox.toLowerCase()}`;
      const newerThan = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);
      const unseenUids = await client.search({ seen: false, since: newerThan }, { uid: true });
      if (!unseenUids) throw new Error("IMAP server did not return unread-message search results");

      for (const uid of unseenUids.slice(0, config.batchSize)) {
        const metadata = await client.fetchOne(uid, { envelope: true, size: true }, { uid: true });
        if (!metadata || !messageMatches(metadata, config)) continue;
        const sourceKey = (attachmentHash: string): EmailImportSource => ({
          mailbox: mailboxKey,
          uidValidity,
          uid: String(uid),
          attachmentHash,
        });

        if (typeof metadata.size !== "number") {
          const filename = `unknown-size-email-${uid}.eml`;
          const error = "IMAP server did not provide message size; skipped to preserve the configured memory limit";
          await recordFailedVehicleHealthEmailImport(
            sourceKey(createHash("sha256").update(`unknown-size:${uidValidity}:${uid}`).digest("hex")),
            filename,
            error,
          );
          logger.error({ uid }, "Skipped vehicle health email because its message size is unknown");
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          continue;
        }

        if (metadata.size > config.maxMessageBytes) {
          const filename = `oversized-email-${uid}.eml`;
          const error = `Email size ${metadata.size} bytes exceeds configured limit of ${config.maxMessageBytes} bytes`;
          await recordFailedVehicleHealthEmailImport(
            sourceKey(createHash("sha256").update(`oversized:${uidValidity}:${uid}:${metadata.size}`).digest("hex")),
            filename,
            error,
          );
          logger.error({ uid, size: metadata.size, maxMessageBytes: config.maxMessageBytes }, "Skipped oversized vehicle health email");
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          continue;
        }

        const message = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!message || !message.source) continue;

        const source = Buffer.isBuffer(message.source) ? message.source : Buffer.from(message.source);
        let parsedMessage;
        try {
          parsedMessage = await simpleParser(source);
        } catch (error) {
          const filename = `unparseable-email-${uid}.eml`;
          const detail = error instanceof Error ? error.message : "MIME parsing failed";
          await recordFailedVehicleHealthEmailImport(
            sourceKey(createHash("sha256").update(source).digest("hex")),
            filename,
            detail,
          );
          logger.error({ uid, err: error }, "Could not parse vehicle health email; recorded as failed");
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          continue;
        }
        const pdfAttachments = parsedMessage.attachments.filter((attachment) =>
          attachment.contentType.toLowerCase() === "application/pdf"
          || attachment.filename?.toLowerCase().endsWith(".pdf"),
        );

        if (!pdfAttachments.length) {
          const warningKey = `${uidValidity}:${uid}`;
          if (!warnedMessages.has(warningKey)) {
            warnedMessages.add(warningKey);
            logger.warn({ uid, mailbox: config.mailbox }, "Matching vehicle health email has no PDF attachment; leaving it unread");
          }
          continue;
        }

        let failedAttachments = 0;
        for (const attachment of pdfAttachments) {
          const attachmentHash = createHash("sha256").update(attachment.content).digest("hex");
          const filename = attachment.filename || "vehicle-health-report.pdf";
          try {
            if (attachment.size > 10 * 1024 * 1024) {
              throw new Error(`PDF attachment exceeds the 10 MB import limit (${attachment.size} bytes)`);
            }
            const result = await importVehicleHealthPdf(
              attachment.content,
              filename,
              null,
              sourceKey(attachmentHash),
            );
            if (!result.duplicate) {
              logger.info({
                uid,
                filename,
                validUnits: result.valid,
                rejectedUnits: result.rejected.length,
                inserted: result.inserted,
                updated: result.updated,
                unchanged: result.unchanged,
              }, "Imported vehicle health report from email");
            }
          } catch (error) {
            failedAttachments++;
            const detail = error instanceof Error ? error.message : "Vehicle health report import failed";
            await recordFailedVehicleHealthEmailImport(sourceKey(attachmentHash), filename, detail);
            logger.error({ uid, filename, err: error }, "Vehicle health attachment failed and was recorded for review");
          }
        }

        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        logger.info({
          uid,
          pdfAttachments: pdfAttachments.length,
          failedAttachments,
        }, failedAttachments ? "Processed vehicle health email with failed attachments" : "Processed vehicle health email");
        warnedMessages.delete(`${uidValidity}:${uid}`);
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    logger.error({ err: error }, "Vehicle health mailbox poll failed");
  } finally {
    try {
      if (client.usable) await client.logout();
    } catch (error) {
      logger.warn({ err: error }, "Could not close vehicle health IMAP connection cleanly");
    }
    pollInProgress = false;
  }
}

export function startVehicleHealthEmailImporter() {
  if (pollTimer) return;
  const config = readConfig();
  if (!config) {
    logger.info("Vehicle health email import is disabled; configure VEHICLE_HEALTH_IMAP_* variables to enable it");
    return;
  }

  logger.info({
    host: config.host,
    mailbox: config.mailbox,
    pollIntervalMs: config.pollIntervalMs,
    lookbackDays: config.lookbackDays,
    batchSize: config.batchSize,
    maxMessageBytes: config.maxMessageBytes,
    senderFilterConfigured: Boolean(config.fromFilter),
    subjectFilterConfigured: Boolean(config.subjectFilter),
  }, "Starting vehicle health email importer");

  void pollMailbox(config);
  pollTimer = setInterval(() => void pollMailbox(config), config.pollIntervalMs);
  pollTimer.unref?.();
}

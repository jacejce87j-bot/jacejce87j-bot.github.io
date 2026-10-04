import { Router } from "express";
import multer from "multer";
import pdf from "pdf-parse";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { CreateTicketBody } from "@workspace/api-zod";
import {
  db,
  organizationsTable,
  ticketsTable,
  vehicleHealthEmailImportsTable,
  vehicleHealthReportsTable,
  vehicleHealthUnitsTable,
} from "@workspace/db";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype === "application/pdf"),
});

type ParsedUnit = {
  id: string;
  organizationName: string;
  registration: string;
  lastUpdateAt: Date | null;
  lastStatus: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  offlineDurationText: string;
  offlineDays: number;
  offlineDurationMinutes: number;
  severity: "critical" | "warning" | "recent";
};

function durationDays(value: string) {
  return Number(value.match(/(\d+)\s*d/i)?.[1] ?? 0);
}

function durationMinutes(value: string) {
  return durationDays(value) * 1440
    + Number(value.match(/(\d+)\s*h/i)?.[1] ?? 0) * 60
    + Number(value.match(/(\d+)\s*min/i)?.[1] ?? 0);
}

function parseLastUpdate(value: string) {
  const match = value.match(/^(\d{2}):(\d{2}) (\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, hour, minute, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
}

function normalizeRegistration(value: string) {
  return value
    .replace(/\s*\|\s*\d{2}:\d{2}\s+\d{2}\.\d{2}\.\d{4}\s*$/, "")
    .trim();
}

function parseHealthText(text: string): { valid: ParsedUnit[]; rejected: Array<{ raw: string; reason: string }> } {
  const valid: ParsedUnit[] = [];
  const rejected: Array<{ raw: string; reason: string }> = [];

  // pdf-parse returns this report's table columns without delimiters. Split
  // sections by their repeated header, then use timestamps and coordinates as
  // stable boundaries for each flattened vehicle row.
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\u00a0/g, " ").trim()).filter(Boolean);
  const headerIndexes = lines
    .map((line, index) => ({ line: line.toLowerCase(), index }))
    .filter(({ line }) => line.includes("vehicle registration") && line.includes("difference"))
    .map(({ index }) => index);

  for (let sectionIndex = 0; sectionIndex < headerIndexes.length; sectionIndex++) {
    const headerIndex = headerIndexes[sectionIndex];
    const nextHeaderIndex = headerIndexes[sectionIndex + 1] ?? lines.length;
    const organizationName = lines[headerIndex - 1] ?? "Unknown";
    const section = lines.slice(headerIndex + 1, nextHeaderIndex).join(" ");
    const timestamps = [...section.matchAll(/\d{2}:\d{2} \d{2}\.\d{2}\.\d{4}/g)];
    let previousRowEnd = 0;

    for (let rowIndex = 0; rowIndex < timestamps.length; rowIndex++) {
      const timestamp = timestamps[rowIndex];
      const registration = normalizeRegistration(
        section.slice(previousRowEnd, timestamp.index).replace(/^No data\s*/i, ""),
      );
      const rowEnd = rowIndex + 1 < timestamps.length
        ? (timestamps[rowIndex + 1].index ?? section.length)
        : section.length;
      const row = section.slice(timestamp.index + timestamp[0].length, rowEnd);
      const coordinate = row.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
      const durationMatches = [...row.matchAll(/(\d+\s*d\s+\d+\s*h\s+\d+\s*min)/gi)];
      const durationMatch = durationMatches[durationMatches.length - 1];
      if (!durationMatch || !registration || registration.toLowerCase() === "no data") continue;

      const status = row.slice(0, coordinate?.index ?? durationMatch.index).trim();
      const address = coordinate
        ? row.slice((coordinate.index ?? 0) + coordinate[0].length, durationMatch.index).trim()
        : "";
      const duration = durationMatch[1];
      previousRowEnd = timestamp.index + timestamp[0].length + (durationMatch.index ?? 0) + durationMatch[0].length;
      const days = durationDays(duration);
      const raw = `${organizationName} | ${registration} | ${duration}`;
      const invalidReason =
        organizationName.toLowerCase() === "fake" ? "test organization"
          : days > 1000 ? "offline duration exceeds 1000 days"
            : registration === "-" || registration.toLowerCase().includes("vehicle registration") ? "invalid registration"
              : !/^\d{2}:\d{2} \d{2}\.\d{2}\.\d{4}$/.test(timestamp[0]) ? "invalid update timestamp"
                : null;
      if (invalidReason) {
        rejected.push({ raw, reason: invalidReason });
      } else {
        valid.push({
          id: `${organizationName}|${registration}|${timestamp[0]}`,
          organizationName,
          registration,
          lastUpdateAt: parseLastUpdate(timestamp[0]),
          lastStatus: status,
          latitude: coordinate ? Number(coordinate[1]) : null,
          longitude: coordinate ? Number(coordinate[2]) : null,
          address,
          offlineDurationText: duration,
          offlineDays: days,
          offlineDurationMinutes: durationMinutes(duration),
          severity: days >= 30 ? "critical" : days >= 7 ? "warning" : "recent",
        });
      }
    }
  }
  return { valid, rejected };
}

export type EmailImportSource = {
  mailbox: string;
  uidValidity: string;
  uid: string;
  attachmentHash: string;
};

export async function recordFailedVehicleHealthEmailImport(
  source: EmailImportSource,
  filename: string,
  error: string,
) {
  await db.insert(vehicleHealthEmailImportsTable).values({
    ...source,
    filename,
    status: "failed",
    error: error.slice(0, 4000),
  }).onConflictDoUpdate({
    target: [
      vehicleHealthEmailImportsTable.mailbox,
      vehicleHealthEmailImportsTable.uidValidity,
      vehicleHealthEmailImportsTable.uid,
      vehicleHealthEmailImportsTable.attachmentHash,
    ],
    set: {
      status: "failed",
      error: error.slice(0, 4000),
    },
  });
}

export async function importVehicleHealthPdf(
  buffer: Buffer,
  filename: string,
  importedBy: string | null = null,
  source?: EmailImportSource,
) {
  const parsed = parseHealthText((await pdf(buffer)).text);
  if (parsed.valid.length === 0 && parsed.rejected.length === 0) {
    throw new Error("No vehicle rows were detected; the PDF does not match the expected Vehicle Registration table format.");
  }

  const organizationRows = await db.select().from(organizationsTable);
  const organizationByName = new Map(organizationRows.map((org) => [org.name.trim().toLowerCase(), org.id]));
  const result = await db.transaction(async (tx) => {
      let emailImportId: number | null = null;
      if (source) {
        const [emailImport] = await tx.insert(vehicleHealthEmailImportsTable).values({
          ...source,
          filename,
        }).onConflictDoNothing({
          target: [
            vehicleHealthEmailImportsTable.mailbox,
            vehicleHealthEmailImportsTable.uidValidity,
            vehicleHealthEmailImportsTable.uid,
            vehicleHealthEmailImportsTable.attachmentHash,
          ],
        }).returning({ id: vehicleHealthEmailImportsTable.id });
        if (!emailImport) return { duplicate: true, reportId: null, inserted: 0, updated: 0, unchanged: 0 };
        emailImportId = emailImport.id;
      }

      const [report] = await tx.insert(vehicleHealthReportsTable).values({
        filename,
        reportTimestamp: new Date(),
        importedBy,
        totalUnits: parsed.valid.length + parsed.rejected.length,
        validUnits: parsed.valid.length,
        status: "completed",
      }).returning({ id: vehicleHealthReportsTable.id });

      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      const existingUnits = await tx.select().from(vehicleHealthUnitsTable);
      for (const unit of parsed.valid) {
        const organizationId = organizationByName.get(unit.organizationName.trim().toLowerCase()) ?? null;
        const existing = existingUnits.find((candidate) =>
          candidate.organizationName.trim().toLowerCase() === unit.organizationName.trim().toLowerCase()
          && normalizeRegistration(candidate.registration).toLowerCase() === unit.registration.trim().toLowerCase()
        );

        if (existing && existing.offlineDurationMinutes === unit.offlineDurationMinutes) {
          await tx.update(vehicleHealthUnitsTable)
            .set({ reportId: report.id })
            .where(eq(vehicleHealthUnitsTable.id, existing.id));
          unchanged++;
          continue;
        }

        const { id: _parsedUnitId, ...unitValues } = unit;
        const values = {
          ...unitValues,
          reportId: report.id,
          organizationId,
          deviceId: unit.registration,
        };
        if (existing) {
          await tx.update(vehicleHealthUnitsTable)
            .set(values)
            .where(eq(vehicleHealthUnitsTable.id, existing.id));
          updated++;
        } else {
          await tx.insert(vehicleHealthUnitsTable).values({
            ...values,
            id: `${unit.organizationName}|${unit.registration}`,
          });
          inserted++;
        }
      }
      if (emailImportId !== null) {
        await tx.update(vehicleHealthEmailImportsTable)
          .set({ reportId: report.id })
          .where(eq(vehicleHealthEmailImportsTable.id, emailImportId));
      }
      return { duplicate: false, reportId: report.id, inserted, updated, unchanged };
  });

  return {
    ...result,
    valid: parsed.valid.length,
    rejected: parsed.rejected,
    total: parsed.valid.length + parsed.rejected.length,
  };
}

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A PDF file is required" });
  try {
    const result = await importVehicleHealthPdf(
      req.file.buffer,
      req.file.originalname,
      (req.user as { id?: string } | undefined)?.id ?? null,
    );
    res.status(201).json({
      reportId: result.reportId,
      valid: result.valid,
      rejected: result.rejected,
      total: result.total,
      inserted: result.inserted,
      updated: result.updated,
      unchanged: result.unchanged,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health report import failed";
    const status = message.startsWith("No vehicle rows were detected") ? 422 : 500;
    res.status(status).json({ error: message });
  }
});

router.get("/units", async (_req, res) => {
  const [latestReport] = await db
    .select({ id: vehicleHealthReportsTable.id })
    .from(vehicleHealthReportsTable)
    .orderBy(desc(vehicleHealthReportsTable.id))
    .limit(1);
  if (!latestReport) return res.json({ units: [] });

  const rows = await db
    .select()
    .from(vehicleHealthUnitsTable)
    .where(eq(vehicleHealthUnitsTable.reportId, latestReport.id))
    .orderBy(desc(vehicleHealthUnitsTable.offlineDays));
  const currentByVehicle = new Map<string, typeof rows[number]>();
  for (const unit of rows) {
    const vehicleKey = `${unit.organizationName.trim().toLowerCase()}|${unit.registration.trim().toLowerCase()}`;
    if (!currentByVehicle.has(vehicleKey)) {
      currentByVehicle.set(vehicleKey, unit);
    }
  }
  const units = [...currentByVehicle.values()]
    .sort((a, b) => b.offlineDays - a.offlineDays)
    .slice(0, 500);
  res.json({ units });
});

router.post("/units/:id/ticket", async (req, res) => {
  const [unit] = await db.select().from(vehicleHealthUnitsTable).where(eq(vehicleHealthUnitsTable.id, req.params.id));
  if (!unit) return res.status(404).json({ error: "Health unit not found" });

  const openStatuses = ["open", "pending"] as const;
  const [existing] = await db.select().from(ticketsTable).where(and(
    eq(ticketsTable.reg, unit.registration),
    unit.organizationId === null ? isNull(ticketsTable.organizationId) : eq(ticketsTable.organizationId, unit.organizationId),
    inArray(ticketsTable.status, [...openStatuses]),
  )).limit(1);
  if (existing) return res.status(409).json({ error: "Open ticket already exists", ticketId: existing.id, ticket: existing });

  const payload = {
    subject: `Unit Offline - ${unit.registration} - ${unit.organizationName} - Offline ${unit.offlineDurationText}`,
    description: `Vehicle Health Monitor Alert\n\nOrganization: ${unit.organizationName}\nRegistration: ${unit.registration}\nLast Update: ${unit.lastUpdateAt?.toISOString() ?? "No data"}\nLast Status: ${unit.lastStatus ?? "No data"}\nAddress: ${unit.address ?? "No data"}\nCoordinates: ${unit.latitude}, ${unit.longitude}\nOffline Duration: ${unit.offlineDurationText}\nReport ID: ${unit.reportId}`,
    status: "open" as const,
    priority: (unit.offlineDays >= 30 ? "urgent" : unit.offlineDays >= 7 ? "high" : "normal") as "urgent" | "high" | "normal",
    type: "problem" as const,
    channel: "api" as const,
    organizationId: unit.organizationId,
    requesterId: null,
    tags: ["vehicle-offline", "health-monitor", "automated"],
    client: unit.organizationName,
    reg: unit.registration,
    deviceId: unit.deviceId ?? unit.registration,
  };

  try {
    const parsed = CreateTicketBody.parse(payload);
    const ticketValues = {
      ...parsed,
      dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
    };
    const ticket = await db.transaction(async (tx) => {
      const [raceCheck] = await tx.select({ id: ticketsTable.id }).from(ticketsTable).where(and(
        eq(ticketsTable.reg, unit.registration),
        unit.organizationId === null ? isNull(ticketsTable.organizationId) : eq(ticketsTable.organizationId, unit.organizationId),
        inArray(ticketsTable.status, [...openStatuses]),
      )).limit(1);
      if (raceCheck) throw Object.assign(new Error("Open ticket already exists"), { code: "DUPLICATE_TICKET", ticketId: raceCheck.id });
      const [created] = await tx.insert(ticketsTable).values(ticketValues).returning();
      await tx.update(vehicleHealthUnitsTable).set({ ticketId: created.id }).where(eq(vehicleHealthUnitsTable.id, unit.id));
      return created;
    });
    res.status(201).json(ticket);
  } catch (error: any) {
    if (error?.code === "DUPLICATE_TICKET") return res.status(409).json({ error: error.message, ticketId: error.ticketId });
    if (error?.name === "ZodError") return res.status(400).json({ error: "Ticket validation failed", issues: error.issues });
    if (error?.code === "23505") return res.status(409).json({ error: "Open ticket already exists" });
    res.status(500).json({ error: error instanceof Error ? error.message : "Ticket creation failed" });
  }
});

export default router;

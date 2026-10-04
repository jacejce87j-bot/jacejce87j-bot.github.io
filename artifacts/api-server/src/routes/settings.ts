import { Router } from "express";
import { agentsTable, db, macroUsageEventsTable, slaPoliciesTable, systemSettingsTable, ticketMacrosTable, ticketRulesTable, ticketTemplatesTable, type TemplateField } from "@workspace/db";
import { slaBusinessHoursTable } from "../../../../lib/db/src/schema/business_hours";
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  CreateSlaPolicyBody,
  UpdateSlaPolicyBody,
  UpdateSlaPolicyParams,
  CreateTicketTemplateBody,
  UpdateTicketTemplateBody,
  UpdateTicketTemplateParams,
} from "@workspace/api-zod";

const router = Router();

const fieldAliases: Record<string, string> = {
  "fleet num": "fleetNum",
  "fleet no": "fleetNum",
  "fleet number": "fleetNum",
  "fleetnum": "fleetNum",
  "reg": "reg",
  "number plate": "reg",
  "numberplate": "reg",
  "registration": "reg",
  "vin": "vin",
  "vehicle id": "deviceId",
  "device id": "deviceId",
  "deviceid": "deviceId",
  "devicecellno": "deviceCellNo",
  "device cell no": "deviceCellNo",
  "device cell": "deviceCellNo",
  "engine": "engine",
  "make": "make",
  "model": "model",
  "colour": "colour",
  "color": "colour",
  "odo": "odo",
  "odometer": "odo",
  "device type": "deviceType",
  "devicetype": "deviceType",
  "camera device type": "deviceType",
  "tracking type": "trackingType",
  "tracking imei": "trackingImei",
  "trackingimei": "trackingImei",
  "tracking cell num": "trackingCellNum",
  "trackingcellnum": "trackingCellNum",
  "tracking cell number": "trackingCellNum",
  "tracking cell": "trackingCellNum",
  "trackingtype": "trackingType",
  "vesa num": "vesaNum",
  "vesa": "vesaNum",
  "vesanum": "vesaNum",
  "hours": "hours",
  "hrs": "hours",
  "channel": "channel",
  "channel 1": "channel",
  "channel 2": "channel",
  "channel 3": "channel",
  "channel 4": "channel",
  "channel 5": "channel",
  "channel 6": "channel",
  "channel 7": "channel",
  "channel 8": "channel",
  "channel1": "channel",
  "channel2": "channel",
  "channel3": "channel",
  "channel4": "channel",
  "channel5": "channel",
  "channel6": "channel",
  "channel7": "channel",
  "channel8": "channel",
};

const channelTemplateField = {
  key: "channel",
  label: "Channel",
  type: "text" as const,
};

function normalizeTemplateFieldKey(value: string): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ");

  if (fieldAliases[raw]) {
    return fieldAliases[raw];
  }

  return raw
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join("") || "";
}

function inferFieldsFromTemplateDescription(description: string): Array<{key: string; label: string; required?: boolean; value?: string}> {
  const sanitized = String(description ?? "").replace(/\\n/g, "\n");
  const lines = sanitized
    .split(/\\n|\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const generated: Array<{key: string; label: string; required?: boolean; value?: string}> = [];
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;

    const label = match[1].trim();
    const key = normalizeTemplateFieldKey(label);
    if (!key) continue;

    const allowed = new Set([
      "client",
      "fleetNum",
      "reg",
      "vin",
      "engine",
      "make",
      "model",
      "colour",
      "odo",
      "deviceId",
      "deviceCellNo",
      "deviceType",
      "trackingImei",
      "trackingCellNum",
      "trackingType",
      "vesaNum",
      "hours",
      "channel",
    ]);

    if (!allowed.has(key)) {
      continue;
    }

    const value = match[2].trim();
    generated.push({ key, label, value: value || undefined });
  }

  return generated;
}

function withChannelTemplateFields(fields: unknown, description = ""): TemplateField[] {
  const existing = Array.isArray(fields) ? fields : [];
  const inferred = inferFieldsFromTemplateDescription(description);
  const merged: TemplateField[] = [];
  const seen = new Set<string>();

  for (const field of [...existing, ...inferred]) {
    if (!field || typeof field !== "object") continue;
    const candidate = field as {
      key?: unknown;
      label?: unknown;
      required?: unknown;
      value?: unknown;
      type?: unknown;
    };
    const key = normalizeTemplateFieldKey(String(candidate.key ?? candidate.label ?? ""));
    if (!key || key === "channel" || seen.has(key)) continue;

    seen.add(key);
    const normalizedField: TemplateField = {
      key,
      label: String(candidate.label ?? key),
    };
    if (candidate.required === true) normalizedField.required = true;
    if (candidate.value !== undefined) normalizedField.value = String(candidate.value);
    if (candidate.type === "text" || candidate.type === "number" || candidate.type === "phone") {
      normalizedField.type = candidate.type;
    }
    merged.push(normalizedField);
  }

  return [...merged, channelTemplateField];
}

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isAdmin(req: any) {
  return normalizeRole(req.user?.role) === "admin";
}

function canManageTemplates(req: any) {
  const role = normalizeRole(req.user?.role);
  return ["admin", "supervisor", "agent"].includes(role);
}

function allowLocalTemplateBypass(req: any) {
  return process.env.ALLOW_UNAUTH_TEMPLATES === "true" || process.env.NODE_ENV !== "production";
}

function serializePolicy(policy: typeof slaPoliciesTable.$inferSelect) {
  return {
    id: policy.id,
    name: policy.name,
    priority: policy.priority,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    isActive: policy.isActive,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

function serializeTemplate(template: typeof ticketTemplatesTable.$inferSelect) {
  const row = template as typeof ticketTemplatesTable.$inferSelect & { fields?: unknown[] };
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: withChannelTemplateFields(row.fields, row.description),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeBusinessHours(schedule: typeof slaBusinessHoursTable.$inferSelect) {
  return {
    id: schedule.id,
    name: schedule.name,
    timezone: schedule.timezone,
    organizationId: schedule.organizationId,
    isDefault: schedule.isDefault,
    monday: schedule.monday,
    tuesday: schedule.tuesday,
    wednesday: schedule.wednesday,
    thursday: schedule.thursday,
    friday: schedule.friday,
    saturday: schedule.saturday,
    sunday: schedule.sunday,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    holidayDates: Array.isArray(schedule.holidayDates) ? schedule.holidayDates : [],
  };
}

router.get("/sla-policies", async (_req, res) => {
  const policies = await db.select().from(slaPoliciesTable).orderBy(slaPoliciesTable.priority);
  res.json(policies.map(serializePolicy));
});

router.get("/sla-business-hours", async (req, res) => {
  const organizationIdParam = req.query.organizationId;
  const organizationId = organizationIdParam === undefined || organizationIdParam === null || organizationIdParam === "" ? null : Number(organizationIdParam);

  const schedules = await db
    .select()
    .from(slaBusinessHoursTable)
    .orderBy(desc(slaBusinessHoursTable.isDefault), desc(slaBusinessHoursTable.createdAt));

  const defaultSchedule = schedules.find((schedule) => {
    if (organizationId !== null && schedule.organizationId !== null) {
      return Number(schedule.organizationId) === organizationId;
    }
    return schedule.isDefault;
  }) ?? schedules[0] ?? null;

  if (!defaultSchedule) {
    return res.json({ isConfigured: false, schedule: null });
  }

  res.json({
    isConfigured: true,
    schedule: serializeBusinessHours(defaultSchedule),
  });
});

router.put("/sla-business-hours", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });

  const body = req.body ?? {};
  const schedule = {
    name: String(body.name ?? "Default business hours"),
    timezone: String(body.timezone ?? "UTC"),
    organizationId: body.organizationId === null || body.organizationId === undefined || body.organizationId === "" ? null : Number(body.organizationId),
    isDefault: body.organizationId === null || body.organizationId === undefined || body.organizationId === "" || body.isDefault === true,
    monday: body.monday ?? true,
    tuesday: body.tuesday ?? true,
    wednesday: body.wednesday ?? true,
    thursday: body.thursday ?? true,
    friday: body.friday ?? true,
    saturday: body.saturday ?? false,
    sunday: body.sunday ?? false,
    startTime: String(body.startTime ?? "09:00"),
    endTime: String(body.endTime ?? "17:00"),
    holidayDates: Array.isArray(body.holidayDates) ? body.holidayDates.map((value: unknown) => String(value)).filter(Boolean) : [],
  };

  if (!/^\d{2}:\d{2}$/.test(schedule.startTime) || !/^\d{2}:\d{2}$/.test(schedule.endTime)) {
    return res.status(400).json({ error: "startTime and endTime must use HH:MM format" });
  }

  if (schedule.organizationId !== null && !Number.isInteger(schedule.organizationId)) {
    return res.status(400).json({ error: "organizationId must be an integer or null" });
  }

  const [saved] = await db.insert(slaBusinessHoursTable).values({
    name: schedule.name,
    timezone: schedule.timezone,
    organizationId: schedule.organizationId,
    isDefault: schedule.isDefault,
    monday: schedule.monday,
    tuesday: schedule.tuesday,
    wednesday: schedule.wednesday,
    thursday: schedule.thursday,
    friday: schedule.friday,
    saturday: schedule.saturday,
    sunday: schedule.sunday,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    holidayDates: schedule.holidayDates,
  }).returning();

  res.status(201).json({
    schedule: serializeBusinessHours(saved),
  });
});

router.get("/routing", async (_req, res) => {
  const settings = await db.select().from(systemSettingsTable);
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  res.json({
    onCallAgentId: values.get("on_call_agent_id") ? Number(values.get("on_call_agent_id")) : null,
    backupAgentId: values.get("backup_agent_id") ? Number(values.get("backup_agent_id")) : null,
  });
});

router.patch("/routing", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const parseAgentId = (value: unknown, field: string) => {
    const id = value === null || value === "" || value === undefined ? null : Number(value);
    if (id !== null && !Number.isInteger(id)) throw new Error(`${field} must be an integer or null`);
    return id;
  };
  let agentId: number | null;
  let backupAgentId: number | null;
  try {
    agentId = parseAgentId(req.body?.onCallAgentId, "onCallAgentId");
    backupAgentId = parseAgentId(req.body?.backupAgentId, "backupAgentId");
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid routing settings" });
  }
  if (agentId !== null || backupAgentId !== null) {
    const ids = [agentId, backupAgentId].filter((id): id is number => id !== null);
    const agents = await db.select({ id: agentsTable.id }).from(agentsTable).where(inArray(agentsTable.id, ids));
    if (agents.length !== ids.length) return res.status(400).json({ error: "A configured routing agent was not found" });
  }
  if (agentId !== null && agentId === backupAgentId) {
    return res.status(400).json({ error: "On-call and backup agents must be different" });
  }
  if (agentId === null) {
    await db.delete(systemSettingsTable).where(eq(systemSettingsTable.key, "on_call_agent_id"));
  } else {
    await db.insert(systemSettingsTable).values({ key: "on_call_agent_id", value: String(agentId) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(agentId), updatedAt: new Date() } });
  }
  if (backupAgentId === null) {
    await db.delete(systemSettingsTable).where(eq(systemSettingsTable.key, "backup_agent_id"));
  } else {
    await db.insert(systemSettingsTable).values({ key: "backup_agent_id", value: String(backupAgentId) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(backupAgentId), updatedAt: new Date() } });
  }
  res.json({ onCallAgentId: agentId, backupAgentId });
});

function serializeTicketRule(rule: typeof ticketRulesTable.$inferSelect) {
  return {
    id: rule.id,
    name: rule.name,
    conditions: rule.conditions,
    actions: rule.actions,
    isActive: rule.isActive,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function parseRulePayload(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const conditions = value.conditions && typeof value.conditions === "object"
    ? value.conditions as Record<string, unknown>
    : {};
  const actions = value.actions && typeof value.actions === "object"
    ? value.actions as Record<string, unknown>
    : {};

  if (!String(value.name ?? "").trim()) {
    throw new Error("Rule name is required");
  }
  if (actions.assignGroup !== undefined) {
    throw new Error("assignGroup is not available until agent groups are configured");
  }

  const assignAgent = actions.assignAgent === undefined || actions.assignAgent === null || actions.assignAgent === ""
    ? undefined
    : Number(actions.assignAgent);
  if (assignAgent !== undefined && !Number.isInteger(assignAgent)) {
    throw new Error("actions.assignAgent must be an integer");
  }

  const tags = conditions.tags === undefined
    ? undefined
    : Array.isArray(conditions.tags) ? conditions.tags.map(String).filter(Boolean) : (() => { throw new Error("conditions.tags must be an array"); })();
  const addTag = actions.addTag === undefined
    ? undefined
    : Array.isArray(actions.addTag) ? actions.addTag.map(String).filter(Boolean) : String(actions.addTag);

  return {
    name: String(value.name).trim(),
    conditions: {
      ...(conditions.org !== undefined ? { org: typeof conditions.org === "number" ? conditions.org : String(conditions.org) } : {}),
      ...(conditions.organizationId !== undefined ? { organizationId: Number(conditions.organizationId) } : {}),
      ...(conditions.priority !== undefined ? { priority: String(conditions.priority) } : {}),
      ...(tags !== undefined ? { tags } : {}),
    },
    actions: {
      ...(assignAgent !== undefined ? { assignAgent } : {}),
      ...(addTag !== undefined ? { addTag } : {}),
      ...(actions.applyMacro !== undefined ? { applyMacro: typeof actions.applyMacro === "number" ? actions.applyMacro : String(actions.applyMacro) } : {}),
    },
    isActive: value.isActive === undefined ? true : Boolean(value.isActive),
  };
}

router.get("/ticket-rules", async (_req, res) => {
  const rules = await db.select().from(ticketRulesTable).orderBy(ticketRulesTable.id);
  res.json(rules.map(serializeTicketRule));
});

router.post("/ticket-rules", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });

  try {
    const payload = parseRulePayload(req.body);
    if (payload.actions.assignAgent !== undefined) {
      const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, payload.actions.assignAgent)).limit(1);
      if (!agent) return res.status(400).json({ error: "actions.assignAgent references an unknown agent" });
    }
    const [rule] = await db.insert(ticketRulesTable).values(payload).returning();
    res.status(201).json(serializeTicketRule(rule));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid ticket rule" });
  }
});

router.patch("/ticket-rules/:id", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });

  try {
    const payload = parseRulePayload(req.body);
    if (payload.actions.assignAgent !== undefined) {
      const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, payload.actions.assignAgent)).limit(1);
      if (!agent) return res.status(400).json({ error: "actions.assignAgent references an unknown agent" });
    }
    const [rule] = await db.update(ticketRulesTable).set(payload).where(eq(ticketRulesTable.id, Number(req.params.id))).returning();
    if (!rule) return res.status(404).json({ error: "Ticket rule not found" });
    res.json(serializeTicketRule(rule));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid ticket rule" });
  }
});

router.delete("/ticket-rules/:id", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const [rule] = await db.delete(ticketRulesTable).where(eq(ticketRulesTable.id, Number(req.params.id))).returning();
  if (!rule) return res.status(404).json({ error: "Ticket rule not found" });
  res.status(204).send();
});

router.post("/sla-policies", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const body = CreateSlaPolicyBody.parse(req.body);
  const [policy] = await db.insert(slaPoliciesTable).values(body).returning();
  res.status(201).json(serializePolicy(policy));
});

router.patch("/sla-policies/:id", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const { id } = UpdateSlaPolicyParams.parse({ id: Number(req.params.id) });
  const body = UpdateSlaPolicyBody.parse(req.body);
  const [policy] = await db.update(slaPoliciesTable).set(body).where(eq(slaPoliciesTable.id, id)).returning();
  if (!policy) return res.status(404).json({ error: "SLA policy not found" });
  res.json(serializePolicy(policy));
});

router.get("/ticket-templates", async (_req, res) => {
  const templates = await db
    .select()
    .from(ticketTemplatesTable)
    .orderBy(ticketTemplatesTable.name);
  res.json(templates.map(serializeTemplate));
});

function serializeMacro(macro: typeof ticketMacrosTable.$inferSelect) {
  return { ...macro, createdAt: macro.createdAt.toISOString(), updatedAt: macro.updatedAt.toISOString() };
}

router.get("/ticket-macros", async (_req, res) => {
  const macros = await db.select().from(ticketMacrosTable).orderBy(ticketMacrosTable.name);
  res.json(macros.map(serializeMacro));
});

router.post("/ticket-macros/:id/usage", async (req, res) => {
  const macroId = Number(req.params.id);
  const scope = String(req.body?.scope ?? "");
  if (!Number.isInteger(macroId) || !["description", "public_comment", "internal_comment"].includes(scope)) {
    return res.status(400).json({ error: "A valid macro ID and scope are required" });
  }
  const [macro] = await db.select({ id: ticketMacrosTable.id }).from(ticketMacrosTable).where(eq(ticketMacrosTable.id, macroId));
  if (!macro) return res.status(404).json({ error: "Macro not found" });
  await db.insert(macroUsageEventsTable).values({
    macroId,
    scope,
    ticketId: Number.isInteger(Number(req.body?.ticketId)) ? Number(req.body.ticketId) : null,
    userId: req.user?.id ? String(req.user.id) : null,
  });
  res.status(204).send();
});

router.get("/ticket-macros/analytics", async (req, res) => {
  if (!canManageTemplates(req) && !allowLocalTemplateBypass(req)) {
    return res.status(403).json({ error: "Macro analytics access required" });
  }
  const rows = await db
    .select({
      macroId: ticketMacrosTable.id,
      name: ticketMacrosTable.name,
      scope: macroUsageEventsTable.scope,
      usageCount: sql<number>`count(${macroUsageEventsTable.id})`,
      lastUsedAt: sql<Date | null>`max(${macroUsageEventsTable.createdAt})`,
    })
    .from(ticketMacrosTable)
    .leftJoin(macroUsageEventsTable, eq(macroUsageEventsTable.macroId, ticketMacrosTable.id))
    .groupBy(ticketMacrosTable.id, ticketMacrosTable.name, macroUsageEventsTable.scope)
    .orderBy(desc(sql`count(${macroUsageEventsTable.id})`), ticketMacrosTable.name);
  res.json(rows.map((row) => ({
    ...row,
    usageCount: Number(row.usageCount),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  })));
});

router.post("/ticket-macros", async (req, res) => {
  if (!canManageTemplates(req) && !allowLocalTemplateBypass(req)) return res.status(403).json({ error: "Macro management access required" });
  const name = String(req.body?.name ?? "").trim();
  const content = String(req.body?.content ?? "").trim();
  const scope = String(req.body?.scope ?? "all");
  if (!name || !content || !["all", "description", "public_comment", "internal_comment"].includes(scope)) {
    return res.status(400).json({ error: "Name, content, and a valid scope are required" });
  }
  const [macro] = await db.insert(ticketMacrosTable).values({ name, content, scope }).returning();
  res.status(201).json(serializeMacro(macro));
});

router.patch("/ticket-macros/:id", async (req, res) => {
  if (!canManageTemplates(req) && !allowLocalTemplateBypass(req)) return res.status(403).json({ error: "Macro management access required" });
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body?.content !== undefined) updates.content = String(req.body.content).trim();
  if (req.body?.scope !== undefined) updates.scope = String(req.body.scope);
  if (req.body?.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
  const [macro] = await db.update(ticketMacrosTable).set(updates).where(eq(ticketMacrosTable.id, id)).returning();
  if (!macro) return res.status(404).json({ error: "Macro not found" });
  res.json(serializeMacro(macro));
});

router.delete("/ticket-macros/:id", async (req, res) => {
  if (!canManageTemplates(req) && !allowLocalTemplateBypass(req)) return res.status(403).json({ error: "Macro management access required" });
  await db.delete(ticketMacrosTable).where(eq(ticketMacrosTable.id, Number(req.params.id)));
  res.status(204).send();
});

import { logger } from "../lib/logger";

router.post("/ticket-templates", async (req, res) => {
  const allowBypass = allowLocalTemplateBypass(req);
  if (!canManageTemplates(req)) {
    if (!allowBypass) return res.status(403).json({ error: "Template management access required" });
    logger.warn({ path: req.url, ip: req.ip }, "Bypassing template-management role check (dev mode or ALLOW_UNAUTH_TEMPLATES=true)");
  }

  const body = CreateTicketTemplateBody.parse(req.body);
  const inferredFields = inferFieldsFromTemplateDescription(body.description || "");
  const fields = withChannelTemplateFields(
    Array.isArray(body.fields) && body.fields.length ? body.fields : inferredFields,
    body.description || "",
  );
  const [template] = await db.insert(ticketTemplatesTable).values({ ...body, fields }).returning();
  res.status(201).json(serializeTemplate(template));
});

router.patch("/ticket-templates/:id", async (req, res) => {
  const allowBypass = allowLocalTemplateBypass(req);
  if (!canManageTemplates(req)) {
    if (!allowBypass) return res.status(403).json({ error: "Template management access required" });
    logger.warn({ path: req.url, ip: req.ip }, "Bypassing template update access (dev mode or ALLOW_UNAUTH_TEMPLATES=true)");
  }
  const { id } = UpdateTicketTemplateParams.parse({ id: Number(req.params.id) });
  const body = UpdateTicketTemplateBody.parse(req.body);
  const inferredFields = inferFieldsFromTemplateDescription(body.description || "");
  const fields = withChannelTemplateFields(
    Array.isArray(body.fields) && body.fields.length ? body.fields : inferredFields,
    body.description || "",
  );
  const [template] = await db
    .update(ticketTemplatesTable)
    .set({ ...body, fields: fields.length ? fields : undefined })
    .where(eq(ticketTemplatesTable.id, id))
    .returning();
  if (!template) return res.status(404).json({ error: "Ticket template not found" });
  res.json(serializeTemplate(template));
});

router.delete("/ticket-templates/:id", async (req, res) => {
  const allowBypass = allowLocalTemplateBypass(req);
  if (!canManageTemplates(req)) {
    if (!allowBypass) return res.status(403).json({ error: "Template management access required" });
    logger.warn({ path: req.url, ip: req.ip }, "Bypassing template delete access (dev mode or ALLOW_UNAUTH_TEMPLATES=true)");
  }
  const { id } = UpdateTicketTemplateParams.parse({ id: Number(req.params.id) });
  const deleted = await db
    .delete(ticketTemplatesTable)
    .where(eq(ticketTemplatesTable.id, id))
    .returning({ id: ticketTemplatesTable.id });
  if (!deleted.length) return res.status(404).json({ error: "Ticket template not found" });
  res.status(204).send();
});

export default router;
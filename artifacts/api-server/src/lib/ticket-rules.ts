import {
  db,
  agentsTable,
  organizationsTable,
  ticketMacrosTable,
  ticketRulesTable,
  type TicketRule,
  type TicketRuleActions,
  type TicketRuleConditions,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";

export type TicketRuleInput = {
  organizationId: number | null;
  priority: string;
  tags: string[];
  description: string;
  manualAssignmentApplied: boolean;
};

export type TicketRuleEvaluation = {
  assigneeId: number | null;
  tags: string[];
  description: string;
  appliedRules: Array<{ id: number; name: string; actions: TicketRuleActions }>;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesConditions(
  conditions: TicketRuleConditions,
  input: TicketRuleInput,
  organizationName: string | null,
) {
  if (conditions.organizationId !== undefined && conditions.organizationId !== input.organizationId) {
    return false;
  }

  if (conditions.org !== undefined) {
    const organizationValue = normalize(conditions.org);
    if (
      organizationValue !== normalize(input.organizationId) &&
      organizationValue !== normalize(organizationName)
    ) {
      return false;
    }
  }

  if (conditions.priority !== undefined && normalize(conditions.priority) !== normalize(input.priority)) {
    return false;
  }

  if (conditions.tags?.length) {
    const existingTags = new Set(input.tags.map(normalize));
    if (!conditions.tags.every((tag) => existingTags.has(normalize(tag)))) {
      return false;
    }
  }

  return true;
}

function normalizeTags(value: string | string[] | undefined) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .map((tag) => String(tag).trim())
    .filter(Boolean);
}

async function findMacro(value: number | string) {
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const [macro] = await db.select().from(ticketMacrosTable).where(eq(ticketMacrosTable.id, Number(value))).limit(1);
    return macro ?? null;
  }

  const [macro] = await db.select().from(ticketMacrosTable).where(eq(ticketMacrosTable.name, String(value))).limit(1);
  return macro ?? null;
}

function appliesToDescription(scope: string) {
  return scope === "all" || scope === "description";
}

export async function evaluateTicketRules(input: TicketRuleInput): Promise<TicketRuleEvaluation> {
  const [organization, rules] = await Promise.all([
    input.organizationId
      ? db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, input.organizationId)).limit(1)
      : Promise.resolve([]),
    db.select().from(ticketRulesTable).where(eq(ticketRulesTable.isActive, true)).orderBy(asc(ticketRulesTable.id)),
  ]);

  let assigneeId: number | null = null;
  let tags = [...input.tags];
  let description = input.description;
  const appliedRules: TicketRuleEvaluation["appliedRules"] = [];

  for (const rule of rules as TicketRule[]) {
    if (!matchesConditions(rule.conditions ?? {}, input, organization[0]?.name ?? null)) continue;

    const actions = rule.actions ?? {};
    if (!input.manualAssignmentApplied && actions.assignAgent !== undefined) {
      const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, Number(actions.assignAgent))).limit(1);
      if (agent) assigneeId = agent.id;
    }

    const newTags = normalizeTags(actions.addTag);
    tags = [...new Set([...tags, ...newTags])];

    if (actions.applyMacro !== undefined) {
      const macro = await findMacro(actions.applyMacro);
      if (macro && appliesToDescription(macro.scope)) {
        description = description ? `${description}\n\n${macro.content}` : macro.content;
      }
    }

    appliedRules.push({ id: rule.id, name: rule.name, actions });
  }

  return { assigneeId, tags, description, appliedRules };
}

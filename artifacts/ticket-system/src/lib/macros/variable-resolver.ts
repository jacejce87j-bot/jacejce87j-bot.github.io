export type MacroContext = {
  ticket?: {
    id?: number | string | null;
    subject?: string | null;
    organization?: { name?: string | null } | null;
    contact?: { name?: string | null } | null;
    requester?: { name?: string | null } | null;
  } | null;
  organization?: { name?: string | null } | null;
  contact?: { name?: string | null } | null;
  user?: { name?: string | null; firstName?: string | null; lastName?: string | null } | null;
};

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

function userName(user: MacroContext["user"]) {
  if (!user) return "Support Team";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.name || fullName || "Support Team";
}

export function resolveMacroVariables(content: string, context: MacroContext): string {
  const ticket = context.ticket;
  const organizationName =
    ticket?.organization?.name ||
    context.organization?.name ||
    "your organization";
  const customerName =
    ticket?.contact?.name ||
    ticket?.requester?.name ||
    context.contact?.name ||
    organizationName ||
    "Valued Customer";

  const values: Record<string, string> = {
    customer_name: customerName,
    ticket_id: ticket?.id == null ? "this ticket" : `#${ticket.id}`,
    organization_name: organizationName,
    agent_name: userName(context.user),
    ticket_subject: ticket?.subject || "this ticket",
    current_date: new Date().toLocaleDateString(),
  };

  return content.replace(VARIABLE_PATTERN, (match, variable: string) => values[variable] ?? match);
}

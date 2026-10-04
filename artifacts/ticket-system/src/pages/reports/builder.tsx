import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useSupportUser } from "@/hooks/use-support-user";

type PivotFact = {
  ticketId: number;
  subject: string;
  createdAt: string;
  createdMonth: string;
  organizationId: number | null;
  organization: string;
  agentId: number | null;
  agent: string;
  status: string;
  priority: string;
  channel: string;
  client: string;
  fleetNum: string;
  reg: string;
  ticketCount: number;
  solvedCount: number;
  backlogCount: number;
  firstReplyTotalMinutes: number;
  firstReplyCount: number;
  nextReplyTotalMinutes: number;
  nextReplyCount: number;
  requestWaitTotalMinutes: number;
  requestWaitCount: number;
  resolutionTotalMinutes: number;
  resolutionCount: number;
  fcrEligibleCount: number;
  fcrSolvedCount: number;
  firstResponseMeasuredCount: number;
  firstResponseWithinSlaCount: number;
  firstResponseBreachCount: number;
  resolutionMeasuredCount: number;
  resolutionWithinSlaCount: number;
  resolutionBreachCount: number;
  assignmentWaitTotalMinutes: number;
  assignmentWaitCount: number;
  assignmentBreachCount: number;
  currentAssignmentTotalMinutes: number;
  currentAssignmentCount: number;
  reopenCount: number;
  csatResponseCount: number;
  csatPositiveCount: number;
};

type TrackingNotes = {
  agentWorkTime: string;
  assignmentTime: string;
  sla: string;
  dateRange: string;
};

type ApiResponse = {
  from: string;
  to: string;
  truncated: boolean;
  rows: PivotFact[];
  trackingNotes: TrackingNotes;
};

type DimensionId = "organization" | "agent" | "status" | "priority" | "createdMonth" | "channel" | "client";

const dimensionLabels: Record<DimensionId, string> = {
  organization: "Organization",
  agent: "Current assignee",
  status: "Status",
  priority: "Priority",
  createdMonth: "Created month",
  channel: "Channel",
  client: "Client",
};

const measures = [
  { id: "tickets", group: "Volume", label: "Tickets", numerator: "ticketCount" },
  { id: "solved", group: "Volume", label: "Solved tickets", numerator: "solvedCount" },
  { id: "backlog", group: "Volume", label: "Backlog", numerator: "backlogCount" },
  { id: "firstReply", group: "Speed", label: "Avg first reply (business min)", numerator: "firstReplyTotalMinutes", denominator: "firstReplyCount" },
  { id: "nextReply", group: "Speed", label: "Avg next reply (business min)", numerator: "nextReplyTotalMinutes", denominator: "nextReplyCount" },
  { id: "requestWait", group: "Speed", label: "Avg request wait (business min)", numerator: "requestWaitTotalMinutes", denominator: "requestWaitCount" },
  { id: "resolution", group: "Speed", label: "Avg full resolution (business min)", numerator: "resolutionTotalMinutes", denominator: "resolutionCount" },
  { id: "assignmentWait", group: "Speed", label: "Avg queue-to-assignment (business min)", numerator: "assignmentWaitTotalMinutes", denominator: "assignmentWaitCount" },
  { id: "assignmentAge", group: "Speed", label: "Avg current assignment age (business min)", numerator: "currentAssignmentTotalMinutes", denominator: "currentAssignmentCount" },
  { id: "firstSla", group: "SLA", label: "First response SLA (%)", numerator: "firstResponseWithinSlaCount", denominator: "firstResponseMeasuredCount", percent: true },
  { id: "resolutionSla", group: "SLA", label: "Resolution SLA (%)", numerator: "resolutionWithinSlaCount", denominator: "resolutionMeasuredCount", percent: true },
  { id: "firstBreaches", group: "SLA", label: "First response breaches", numerator: "firstResponseBreachCount" },
  { id: "resolutionBreaches", group: "SLA", label: "Resolution breaches", numerator: "resolutionBreachCount" },
  { id: "assignmentBreaches", group: "SLA", label: "Assignment breaches", numerator: "assignmentBreachCount" },
  { id: "fcr", group: "Quality", label: "First-contact resolution (%)", numerator: "fcrSolvedCount", denominator: "fcrEligibleCount", percent: true },
  { id: "reopens", group: "Quality", label: "Reopen events", numerator: "reopenCount" },
  { id: "csat", group: "Quality", label: "Positive CSAT (%)", numerator: "csatPositiveCount", denominator: "csatResponseCount", percent: true },
] as const;

type MeasureId = typeof measures[number]["id"];
type MeasureGroup = typeof measures[number]["group"];
type CellGroup = { facts: PivotFact[]; values: Map<MeasureId, number | null> };
type PivotRow = { key: string; label: string; cells: Map<string, CellGroup> };

function localIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatValue(value: number | null, measureId: MeasureId) {
  if (value === null || !Number.isFinite(value)) return "n/a";
  if (measureId === "fcr" || measureId === "firstSla" || measureId === "resolutionSla" || measureId === "csat") {
    return `${value.toFixed(1)}%`;
  }
  if (measureId === "firstReply" || measureId === "nextReply" || measureId === "requestWait"
    || measureId === "resolution" || measureId === "assignmentWait" || measureId === "assignmentAge") {
    return value.toFixed(1);
  }
  return Math.round(value).toLocaleString();
}

function aggregate(facts: PivotFact[], measureId: MeasureId): number | null {
  const measure = measures.find((item) => item.id === measureId)!;
  const numerator = facts.reduce((total, fact) => total + fact[measure.numerator], 0);
  if (!("denominator" in measure)) return numerator;
  const denominator = facts.reduce((total, fact) => total + fact[measure.denominator], 0);
  if (!denominator) return null;
  return "percent" in measure && measure.percent
    ? numerator / denominator * 100
    : numerator / denominator;
}

export default function ReportBuilder() {
  const { user } = useSupportUser();
  const role = String(user?.role ?? "").toLowerCase();
  const canViewReports = role === "admin" || role === "supervisor";
  const today = localIsoDate(new Date());
  const thirtyDaysAgo = localIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [facts, setFacts] = useState<PivotFact[]>([]);
  const [notes, setNotes] = useState<TrackingNotes | null>(null);
  const [rowDimension, setRowDimension] = useState<DimensionId>("organization");
  const [columnDimension, setColumnDimension] = useState<DimensionId | "none">("status");
  const [selectedMeasures, setSelectedMeasures] = useState<MeasureId[]>(["tickets", "solved", "firstSla", "resolutionSla"]);
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  async function loadData() {
    if (!canViewReports) {
      setError("Admin or supervisor access is required to view client and agent performance.");
      setLoading(false);
      return;
    }
    if (!from || !to || from > to) {
      setError("Choose a valid date range.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59.999`).toISOString(),
      });
      const token = localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token");
      const response = await fetch(`/api/reports/pivot-data?${params}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await response.json() as ApiResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Unable to load report data (${response.status})`);
      setFacts(body.rows);
      setNotes(body.trackingNotes);
      setTruncated(body.truncated);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load report data.");
      setFacts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, [canViewReports]);

  const organizations = useMemo(() =>
    [...new Map(facts.map((fact) => [String(fact.organizationId ?? "unassigned"), {
      id: fact.organizationId === null ? "unassigned" : String(fact.organizationId),
      name: fact.organization,
    }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
  [facts]);
  const agents = useMemo(() =>
    [...new Map(facts.map((fact) => [String(fact.agentId ?? "unassigned"), {
      id: fact.agentId === null ? "unassigned" : String(fact.agentId),
      name: fact.agent,
    }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
  [facts]);

  const filteredFacts = useMemo(() => facts.filter((fact) => {
    const matchesOrganization = organizationFilter === "all"
      || String(fact.organizationId ?? "unassigned") === organizationFilter;
    const matchesAgent = agentFilter === "all"
      || String(fact.agentId ?? "unassigned") === agentFilter;
    return matchesOrganization && matchesAgent;
  }), [facts, organizationFilter, agentFilter]);

  const pivot = useMemo(() => {
    const rowGroups = new Map<string, PivotRow>();
    const columnValues = new Set<string>();
    const getDimension = (fact: PivotFact, dimension: DimensionId) => {
      const value = fact[dimension];
      return value === "" || value == null ? "(blank)" : String(value);
    };

    for (const fact of filteredFacts) {
      const rowLabel = getDimension(fact, rowDimension);
      const rowKey = rowLabel;
      const columnKey = columnDimension === "none" ? "All" : getDimension(fact, columnDimension);
      columnValues.add(columnKey);
      let row = rowGroups.get(rowKey);
      if (!row) {
        row = { key: rowKey, label: rowLabel, cells: new Map() };
        rowGroups.set(rowKey, row);
      }
      const cell = row.cells.get(columnKey) ?? { facts: [], values: new Map<MeasureId, number | null>() };
      cell.facts.push(fact);
      row.cells.set(columnKey, cell);
    }

    const sortedColumns = [...columnValues].sort((a, b) => a.localeCompare(b));
    const sortedRows = [...rowGroups.values()].sort((a, b) => a.label.localeCompare(b.label));
    for (const row of sortedRows) {
      for (const [column, cell] of row.cells) {
        for (const measure of selectedMeasures) cell.values.set(measure, aggregate(cell.facts, measure));
        row.cells.set(column, cell);
      }
    }
    return { rows: sortedRows, columns: sortedColumns };
  }, [filteredFacts, rowDimension, columnDimension, selectedMeasures]);

  const columnHeaders = useMemo(() => {
    if (!selectedMeasures.length) return [];
    return pivot.columns.flatMap((column) =>
      selectedMeasures.map((measureId) => ({
        key: `${column}::${measureId}`,
        column,
        measureId,
        label: columnDimension === "none"
          ? measures.find((measure) => measure.id === measureId)!.label
          : `${column} · ${measures.find((measure) => measure.id === measureId)!.label}`,
      })),
    );
  }, [pivot.columns, selectedMeasures, columnDimension]);

  const measureGroups = useMemo(() => {
    const groups = new Map<MeasureGroup, typeof measures[number][]>();
    for (const measure of measures) {
      const group = groups.get(measure.group) ?? [];
      group.push(measure);
      groups.set(measure.group, group);
    }
    return [...groups.entries()];
  }, []);

  function denominatorFor(factsInCell: PivotFact[], measureId: MeasureId) {
    const measure = measures.find((item) => item.id === measureId)!;
    if (!("denominator" in measure)) return null;
    return factsInCell.reduce((total, fact) => total + fact[measure.denominator], 0);
  }

  function drilldownHref(cellFacts: PivotFact[], measureId: MeasureId) {
    const measure = measures.find((item) => item.id === measureId)!;
    const contributingFacts = "denominator" in measure
      ? cellFacts.filter((fact) => fact[measure.denominator] > 0)
      : cellFacts.filter((fact) => fact[measure.numerator] > 0);
    if (!contributingFacts.length) return null;

    const ticketIds = contributingFacts.map((fact) => fact.ticketId);
    const params = new URLSearchParams({
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T23:59:59.999`).toISOString(),
    });
    let selectionToken: string | null = null;
    const ticketIdsValue = ticketIds.join(",");
    if (ticketIdsValue.length <= 1500) {
      params.set("ticketIds", ticketIdsValue);
    } else {
      selectionToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      params.set("reportSelection", selectionToken);
    }
    if (organizationFilter !== "all") {
      if (organizationFilter === "unassigned") params.set("organizationId", "unassigned");
      else params.set("organizationId", organizationFilter);
    }
    if (agentFilter !== "all") {
      if (agentFilter === "unassigned") params.set("assigneeId", "unassigned");
      else params.set("assigneeId", agentFilter);
    }

    for (const dimension of [rowDimension, ...(columnDimension === "none" ? [] : [columnDimension])]) {
      const value = contributingFacts[0][dimension];
      if (dimension === "organization") {
        params.set("organizationId", value === null ? "unassigned" : String(value));
      } else if (dimension === "agent") {
        params.set("assigneeId", value === null ? "unassigned" : String(value));
      } else if (dimension === "createdMonth") {
        params.set("createdMonth", String(value));
      } else if (dimension === "channel") {
        params.set("channel", String(value));
      } else if (dimension === "client" && value) {
        params.set("client", String(value));
      } else if (dimension === "status") {
        params.set("status", String(value));
      } else if (dimension === "priority") {
        params.set("priority", String(value));
      }
    }

    const breachType = measureId === "firstBreaches"
      ? "firstResponse"
      : measureId === "resolutionBreaches"
        ? "resolution"
        : measureId === "assignmentBreaches"
          ? "assignment"
          : null;
    if (breachType) params.set("slaBreach", breachType);
    return { href: `/tickets?${params.toString()}`, ticketIds, selectionToken };
  }

  function exportRows() {
    return [
      [dimensionLabels[rowDimension], ...columnHeaders.map((header) => header.label)],
      ...pivot.rows.map((row) => [
        row.label,
        ...columnHeaders.map((header) => {
          const cell = row.cells.get(header.column);
          const value = cell?.values.get(header.measureId) ?? null;
          if (value === null) return "n/a";
          const denominator = cell ? denominatorFor(cell.facts, header.measureId) : null;
          return denominator === null
            ? formatValue(value, header.measureId)
            : `${formatValue(value, header.measureId)} (n=${denominator})`;
        }),
      ]),
    ];
  }

  function exportCsv() {
    const csv = exportRows().map((row) => row
      .map((value) => `"${String(value).replace(/"/g, "\"\"")}"`)
      .join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "orion-pivot-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportXlsx() {
    const sheet = XLSX.utils.aoa_to_sheet(exportRows());
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Pivot Report");
    XLSX.writeFile(workbook, "orion-pivot-report.xlsx");
  }

  function toggleMeasure(measureId: MeasureId) {
    setSelectedMeasures((current) => current.includes(measureId)
      ? current.filter((item) => item !== measureId)
      : [...current, measureId]);
  }

  return (
    <AppLayout>
      <main className="flex-1 space-y-5 overflow-auto p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="icon" aria-label="Back to reports"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Report Builder</h1>
              <p className="text-sm text-muted-foreground">Explore operational KPIs and client SLA performance with pivot tables.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={loading || !columnHeaders.length}><Download className="mr-2 h-4 w-4" />CSV</Button>
            <Button variant="outline" onClick={exportXlsx} disabled={loading || !columnHeaders.length}><FileSpreadsheet className="mr-2 h-4 w-4" />XLSX</Button>
          </div>
        </header>

        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

        <Card>
          <CardHeader><CardTitle>Report setup</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1 text-xs text-muted-foreground">Created from<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
              <label className="grid gap-1 text-xs text-muted-foreground">Created to<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
              <label className="grid gap-1 text-xs text-muted-foreground">Organization
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
                  <option value="all">All organizations</option>
                  {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Current assignee
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
                  <option value="all">All agents</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>
              <div className="flex items-end"><Button onClick={() => void loadData()} disabled={loading || !from || !to}><RefreshCw className="mr-2 h-4 w-4" />{loading ? "Loading…" : "Refresh data"}</Button></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1 text-xs text-muted-foreground">Pivot rows
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={rowDimension} onChange={(event) => setRowDimension(event.target.value as DimensionId)}>
                  {Object.entries(dimensionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Pivot columns
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={columnDimension} onChange={(event) => setColumnDimension(event.target.value as DimensionId | "none")}>
                  <option value="none">No column grouping</option>
                  {Object.entries(dimensionLabels).filter(([id]) => id !== rowDimension).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Ticket cohort</p>
                <div className="flex flex-wrap gap-1"><Badge variant="outline">{filteredFacts.length.toLocaleString()} tickets</Badge><Badge variant="outline">{pivot.rows.length} row groups</Badge></div>
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Measures</legend>
              <div className="grid gap-4 lg:grid-cols-2">
                {measureGroups.map(([groupName, groupMeasures]) => {
                  const groupIds = groupMeasures.map((measure) => measure.id);
                  const allSelected = groupIds.every((measureId) => selectedMeasures.includes(measureId));
                  return (
                    <section key={groupName} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">{groupName}</h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedMeasures((current) => allSelected
                            ? current.filter((measureId) => !groupIds.includes(measureId))
                            : [...new Set([...current, ...groupIds])])}
                        >
                          {allSelected ? "Clear group" : "Select all"}
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {groupMeasures.map((measure) => (
                          <label key={measure.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={selectedMeasures.includes(measure.id)} onChange={() => toggleMeasure(measure.id)} />
                            {measure.label}
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pivot table</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading report data…</p>
              : !selectedMeasures.length ? <p className="text-sm text-muted-foreground">Select at least one measure.</p>
                : !pivot.rows.length ? <p className="text-sm text-muted-foreground">No tickets found for this date range and filter combination.</p>
                  : (
                    <div className="overflow-auto">
                      <table className="w-full min-w-[700px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50 text-left">
                            <th className="sticky left-0 bg-muted/50 p-3">{dimensionLabels[rowDimension]}</th>
                            {columnHeaders.map((header) => <th key={header.key} className="whitespace-nowrap p-3 text-right">{header.label}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {pivot.rows.map((row) => (
                            <tr key={row.key} className="border-b hover:bg-muted/30">
                              <th scope="row" className="sticky left-0 bg-background p-3 text-left font-medium">{row.label}</th>
                              {columnHeaders.map((header) => {
                                const cell = row.cells.get(header.column);
                                const value = cell?.values.get(header.measureId) ?? null;
                                const denominator = cell ? denominatorFor(cell.facts, header.measureId) : null;
                                const smallSample = denominator !== null && denominator < 5;
                                const drilldown = cell ? drilldownHref(cell.facts, header.measureId) : null;
                                return (
                                  <td
                                    key={header.key}
                                    className={`whitespace-nowrap p-3 text-right tabular-nums ${smallSample ? "text-muted-foreground" : ""}`}
                                    title={smallSample ? `Small sample: n=${denominator}` : undefined}
                                  >
                                    {!cell ? "—" : (
                                      <span className="inline-flex flex-col items-end">
                                        {drilldown ? (
                                          <Link
                                            href={drilldown.href}
                                            onClick={() => {
                                              if (drilldown.selectionToken) {
                                                sessionStorage.setItem(`report-drilldown:${drilldown.selectionToken}`, JSON.stringify(drilldown.ticketIds));
                                              }
                                            }}
                                            className="font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            title="Open the tickets included in this pivot cell"
                                          >
                                            {formatValue(value, header.measureId)}
                                          </Link>
                                        ) : (
                                          <span>{formatValue(value, header.measureId)}</span>
                                        )}
                                        {denominator !== null && (
                                          <span className={`text-[10px] ${smallSample ? "opacity-70" : "text-muted-foreground"}`}>n={denominator}</span>
                                        )}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Legend: “—” means no tickets in that row/column combination; “n/a” means tickets exist but the measure has no eligible observations. Percentages show their denominator as n. Samples below 5 are dimmed.
        </p>
        {truncated && <p role="status" className="text-sm text-amber-700">The report reached the 10,000-ticket limit. Narrow the date range before exporting for complete results.</p>}
        {notes && (
          <Card>
            <CardHeader><CardTitle>Metric definitions &amp; coverage</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>{notes.dateRange}</p>
              <p>{notes.sla}</p>
              <p>{notes.assignmentTime}</p>
              <p>{notes.agentWorkTime}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </AppLayout>
  );
}

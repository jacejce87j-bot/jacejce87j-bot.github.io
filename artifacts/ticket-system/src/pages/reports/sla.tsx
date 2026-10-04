import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download } from "lucide-react";
import { createBrandedPdf, drawBrandedTable, saveBrandedPdf } from "@/lib/branded-report-pdf";

type Metric = {
  id: number | null;
  name: string;
  tickets: number;
  solved: number;
  resolutionBreaches: number;
  assignmentIntervals: number;
  completedAssignments: number;
  resolutionCompliance: number | null;
  firstResponseCompliance: number | null;
  averageAssignmentMinutes: number | null;
  averageAssignedToSolvedMinutes: number | null;
  averageResolutionMinutes: number | null;
  breachReasons: { firstResponse: number; resolution: number; assignment: number };
};

const formatMinutes = (value: number | null) => {
  if (value == null) return "-";
  const days = Math.floor(value / 1440);
  const hours = Math.floor((value % 1440) / 60);
  const minutes = value % 60;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const formatPercent = (value: number | null) => value == null ? "-" : `${value}%`;
const formatReasons = (row: Metric) => {
  const reasons = [
    row.breachReasons.firstResponse ? `First response: ${row.breachReasons.firstResponse}` : "",
    row.breachReasons.resolution ? `Resolution: ${row.breachReasons.resolution}` : "",
    row.breachReasons.assignment ? `Assignment: ${row.breachReasons.assignment}` : "",
  ].filter(Boolean);
  return reasons.length ? reasons.join(" • ") : "-";
};

export default function SlaReports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [organizations, setOrganizations] = useState<Metric[]>([]);
  const [agents, setAgents] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
      const response = await fetch(`/api/reports/sla?${params.toString()}`, { credentials: "include" });
      const responseText = await response.text();
      let body: {
        error?: string;
        organizations?: Metric[];
        agents?: Metric[];
      };
      try {
        body = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          response.ok
            ? "The SLA report returned an invalid response."
            : `SLA report endpoint is unavailable (${response.status}). Restart the API server.`,
        );
      }
      if (!response.ok) throw new Error(body.error ?? `Unable to load SLA report (${response.status})`);
      setOrganizations(body.organizations ?? []);
      setAgents(body.agents ?? []);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Unable to load SLA report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReport(); }, []);

  function exportCsv() {
    const rows = [
      ["Group", "Name", "Tickets", "Solved", "Resolution compliance", "First response compliance", "Breaches", "Breach reasons", "Assignment intervals", "Avg assignment", "Assigned-to-solved", "Avg resolution"],
      ...organizations.map((row) => ["Organization", row.name, row.tickets, row.solved, formatPercent(row.resolutionCompliance), formatPercent(row.firstResponseCompliance), row.resolutionBreaches, formatReasons(row), row.assignmentIntervals, formatMinutes(row.averageAssignmentMinutes), formatMinutes(row.averageAssignedToSolvedMinutes), formatMinutes(row.averageResolutionMinutes)]),
      ...agents.map((row) => ["Agent", row.name, row.tickets, row.solved, formatPercent(row.resolutionCompliance), formatPercent(row.firstResponseCompliance), row.resolutionBreaches, formatReasons(row), row.assignmentIntervals, formatMinutes(row.averageAssignmentMinutes), formatMinutes(row.averageAssignedToSolvedMinutes), formatMinutes(row.averageResolutionMinutes)]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sla-compliance-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    const doc = await createBrandedPdf("SLA Compliance Report");
    const headers = ["Name", "Tickets", "Solved", "Resolution SLA", "First response", "Breaches", "Breach reasons", "Intervals", "Avg assignment", "Assigned to solved", "Avg resolution"];
    const widths = [160, 35, 35, 55, 60, 40, 110, 45, 65, 75, 58];
    const toRows = (rows: Metric[]) => rows.map((row) => [
      row.name,
      String(row.tickets),
      String(row.solved),
      formatPercent(row.resolutionCompliance),
      formatPercent(row.firstResponseCompliance),
      String(row.resolutionBreaches),
      formatReasons(row),
      String(row.assignmentIntervals),
      formatMinutes(row.averageAssignmentMinutes),
      formatMinutes(row.averageAssignedToSolvedMinutes),
      formatMinutes(row.averageResolutionMinutes),
    ]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 37, 63);
    doc.text("Organizations", 32, 102);
    drawBrandedTable(doc, headers, toRows(organizations), widths, 112);
    if (agents.length) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 37, 63);
      doc.text("Agents", 32, 102);
      drawBrandedTable(doc, headers, toRows(agents), widths, 112);
    }
    saveBrandedPdf(doc, "sla-compliance-report.pdf");
  }

  const table = (title: string, rows: Metric[], assignmentLabel: string) => (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left">
            <th className="p-2">Name</th><th className="p-2">Tickets</th><th className="p-2">Solved</th>
            <th className="p-2">Resolution SLA</th><th className="p-2">First response</th>
            <th className="p-2">Breaches</th><th className="p-2">Breach reasons</th><th className="p-2">{assignmentLabel}</th>
            <th className="p-2">Avg assignment</th><th className="p-2">Assigned to solved</th><th className="p-2">Avg resolution</th>
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={`${title}-${row.id ?? row.name}`} className="border-b">
            <td className="p-2 font-medium">{row.name}</td><td className="p-2">{row.tickets}</td><td className="p-2">{row.solved}</td>
            <td className="p-2">{formatPercent(row.resolutionCompliance)}</td><td className="p-2">{formatPercent(row.firstResponseCompliance)}</td>
            <td className="p-2">{row.resolutionBreaches}</td><td className="p-2 text-xs">{formatReasons(row)}</td><td className="p-2">{row.assignmentIntervals}</td>
            <td className="p-2">{formatMinutes(row.averageAssignmentMinutes)}</td><td className="p-2">{formatMinutes(row.averageAssignedToSolvedMinutes)}</td><td className="p-2">{formatMinutes(row.averageResolutionMinutes)}</td>
          </tr>)}</tbody>
        </table>
        {!rows.length && <p className="py-8 text-center text-muted-foreground">No ticket data for this period.</p>}
      </CardContent>
    </Card>
  );

  return <AppLayout><main className="flex-1 space-y-6 overflow-auto p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><Link href="/reports"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div><h1 className="text-2xl font-bold">SLA Compliance</h1><p className="text-sm text-muted-foreground">Compliance by organization and individual agent assignment intervals.</p></div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={exportCsv} disabled={loading}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        <Button variant="outline" onClick={() => void exportPdf()} disabled={loading}><Download className="mr-2 h-4 w-4" />Export PDF</Button>
      </div>
    </div>
    <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
      <label className="text-sm">From<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="text-sm">To<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <Button onClick={() => void loadReport()} disabled={loading}>{loading ? "Loading..." : "Run report"}</Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>
    {table("Organization compliance", organizations, "Tickets")}
    {table("Agent compliance", agents, "Assignment intervals")}
  </main></AppLayout>;
}

import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, RefreshCw } from "lucide-react";

type AgentKpi = {
  agentId: number;
  agentName: string;
  ticketsSolved: number;
  ticketsSolvedPerHour: number;
  firstReplyCount: number;
  averageFirstReplyMinutes: number | null;
  nextReplyCount: number;
  averageNextReplyMinutes: number | null;
  firstContactResolutionRate: number | null;
  averageFullResolutionMinutes: number | null;
  reopenCount: number;
  assignedTickets: number;
  agentWorkTimeMinutes: number | null;
  averageHandleTimeMinutes: number | null;
  utilizationRate: number | null;
};

type AgentKpiReport = {
  overall: {
    firstReplyTimeMinutes: number | null;
    firstReplyCount: number;
    nextReplyTimeMinutes: number | null;
    nextReplyCount: number;
    requestWaitTimeMinutes: number | null;
    fullResolutionTimeMinutes: number | null;
    resolvedTickets: number;
    ticketsSolvedPerHour: number;
    firstContactResolutionRate: number | null;
    firstContactResolutionCount: number;
    reopenRate: number | null;
    reopenCount: number;
    csatPositiveRate: number | null;
    csatResponseCount: number;
    cesAverage: number | null;
    cesResponseCount: number;
    backlog: number;
    agentWorkTimeMinutes: number | null;
    averageHandleTimeMinutes: number | null;
    utilizationRate: number | null;
  };
  agents: AgentKpi[];
  measurementNotes: Record<string, string>;
};

function formatMinutes(value: number | null) {
  if (value === null) return "No data";
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatPercent(value: number | null) {
  return value === null ? "No data" : `${value}%`;
}

function KpiCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function AgentKpisReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<AgentKpiReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59.999`).toISOString(),
      });
      const response = await fetch(getApiUrl(`/api/dashboard/agent-kpis?${params}`), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Report request failed (${response.status})`);
      setReport(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the KPI report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReport(); }, []);

  const overall = report?.overall;
  const unavailable = (value: number | null) => value === null ? "Not tracked yet" : formatMinutes(value);
  const notes = report?.measurementNotes;

  return (
    <AppLayout>
      <main className="flex-1 space-y-6 overflow-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/reports"><Button variant="ghost" size="icon" aria-label="Back to reports"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <div>
              <h1 className="text-2xl font-bold">Agent Performance &amp; Quality</h1>
              <p className="text-sm text-muted-foreground">Operational response, resolution, efficiency, sentiment, and queue KPIs.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">From<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">To<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <Button onClick={() => void loadReport()} disabled={loading || !from || !to}>
              <RefreshCw className="mr-2 h-4 w-4" />{loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>

        {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {overall && <>
          <section aria-label="Response and resolution KPIs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="First Reply Time" value={formatMinutes(overall.firstReplyTimeMinutes)} detail={`${overall.firstReplyCount} public agent first replies; business time`} />
            <KpiCard title="Next Reply Time" value={formatMinutes(overall.nextReplyTimeMinutes)} detail={`${overall.nextReplyCount} customer-to-agent reply intervals`} />
            <KpiCard title="Request Wait Time" value={formatMinutes(overall.requestWaitTimeMinutes)} detail="Average time in new/open status, business time" />
            <KpiCard title="Full Resolution Time" value={formatMinutes(overall.fullResolutionTimeMinutes)} detail={`${overall.resolvedTickets} solved/closed tickets in period`} />
          </section>

          <section aria-label="Agent efficiency KPIs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="First Contact Resolution" value={formatPercent(overall.firstContactResolutionRate)} detail={`${overall.firstContactResolutionCount} solved tickets with agent response`} />
            <KpiCard title="Tickets Solved per Hour" value={overall.ticketsSolvedPerHour.toFixed(2)} detail="Resolved count ÷ elapsed period hours" />
            <KpiCard title="Agent Work Time / AHT" value={unavailable(overall.agentWorkTimeMinutes)} detail={notes?.agentWorkTime ?? "Active work time is not instrumented."} />
            <KpiCard title="Agent Utilization" value={formatPercent(overall.utilizationRate)} detail={notes?.utilization ?? "Work time and scheduled capacity are not instrumented."} />
          </section>

          <section aria-label="Sentiment and queue KPIs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Reopen Rate" value={formatPercent(overall.reopenRate)} detail={`${overall.reopenCount} tickets with recorded reopen transitions`} />
            <KpiCard title="Customer Satisfaction (CSAT)" value={formatPercent(overall.csatPositiveRate)} detail={`${overall.csatResponseCount} recorded good/bad ratings`} />
            <KpiCard title="Customer Effort (CES)" value={overall.cesAverage === null ? "Not tracked yet" : overall.cesAverage.toFixed(1)} detail={notes?.ces ?? "Customer effort scores are not collected."} />
            <KpiCard title="Ticket Backlog" value={String(overall.backlog)} detail="Currently unresolved tickets" />
          </section>

          <Card>
            <CardHeader><CardTitle>Agent breakdown</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-sm">
                <thead><tr className="border-b text-left">
                  <th className="p-2">Agent</th><th className="p-2">Solved</th><th className="p-2">Solved / hour</th>
                  <th className="p-2">Avg first reply</th><th className="p-2">Avg next reply</th>
                  <th className="p-2">FCR</th><th className="p-2">Avg resolution</th>
                  <th className="p-2">Reopens</th><th className="p-2">Backlog assigned</th>
                </tr></thead>
                <tbody>{report?.agents.map((agent) => <tr key={agent.agentId} className="border-b">
                  <td className="p-2 font-medium">{agent.agentName}</td>
                  <td className="p-2">{agent.ticketsSolved}</td><td className="p-2">{agent.ticketsSolvedPerHour.toFixed(2)}</td>
                  <td className="p-2">{formatMinutes(agent.averageFirstReplyMinutes)}</td>
                  <td className="p-2">{formatMinutes(agent.averageNextReplyMinutes)}</td>
                  <td className="p-2">{formatPercent(agent.firstContactResolutionRate)}</td>
                  <td className="p-2">{formatMinutes(agent.averageFullResolutionMinutes)}</td>
                  <td className="p-2">{agent.reopenCount}</td><td className="p-2">{agent.assignedTickets}</td>
                </tr>)}</tbody>
              </table>
              {!report?.agents.length && <p className="py-8 text-center text-muted-foreground">No agent activity for this period.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Metric definitions and data coverage</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{notes?.firstContactResolution}</p>
              <p>{notes?.requestWaitTime}</p>
              <p>{notes?.reopenRate}</p>
              <p>{notes?.csat}</p>
              <p>{notes?.agentWorkTime}</p>
              <p>{notes?.utilization}</p>
              <p>{notes?.ces}</p>
            </CardContent>
          </Card>
        </>}

        {loading && !report && <p className="py-12 text-center text-muted-foreground">Loading KPI report…</p>}
      </main>
    </AppLayout>
  );
}

import { getApiUrl } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSupportUser } from "@/hooks/use-support-user";
import { AlertTriangle, CheckCircle2, Download, FileUp, Search, ShieldCheck, Upload } from "lucide-react";
import { createBrandedPdf, drawBrandedTable, saveBrandedPdf } from "@/lib/branded-report-pdf";

type Severity = "critical" | "warning" | "recent";
type HealthUnit = {
  id: string;
  organizationName: string;
  organizationId: number | null;
  registration: string;
  deviceId: string | null;
  lastUpdateAt: string | null;
  lastStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  offlineDurationText: string;
  offlineDays: number;
  severity: Severity;
  ticketId: number | null;
};
type Rejection = { raw: string; reason: string };
type SortOrder = "offline-desc" | "offline-asc" | "registration" | "organization";

const authHeaders = (): Record<string, string> => {
  const token = typeof window === "undefined"
    ? null
    : localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const severityLabel: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  recent: "Info",
};

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

export default function HealthReportPage() {
  const { user } = useSupportUser();
  const fileInput = useRef<HTMLInputElement>(null);
  const [units, setUnits] = useState<HealthUnit[]>([]);
  const [rejected, setRejected] = useState<Rejection[]>([]);
  const [search, setSearch] = useState("");
  const [organization, setOrganization] = useState("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [sort, setSort] = useState<SortOrder>("offline-desc");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  async function loadUnits() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl("/api/health-reports/units"), { headers: authHeaders() });
      if (!response.ok) throw new Error(`Unable to load health units (${response.status})`);
      const body = await response.json() as { units?: HealthUnit[] };
      setUnits(body.units ?? []);
      setLastSync(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load health units");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUnits();
    const refreshTimer = window.setInterval(() => void loadUnits(), 60_000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const organizations = useMemo(
    () => [...new Set(units.map((unit) => unit.organizationName))].sort((a, b) => a.localeCompare(b)),
    [units],
  );
  const counts = useMemo(() => ({
    total: units.length + rejected.length,
    critical: units.filter((unit) => unit.severity === "critical").length,
    warning: units.filter((unit) => unit.severity === "warning").length,
    recent: units.filter((unit) => unit.severity === "recent").length,
    mapped: units.filter((unit) => unit.organizationId !== null).length,
  }), [units, rejected]);

  const filteredUnits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return units
      .filter((unit) => {
        const searchable = `${unit.organizationName} ${unit.registration} ${unit.deviceId ?? ""} ${unit.address ?? ""}`.toLowerCase();
        return (severity === "all" || unit.severity === severity)
          && (organization === "all" || unit.organizationName === organization)
          && (!query || searchable.includes(query));
      })
      .sort((a, b) => {
        if (sort === "offline-asc") return a.offlineDays - b.offlineDays;
        if (sort === "registration") return a.registration.localeCompare(b.registration);
        if (sort === "organization") return a.organizationName.localeCompare(b.organizationName);
        return b.offlineDays - a.offlineDays;
      });
  }, [units, search, organization, severity, sort]);

  async function importReport(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF health report.");
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(getApiUrl("/api/health-reports"), { method: "POST", headers: authHeaders(), body: form });
      const body = await response.json().catch(() => ({})) as { valid?: number; rejected?: Rejection[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? `Import failed (${response.status})`);
      setRejected(body.rejected ?? []);
      setMessage(`Imported ${body.valid ?? 0} valid units; ${body.rejected?.length ?? 0} rejected.`);
      await loadUnits();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  function exportCsv() {
    const headers = ["Registration", "Device ID", "Organization", "Organization ID", "Offline", "Severity", "Last seen", "Status", "Latitude", "Longitude", "Address"];
    const rows = filteredUnits.map((unit) => [
      unit.registration, unit.deviceId, unit.organizationName, unit.organizationId, unit.offlineDurationText,
      unit.severity, unit.lastUpdateAt, unit.lastStatus, unit.latitude, unit.longitude, unit.address,
    ]);
    const blob = new Blob([[headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vehicle-health-units.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    const doc = await createBrandedPdf("Vehicle Health Report");
    drawBrandedTable(doc,
      ["Organization", "Registration", "Offline", "Severity", "Last seen", "Status", "Address"],
      filteredUnits.map((unit) => [unit.organizationName, unit.registration, unit.offlineDurationText, unit.severity, unit.lastUpdateAt ? new Date(unit.lastUpdateAt).toLocaleString() : "-", unit.lastStatus ?? "-", unit.address ?? "-"]),
      [125, 90, 72, 55, 90, 80, 150],
    );
    saveBrandedPdf(doc, "vehicle-health-report.pdf");
  }

  return (
    <AppLayout>
      <main className="flex-1 space-y-5 overflow-auto bg-muted/20 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Reports / Health Monitor</p>
            <h1 className="text-2xl font-bold tracking-tight">Offline Vehicle Health - Orion Report</h1>
            <p className="text-sm text-muted-foreground">
              {lastSync ? `Last sync ${lastSync.toLocaleTimeString()} • auto-refreshes every minute` : "Waiting for first sync"}
              {user ? ` • ${user.email}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!filteredUnits.length}><Download className="mr-2 h-4 w-4" />CSV</Button>
            <Button variant="outline" onClick={() => void exportPdf()} disabled={!filteredUnits.length}><Download className="mr-2 h-4 w-4" />PDF</Button>
          </div>
        </div>

        <Card className="border-emerald-200 bg-emerald-50/70">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-emerald-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Upload-only validation mode</p>
              <p>Health data is parsed, validated, and stored for review. Ticket creation is intentionally disabled.</p>
            </div>
            <Badge variant="outline" className="ml-auto border-emerald-300 text-emerald-800">No ticket automation</Badge>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["DATA QUALITY", counts.total, `${units.length} valid • ${rejected.length} rejected`, "text-foreground"],
            ["CRITICAL >30D", counts.critical, "Immediate review", "text-red-600"],
            ["WARNING 7-30D", counts.warning, "Follow-up required", "text-amber-600"],
            ["RECENT <7D", counts.recent, "Informational", "text-emerald-600"],
          ].map(([label, value, detail, color]) => (
            <Card key={label}><CardContent className="p-4">
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground">{label}</p>
              <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent></Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className={`border-dashed lg:col-span-2 ${dragging ? "border-primary bg-primary/5" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void importReport(file); }}>
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <div className="rounded-lg bg-primary p-3 text-primary-foreground"><Upload className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="font-semibold">Upload Orion PDF</p><p className="text-sm text-muted-foreground">Drag and drop a PDF here, or browse to parse and validate it.</p></div>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importReport(file); event.currentTarget.value = ""; }} />
              <Button onClick={() => fileInput.current?.click()} disabled={uploading}><FileUp className="mr-2 h-4 w-4" />{uploading ? "Parsing..." : "Upload Orion PDF"}</Button>
            </CardContent>
          </Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Parsing log</CardTitle></CardHeader><CardContent className="pt-0 text-sm">
            <p className="text-muted-foreground">{loading ? "Loading persisted units..." : `${units.length} units loaded from the backend.`}</p>
            {rejected.length > 0 && <p className="mt-2 text-amber-700">{rejected.length} rejected rows available below.</p>}
            {message && <p className="mt-2 text-emerald-700">{message}</p>}
            {error && <p className="mt-2 flex gap-1 text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
          </CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Organization resolution</CardTitle></CardHeader><CardContent className="pt-0">
            <p className="text-2xl font-bold">{counts.mapped} <span className="text-sm font-normal text-muted-foreground">mapped units</span></p>
            <p className="text-xs text-muted-foreground">Numeric organization IDs are shown in the table. Unlinked records remain reviewable.</p>
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Ticket safety</CardTitle></CardHeader><CardContent className="space-y-1 pt-0 text-sm text-muted-foreground">
            <p className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No automatic ticket creation</p>
            <p className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No fake success or fallback IDs</p>
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Validation rules</CardTitle></CardHeader><CardContent className="pt-0 text-xs text-muted-foreground">Fake/test organizations, malformed registrations, invalid dates, and extreme offline durations are rejected.</CardContent></Card>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reg, org, device, address..." /></div>
              <select value={severity} onChange={(event) => setSeverity(event.target.value as Severity | "all")} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All severity</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="recent">Info</option></select>
              <select value={organization} onChange={(event) => setOrganization(event.target.value)} className="h-10 max-w-[220px] rounded-md border bg-background px-3 text-sm"><option value="all">All organizations</option>{organizations.map((name) => <option key={name} value={name}>{name}</option>)}</select>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="offline-desc">Sort: Offline days</option><option value="offline-asc">Sort: Shortest offline</option><option value="registration">Registration A-Z</option><option value="organization">Organization A-Z</option></select>
              <Button variant="outline" onClick={() => void loadUnits()}>Refresh</Button>
            </div>
            <p className="text-xs text-muted-foreground">Showing {filteredUnits.length} / {units.length} valid units • {rejected.length} rejected</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">Registration / device</th><th className="p-3">Organization / ID</th><th className="p-3">Offline</th><th className="p-3">Last seen</th><th className="p-3">Location</th><th className="p-3">Action</th></tr></thead>
                <tbody>{loading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading health units...</td></tr>}
                  {!loading && filteredUnits.map((unit) => <tr key={unit.id} className="border-b last:border-0">
                    <td className="p-3"><p className="font-medium">{unit.registration}</p><p className="text-xs text-muted-foreground"># {unit.deviceId ?? "No device ID"}</p></td>
                    <td className="p-3"><p>{unit.organizationName}</p><Badge variant="outline" className="mt-1 text-[10px]">{unit.organizationId === null ? "Not linked" : `#${unit.organizationId} • exact`}</Badge></td>
                    <td className="p-3"><Badge variant="outline" className={unit.severity === "critical" ? "border-red-200 text-red-700" : unit.severity === "warning" ? "border-amber-200 text-amber-700" : "text-muted-foreground"}>{unit.offlineDays}d • {severityLabel[unit.severity]}</Badge><p className="mt-1 text-xs text-muted-foreground">{unit.offlineDurationText}</p></td>
                    <td className="p-3"><p>{unit.lastUpdateAt ? new Date(unit.lastUpdateAt).toLocaleDateString() : "No data"}</p><p className="text-xs text-muted-foreground">{unit.lastStatus ?? "No status"}</p></td>
                    <td className="max-w-[240px] p-3"><p className="truncate">{unit.address ?? "No address"}</p><p className="text-xs text-muted-foreground">{unit.latitude ?? "—"}, {unit.longitude ?? "—"}</p></td>
                    <td className="p-3"><Button variant="outline" size="sm" disabled title="Ticket creation is disabled during validation">Ticket disabled</Button></td>
                  </tr>)}
                  {!loading && filteredUnits.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No matching health units.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {rejected.length > 0 && <Card><CardHeader><CardTitle className="text-base">Rejected rows</CardTitle></CardHeader><CardContent><div className="space-y-2 text-sm">{rejected.map((row, index) => <div key={`${row.raw}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 p-3"><p className="font-medium">{row.raw}</p><p className="text-amber-800">{row.reason}</p></div>)}</div></CardContent></Card>}
      </main>
    </AppLayout>
  );
}

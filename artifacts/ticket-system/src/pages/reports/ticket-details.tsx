import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createBrandedPdf, drawBrandedTable, saveBrandedPdf } from "@/lib/branded-report-pdf";
import { useSupportUser } from "@/hooks/use-support-user";

type Organization = { id: number; name: string };
type TicketDetailRow = {
  ticketId: number;
  subject: string;
  createdAt: string;
  organizationName: string;
  client: string | null;
  fleetNum: string | null;
  reg: string | null;
  vin: string | null;
  engine: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  odo: string | null;
  deviceId: string | null;
  deviceCellNo: string | null;
  trackingType: string | null;
  trackingImei: string | null;
  trackingCellNum: string | null;
  cameraType: string | null;
  vesaNum: string | null;
  hours: string | null;
  channel: string;
};
type TicketDetailsResponse = {
  from: string;
  to: string;
  total: number;
  truncated: boolean;
  rows: TicketDetailRow[];
};

const pad = (value: number) => String(value).padStart(2, "0");
function toLocalDateTimeInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function safeText(value: string | null | undefined) {
  return value ?? "";
}
function csvCell(value: unknown) {
  const text = String(value ?? "");
  const protectedText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, "\"\"")}"`;
}

const columns = [
  { key: "ticketId", label: "Ticket ID" },
  { key: "createdAt", label: "Created at" },
  { key: "organizationName", label: "Organisation Name" },
  { key: "client", label: "Client" },
  { key: "fleetNum", label: "Fleet Num" },
  { key: "reg", label: "Registration" },
  { key: "vin", label: "VIN" },
  { key: "engine", label: "Engine" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "colour", label: "Colour" },
  { key: "odo", label: "Odometer" },
  { key: "vesaNum", label: "VESA Number" },
  { key: "hours", label: "Hours" },
  { key: "trackingType", label: "Tracking Device Type" },
  { key: "trackingImei", label: "Tracking IMEI" },
  { key: "trackingCellNum", label: "Tracking Cell Number" },
  { key: "cameraType", label: "Camera Device Type" },
  { key: "deviceId", label: "Camera Device ID" },
  { key: "deviceCellNo", label: "Camera Device Cell Number" },
  { key: "channel", label: "Channel" },
  { key: "subject", label: "Ticket subject" },
] as const;

type TicketDetailColumnKey = typeof columns[number]["key"];
type ExportableColumnKey = Exclude<TicketDetailColumnKey, "createdAt">;

export default function TicketDetailsReport() {
  const { user } = useSupportUser();
  const role = String(user?.role ?? "").toLowerCase();
  const canView = role === "admin" || role === "supervisor";
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState(toLocalDateTimeInput(monthAgo));
  const [to, setTo] = useState(toLocalDateTimeInput(now));
  const [organizationId, setOrganizationId] = useState("all");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [rows, setRows] = useState<TicketDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadOrganizations() {
      setLoadingOrganizations(true);
      try {
        const response = await fetch("/api/organizations?limit=500&sortBy=name", {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Unable to load organizations (${response.status})`);
        if (!cancelled) setOrganizations(Array.isArray(body.data) ? body.data : []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load organizations");
      } finally {
        if (!cancelled) setLoadingOrganizations(false);
      }
    }
    void loadOrganizations();
    return () => { cancelled = true; };
  }, []);

  async function loadReport() {
    if (!canView) {
      setError("Admin or supervisor access is required to view ticket-detail reports.");
      return;
    }
    if (!from || !to || new Date(from) > new Date(to)) {
      setError("Choose a valid date and time range.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rangeStart = new Date(from);
      const rangeEnd = new Date(to);
      rangeEnd.setSeconds(59, 999);
      const params = new URLSearchParams({
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
        organizationId,
      });
      const response = await fetch(`/api/reports/ticket-details?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Unable to load ticket-detail report (${response.status})`);
      const report = body as TicketDetailsResponse;
      setRows(report.rows ?? []);
      setTotal(Number(report.total ?? 0));
      setTruncated(Boolean(report.truncated));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load ticket-detail report");
      setRows([]);
      setTotal(0);
      setTruncated(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canView) void loadReport();
  }, [canView]);

  function getExportRows() {
    return [
      columns.map((column) => column.label),
      ...rows.map((row) => columns.map((column) => {
        if (column.key === "createdAt") return new Date(row.createdAt).toLocaleString();
        const key: ExportableColumnKey = column.key;
        if (key === "ticketId") return row.ticketId;
        return safeText(row[key]);
      })),
    ];
  }

  function exportCsv() {
    const csv = getExportRows().map((record) => record.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ticket-details-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportXlsx() {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(getExportRows());
    XLSX.utils.book_append_sheet(workbook, sheet, "Ticket Details");
    XLSX.writeFile(workbook, "ticket-details-report.xlsx");
  }

  async function exportPdf() {
    try {
      const doc = await createBrandedPdf("Ticket Details Report");
      const ticketHeaders = ["Ticket ID", "Created at", "Organisation Name", "Channel", "Ticket subject"];
      drawBrandedTable(
        doc,
        ticketHeaders,
        rows.map((row) => [String(row.ticketId), new Date(row.createdAt).toLocaleString(), row.organizationName, row.channel, row.subject]),
        [48, 100, 140, 80, 300],
      );
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 37, 63);
      doc.text("Vehicle and installation details", 32, 96);
      drawBrandedTable(
        doc,
        ["Ticket ID", "Client", "Fleet Num", "Registration", "VIN", "Engine", "Make", "Model", "Colour", "Odometer", "VESA", "Hours"],
        rows.map((row) => [
          String(row.ticketId), safeText(row.client), safeText(row.fleetNum), safeText(row.reg), safeText(row.vin),
          safeText(row.engine), safeText(row.make), safeText(row.model), safeText(row.colour), safeText(row.odo),
          safeText(row.vesaNum), safeText(row.hours),
        ]),
        [42, 68, 48, 62, 86, 48, 48, 55, 48, 56, 48, 42],
        106,
      );
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 37, 63);
      doc.text("Device details", 32, 96);
      drawBrandedTable(
        doc,
        ["Ticket ID", "Tracking Device Type", "Tracking IMEI", "Tracking Cell Number", "Camera Device Type", "Camera Device ID", "Camera Device Cell Number"],
        rows.map((row) => [
          String(row.ticketId), safeText(row.trackingType), safeText(row.trackingImei), safeText(row.trackingCellNum),
          safeText(row.cameraType), safeText(row.deviceId), safeText(row.deviceCellNo),
        ]),
        [52, 105, 105, 105, 105, 105, 105],
        106,
      );
      saveBrandedPdf(doc, "ticket-details-report.pdf");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export PDF report");
    }
  }

  return (
    <AppLayout>
      <main className="flex-1 space-y-5 overflow-auto p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="icon" aria-label="Back to reports"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Ticket Details Report</h1>
              <p className="text-sm text-muted-foreground">Find tickets by organization and creation date/time; review device types and channel.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={loading || rows.length === 0}><Download className="mr-2 h-4 w-4" />CSV</Button>
            <Button variant="outline" onClick={exportXlsx} disabled={loading || rows.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />XLSX</Button>
            <Button variant="outline" onClick={() => void exportPdf()} disabled={loading || rows.length === 0}><FileText className="mr-2 h-4 w-4" />PDF</Button>
          </div>
        </header>

        {!canView && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Admin or supervisor access is required to view ticket-detail reports.</p>}
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

        <Card>
          <CardHeader><CardTitle>Report filters</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">Created from
              <Input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">Created to
              <Input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">Organization
              <select
                className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                disabled={loadingOrganizations}
              >
                <option value="all">All organizations</option>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>
            <Button onClick={() => void loadReport()} disabled={!canView || loading || loadingOrganizations}>
              <RefreshCw className="mr-2 h-4 w-4" />{loading ? "Loading…" : "Run report"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ticket records · {total.toLocaleString()}</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading ticket details…</p> : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets found for the selected organization and date/time range.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full min-w-[1800px] border-collapse text-sm">
                  <thead><tr className="border-b bg-muted/50 text-left">
                    {columns.map((column) => <th key={column.key} className="whitespace-nowrap p-3">{column.label}</th>)}
                  </tr></thead>
                  <tbody>{rows.map((row) => (
                    <tr key={row.ticketId} className="border-b align-top">
                      {columns.map((column) => {
                        const value = column.key === "ticketId"
                          ? `#${row.ticketId}`
                          : column.key === "createdAt"
                            ? new Date(row.createdAt).toLocaleString()
                            : column.key === "organizationName"
                              ? row.organizationName || "Unassigned"
                              : column.key === "channel"
                                ? row.channel || "—"
                                : row[column.key] || "—";
                        return <td key={`${row.ticketId}-${column.key}`} className="whitespace-nowrap p-3">{value}</td>;
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        {truncated && <p role="status" className="text-sm text-amber-700">Showing the first 10,000 of {total.toLocaleString()} tickets. Narrow the date/time range to export the complete result set.</p>}
      </main>
    </AppLayout>
  );
}

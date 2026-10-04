import { getApiUrl } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { createBrandedPdf, drawBrandedTable, saveBrandedPdf } from "@/lib/branded-report-pdf";

type TicketReportRow = {
  id: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  client?: string | null;
  fleetNum?: string | null;
  reg?: string | null;
  vin?: string | null;
  engine?: string | null;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  odo?: string | null;
  deviceId?: string | null;
  deviceCellNo?: string | null;
  deviceType?: string | null;
  trackingImei?: string | null;
  trackingCellNum?: string | null;
  trackingType?: string | null;
};

const installationColumns = [
  { key: "client", label: "Client" },
  { key: "fleetNum", label: "Fleet Num" },
  { key: "reg", label: "Reg" },
  { key: "vin", label: "VIN" },
  { key: "engine", label: "Engine" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "colour", label: "Colour" },
  { key: "odo", label: "ODO" },
  { key: "deviceId", label: "Device ID" },
  { key: "deviceCellNo", label: "Device Cell No" },
  { key: "deviceType", label: "Device Type" },
  { key: "trackingImei", label: "Tracking IMEI" },
  { key: "trackingCellNum", label: "Tracking Cell Num" },
  { key: "trackingType", label: "Tracking Type" },
] as const;

const safeText = (value: unknown) => value == null ? "" : String(value);

export default function Reports() {
  const [rows, setRows] = useState<TicketReportRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadTickets() {
      try {
        setIsLoading(true);
        const url = new URL("/api/tickets", window.location.origin);
        url.searchParams.set("limit", "5000");
        url.searchParams.set("sortBy", "createdAt");
        url.searchParams.set("sortDir", "desc");
        if (search.trim()) url.searchParams.set("q", search.trim());

        const response = await fetch(url.toString(), { credentials: "include" });
        if (!response.ok) throw new Error("Unable to load tickets");
        const payload = await response.json();
        if (!ignore) {
          const data = Array.isArray(payload?.data) ? payload.data : [];
          setRows(data.map((ticket: any) => ({
            id: Number(ticket.id),
            subject: ticket.subject ?? "",
            status: ticket.status ?? "open",
            priority: ticket.priority ?? "normal",
            createdAt: ticket.createdAt ?? new Date().toISOString(),
            client: ticket.client ?? null,
            fleetNum: ticket.fleetNum ?? null,
            reg: ticket.reg ?? null,
            vin: ticket.vin ?? null,
            engine: ticket.engine ?? null,
            make: ticket.make ?? null,
            model: ticket.model ?? null,
            colour: ticket.colour ?? null,
            odo: ticket.odo ?? null,
            deviceId: ticket.deviceId ?? null,
            deviceCellNo: ticket.deviceCellNo ?? null,
            deviceType: ticket.deviceType ?? null,
            trackingImei: ticket.trackingImei ?? null,
            trackingCellNum: ticket.trackingCellNum ?? null,
            trackingType: ticket.trackingType ?? null,
          })));
        }
      } catch (error) {
        if (!ignore) setRows([]);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void loadTickets();
    return () => {
      ignore = true;
    };
  }, [search]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const haystack = [
        row.subject,
        row.client,
        row.fleetNum,
        row.reg,
        row.vin,
        row.engine,
        row.make,
        row.model,
        row.colour,
        row.odo,
        row.deviceId,
        row.deviceCellNo,
        row.deviceType,
        row.trackingImei,
        row.trackingCellNum,
        row.trackingType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery = !search.trim() || haystack.includes(search.trim().toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [rows, search, statusFilter]);

  const exportWorkbook = () => {
    const workbookRows = filteredRows.map((row) => ({
      ID: row.id,
      Subject: row.subject,
      Status: row.status,
      Priority: row.priority,
      Created: row.createdAt,
      ...(Object.fromEntries(installationColumns.map((column) => [column.label, safeText(row[column.key])]))),
    }));

    const sheet = XLSX.utils.json_to_sheet(workbookRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Historical Tickets");
    XLSX.writeFile(workbook, "historical-tickets.xlsx");
  };

  const exportPdf = async () => {
    const doc = await createBrandedPdf("Historical Tickets Report");
    const headers = ["ID", "Subject", "Status", "Priority", "Created", ...installationColumns.map((column) => column.label)];
    const rows = filteredRows.map((row) => [
      String(row.id), row.subject, row.status, row.priority, new Date(row.createdAt).toLocaleDateString(),
      ...installationColumns.map((column) => safeText(row[column.key])),
    ]);
    drawBrandedTable(doc, headers, rows, [30, 90, 40, 40, 45, ...installationColumns.map(() => 35)]);
    saveBrandedPdf(doc, "historical-tickets.pdf");
  };

  return (
    <AppLayout>
      <div className="flex-1 p-6 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">Search historical tickets and export the installation data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/reports/organizations">
              <Button variant="outline">Organization Reports</Button>
            </Link>
            <Link href="/reports/sla">
              <Button variant="outline">SLA Compliance</Button>
            </Link>
            <Link href="/reports/agent-kpis">
              <Button variant="outline">Agent Performance &amp; Quality</Button>
            </Link>
            <Link href="/reports/builder">
              <Button variant="outline">Report Builder</Button>
            </Link>
            <Link href="/reports/ticket-details">
              <Button variant="outline">Ticket Details</Button>
            </Link>
            <Button variant="outline" onClick={exportWorkbook}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export XLSX
            </Button>
            <Button variant="outline" onClick={exportPdf}>
              <FileText className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by subject, client, VIN, reg, device, or type"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="solved">Solved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  {installationColumns.map((column) => (
                    <th key={column.key} className="px-4 py-3 font-medium whitespace-nowrap">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={12 + installationColumns.length} className="px-4 py-10 text-center text-muted-foreground">
                      Loading reports…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12 + installationColumns.length} className="px-4 py-10 text-center text-muted-foreground">
                      No matching historical tickets found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 font-medium">#{row.id}</td>
                      <td className="px-4 py-3">{row.subject}</td>
                      <td className="px-4 py-3 capitalize">{row.status}</td>
                      <td className="px-4 py-3 capitalize">{row.priority}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                      {installationColumns.map((column) => (
                        <td key={`${row.id}-${column.key}`} className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {safeText(row[column.key]) || "—"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-end text-sm text-muted-foreground">
          {filteredRows.length} records
        </div>
      </div>
    </AppLayout>
  );
}

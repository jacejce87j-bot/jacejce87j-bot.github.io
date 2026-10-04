import { getApiUrl } from "@/lib/api";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import type { TicketPriority, TicketStatus } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { Search, Plus, Filter, ArrowUpDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type TicketListRow = {
  id: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  requester?: { name: string } | null;
  assignee?: { name: string } | null;
  updatedAt: string;
  routingReason?: string | null;
};

type TicketListResponse = {
  data: TicketListRow[];
  total: number;
  page: number;
  limit: number;
};

function readReportSelection(params: URLSearchParams) {
  const token = params.get("reportSelection");
  if (!token) return { token: "", ticketIds: null as number[] | null, error: null as string | null };
  const serialized = sessionStorage.getItem(`report-drilldown:${token}`);
  if (!serialized) {
    return { token, ticketIds: null, error: "This report selection is no longer available. Return to the report and open the cell again." };
  }
  try {
    const ticketIds: unknown = JSON.parse(serialized);
    if (!Array.isArray(ticketIds) || ticketIds.length > 10000 || ticketIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      return { token, ticketIds: null, error: "The report selection is invalid. Return to the report and open the cell again." };
    }
    return { token, ticketIds: ticketIds as number[], error: null };
  } catch {
    return { token, ticketIds: null, error: "The report selection is invalid. Return to the report and open the cell again." };
  }
}

export default function TicketList() {
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const [reportSelection] = useState(() => readReportSelection(initialParams));
  const [page, setPage] = useState(() => Math.max(1, Number(initialParams.get("page")) || 1));
  const [status, setStatus] = useState<TicketStatus | "all">(() => {
    const value = initialParams.get("status");
    return ["open", "pending", "on_hold", "solved", "closed"].includes(value ?? "") ? value as TicketStatus : "all";
  });
  const [search, setSearch] = useState(() => initialParams.get("q") ?? "");
  const [priority, setPriority] = useState(() => initialParams.get("priority") ?? "");
  const [organizationId] = useState(() => initialParams.get("organizationId") ?? "");
  const [assigneeId] = useState(() => initialParams.get("assigneeId") ?? "");
  const [ticketIds] = useState(() => initialParams.get("ticketIds") ?? "");
  const [slaBreach] = useState(() => initialParams.get("slaBreach") ?? "");
  const [from] = useState(() => initialParams.get("from") ?? "");
  const [to] = useState(() => initialParams.get("to") ?? "");
  const [channel] = useState(() => initialParams.get("channel") ?? "");
  const [client] = useState(() => initialParams.get("client") ?? "");
  const [createdMonth] = useState(() => initialParams.get("createdMonth") ?? "");

  const filters = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (status !== "all") params.set("status", status);
    if (search) params.set("q", search);
    if (priority) params.set("priority", priority);
    if (organizationId) params.set("organizationId", organizationId);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (ticketIds) params.set("ticketIds", ticketIds);
    if (slaBreach) params.set("slaBreach", slaBreach);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (channel) params.set("channel", channel);
    if (client) params.set("client", client);
    if (createdMonth) params.set("createdMonth", createdMonth);
    return params.toString();
  }, [page, status, search, priority, organizationId, assigneeId, ticketIds, slaBreach, from, to, channel, client, createdMonth]);

  const { data, isLoading, isError, error } = useQuery<TicketListResponse>({
    queryKey: ["/api/tickets", filters, reportSelection.token],
    queryFn: async () => {
      if (reportSelection.error) throw new Error(reportSelection.error);
      const token = localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token");
      const response = await fetch(reportSelection.ticketIds ? `/api/tickets/search?${filters}` : `/api/tickets?${filters}`, {
        credentials: "include",
        method: reportSelection.ticketIds ? "POST" : "GET",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(reportSelection.ticketIds ? { "Content-Type": "application/json" } : {}),
        },
        body: reportSelection.ticketIds ? JSON.stringify({ ticketIds: reportSelection.ticketIds }) : undefined,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Unable to load tickets (${response.status})`);
      return body as TicketListResponse;
    },
  });

  const getStatusColor = (status: TicketStatus) => {
    switch(status) {
      case 'open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'solved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getPriorityIcon = (priority: TicketPriority) => {
    switch(priority) {
      case 'urgent': return <span className="text-red-500 font-bold text-lg leading-none">!!</span>;
      case 'high': return <ArrowUpDown className="h-3 w-3 text-orange-500 transform rotate-180" />;
      case 'normal': return <ArrowUpDown className="h-3 w-3 text-blue-500" />;
      case 'low': return <ArrowUpDown className="h-3 w-3 text-gray-500" />;
      default: return null;
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Tickets</h2>
            <p className="text-muted-foreground">Manage and resolve customer requests.</p>
          </div>
          <Link href="/tickets/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Ticket
            </Button>
          </Link>
        </div>

        {reportSelection.error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <span>{reportSelection.error}</span>
            <Link href="/reports/builder">
              <Button variant="outline">Return to Report Builder</Button>
            </Link>
          </div>
        )}

        {(slaBreach || ticketIds || reportSelection.token || organizationId || assigneeId || createdMonth) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <span>
              Pivot drill-down
              {slaBreach && ` · ${slaBreach.replace(/([A-Z])/g, " $1").toLowerCase()} SLA breaches`}
              {organizationId && ` · organization #${organizationId}`}
              {assigneeId && ` · assignee #${assigneeId}`}
              {createdMonth && ` · created ${createdMonth}`}
              {(ticketIds || reportSelection.ticketIds) && ` · ${ticketIds ? ticketIds.split(",").length : reportSelection.ticketIds?.length} matching tickets`}
            </span>
            <Button size="sm" variant="outline" onClick={() => { window.location.href = "/tickets"; }}>Clear report filters</Button>
          </div>
        )}

        <Card className="p-4">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tickets..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={status} onValueChange={(value) => { setStatus(value as TicketStatus | "all"); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="solved">Solved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              {data?.total || 0} tickets
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-destructive">{error instanceof Error ? error.message : "Unable to load tickets."}</TableCell>
                  </TableRow>
                ) : data?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No tickets found.</TableCell>
                  </TableRow>
                ) : (
                  data?.data.map((ticket) => (
                    <TableRow key={ticket.id} className="hover:bg-muted/50 cursor-pointer group">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <Link href={`/tickets/${ticket.id}`} className="hover:underline">#{ticket.id}</Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getPriorityIcon(ticket.priority)}
                          <Link href={`/tickets/${ticket.id}`} className="font-medium group-hover:text-primary transition-colors">
                            {ticket.subject}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        {ticket.requester ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px]">{getInitials(ticket.requester.name)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{ticket.requester.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ticket.assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {getInitials(ticket.assignee.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{ticket.assignee.name}</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground text-sm italic">Unassigned</span>
                            {String(ticket.routingReason ?? "").includes("No online") && <Badge variant="destructive">No online agents</Badge>}
                            {String(ticket.routingReason ?? "").includes("Awaiting") && <Badge variant="outline">Awaiting manual assignment</Badge>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`capitalize ${getStatusColor(ticket.status)}`}>
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatRelativeTime(ticket.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {data && data.total > data.limit && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <div className="text-sm text-muted-foreground">
                Page {page} of {Math.ceil(data.total / data.limit)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(data.total / data.limit)}
              >
                Next
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}

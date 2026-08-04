import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListTickets, getListTicketsQueryKey } from "@workspace/api-client-react";
import { TicketStatus, TicketPriority } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { Search, Plus, Filter, ArrowUpDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function TicketList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [search, setSearch] = useState("");
  
  const { data, isLoading } = useListTickets({ 
    page, 
    limit: 25, 
    ...(status !== "all" ? { status } : {}),
    ...(search ? { q: search } : {})
  }, { 
    query: { 
      queryKey: getListTicketsQueryKey({ page, limit: 25, ...(status !== "all" ? { status } : {}), ...(search ? { q: search } : {}) }) 
    } 
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
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
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
                          <span className="text-muted-foreground text-sm italic">Unassigned</span>
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
                onClick={() => setPage(p => Math.max(1, p - 1))}
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
                onClick={() => setPage(p => p + 1)}
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

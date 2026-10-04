import { getApiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { 
  useGetDashboardStats, 
  useGetDashboardActivity, 
  useGetTicketVolume, 
  useGetAgentWorkload, 
  useGetSlaHealth 
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from "recharts";
import { 
  Ticket, CheckCircle2, Clock, AlertTriangle, 
  Activity, ArrowUpRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats } = useGetDashboardStats();
  const { data: activity } = useGetDashboardActivity({ limit: 10 });
  const { data: volume } = useGetTicketVolume();
  const { data: workload } = useGetAgentWorkload();
  const { data: sla } = useGetSlaHealth();
  const { data: routingStatus } = useQuery<{ onCall: { name: string; isOnline: boolean } | null; backup: { name: string; isOnline: boolean } | null }>({ queryKey: ["/api/dashboard/routing-status"], queryFn: async () => {
    const response = await fetch(getApiUrl("/api/dashboard/routing-status"), { credentials: "include" });
    if (!response.ok) throw new Error("Unable to load routing status");
    return response.json();
  } });

  const slaData = sla ? [
    { name: "On Track", value: sla.onTrack, color: "hsl(var(--chart-2))" },
    { name: "At Risk", value: sla.atRisk, color: "hsl(var(--chart-3))" },
    { name: "Breached", value: sla.breached, color: "hsl(var(--chart-4))" },
  ] : [];

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        </div>

        {/* Stats Row */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.openTickets || 0}</div>
              <p className="text-xs text-muted-foreground">Requires attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingTickets || 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting reply</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Solved Today</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.solvedToday || 0}</div>
              <p className="text-xs text-muted-foreground">Great work!</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Urgent</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats?.urgentTickets || 0}</div>
              <p className="text-xs text-muted-foreground">Highest priority</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div><CardTitle>Routing status</CardTitle><CardDescription>Current primary and fallback availability</CardDescription></div>
            <Link href="/settings" className="text-sm text-primary hover:underline">Manage</Link>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[["On-call", routingStatus?.onCall], ["Backup", routingStatus?.backup]].map(([label, agent]) => (
              <div key={label as string} className="flex items-center justify-between rounded-md border p-3">
                <div><p className="text-xs text-muted-foreground">{label as string}</p><p className="font-medium">{(agent as { name: string } | null)?.name ?? "Not configured"}</p></div>
                <Badge variant={(agent as { isOnline: boolean } | null)?.isOnline ? "default" : "secondary"}>{(agent as { isOnline: boolean } | null)?.isOnline ? "Online" : "Offline"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          {/* Main Chart */}
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Ticket Volume</CardTitle>
              <CardDescription>Created vs Solved over the last 14 days</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={volume}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                      labelFormatter={(val) => new Date(val).toLocaleDateString()}
                    />
                    <Line type="monotone" dataKey="created" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} name="Created" />
                    <Line type="monotone" dataKey="solved" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} name="Solved" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {activity?.map((event) => (
                  <div key={event.id} className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {event.agentName || "System"} {event.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatRelativeTime(event.createdAt)}</span>
                        {event.ticketId && (
                          <>
                            <span>•</span>
                            <a href={`/tickets/${event.ticketId}`} className="hover:underline flex items-center">
                              #{event.ticketId}
                              <ArrowUpRight className="h-3 w-3 ml-1" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          {/* Agent Workload */}
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Agent Workload</CardTitle>
              <CardDescription>Open tickets by assignee</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={workload} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis dataKey="agentName" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }} />
                    <Bar dataKey="openCount" stackId="a" fill="hsl(var(--chart-1))" name="Open" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="urgentCount" stackId="a" fill="hsl(var(--chart-4))" name="Urgent" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* SLA Health */}
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>SLA Health</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center items-center">
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slaData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {slaData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

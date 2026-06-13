import { AppLayout } from "@/components/layout";
import { useListAgents, getListAgentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AgentList() {
  const { data: agents, isLoading } = useListAgents({ 
    query: { 
      queryKey: getListAgentsQueryKey() 
    } 
  });

  return (
    <AppLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Agents</h2>
            <p className="text-muted-foreground">Your support team members.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading agents...</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {agents?.map((agent) => (
              <Card key={agent.id} className="overflow-hidden">
                <div className="h-16 bg-muted"></div>
                <div className="px-6 relative">
                  <Avatar className="h-16 w-16 absolute -top-8 border-4 border-card">
                    {agent.avatarUrl && <AvatarImage src={agent.avatarUrl} alt={agent.name} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">
                      {getInitials(agent.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex justify-end pt-2">
                    <Badge variant={agent.isOnline ? "default" : "secondary"} className={agent.isOnline ? "bg-green-500 hover:bg-green-600 text-white" : ""}>
                      {agent.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="pt-2 pb-2">
                  <CardTitle className="text-xl">{agent.name}</CardTitle>
                  <div className="text-sm text-muted-foreground">{agent.email}</div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                    <div className="text-sm">
                      <span className="text-muted-foreground mr-2">Role:</span>
                      <span className="font-medium capitalize">{agent.role}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground mr-2">Open Tickets:</span>
                      <span className="font-medium">{agent.openTicketCount || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

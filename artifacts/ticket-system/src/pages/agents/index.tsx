import { getApiUrl } from "@/lib/api";
import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListAgents, getListAgentsQueryKey, useCreateAgent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AgentList() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "agent" });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: agents, isLoading } = useListAgents({ 
    query: { 
      queryKey: getListAgentsQueryKey() 
    } 
  });
  const createAgent = useCreateAgent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        setForm({ name: "", email: "", role: "agent" });
        setOpen(false);
        toast({ title: "Agent added", description: "The new team member is ready to be assigned tickets." });
      },
      onError: () => toast({ title: "Could not add agent", description: "Check the required fields and try again.", variant: "destructive" }),
    },
  });

  const handleDeleteAgent = async (agentId: number) => {
    const ok = window.confirm("Delete this agent?");
    if (!ok) return;

    try {
      const response = await fetch(getApiUrl(`/api/agents/${agentId}`), { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Could not delete agent");
      }
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      toast({ title: "Agent deleted" });
    } catch (error: any) {
      toast({ title: "Delete failed", description: error?.message || "Could not delete this agent.", variant: "destructive" });
    }
  };

  const handlePresenceChange = async (agentId: number, isOnline: boolean) => {
    try {
      const response = await fetch(getApiUrl(`/api/agents/${agentId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline }),
      });
      if (!response.ok) throw new Error("Could not update agent availability");
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      toast({ title: isOnline ? "Agent marked online" : "Agent marked offline" });
    } catch (error) {
      toast({ title: "Availability update failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Agents</h2>
            <p className="text-muted-foreground">Create and manage the people who work your support queue.</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add agent</Button>
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
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-border gap-3">
                    <div className="text-sm">
                      <span className="text-muted-foreground mr-2">Role:</span>
                      <span className="font-medium capitalize">{agent.role}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground mr-2">Open Tickets:</span>
                      <span className="font-medium">{agent.openTicketCount || 0}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" size="sm" className="mr-2" onClick={() => void handlePresenceChange(agent.id, !agent.isOnline)}>
                      Mark {agent.isOnline ? "offline" : "online"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteAgent(agent.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add agent</DialogTitle>
            <DialogDescription>Invite a support team member by adding their name, email, and role.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="agent-name">Name *</Label>
              <Input id="agent-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jordan Lee" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agent-email">Email *</Label>
              <Input id="agent-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jordan@example.com" />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={createAgent.isPending || !form.name.trim() || !form.email.trim()}
              onClick={() => createAgent.mutate({ data: { name: form.name.trim(), email: form.email.trim(), role: form.role as "agent" | "admin" | "supervisor" } })}
            >
              {createAgent.isPending ? "Adding..." : "Add agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@workspace/replit-auth-web";
import { useCreateSlaPolicy, useListSlaPolicies, useUpdateSlaPolicy, getListSlaPoliciesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Clock3, LogIn, Plus, Save } from "lucide-react";

export default function Settings() {
  const { user, isLoading: isAuthLoading, login } = useAuth();
  const { data: policies, isLoading: isPoliciesLoading } = useListSlaPolicies();
  const [form, setForm] = useState({ name: "", priority: "normal", firstResponseMinutes: "60", resolutionMinutes: "1440" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createPolicy = useCreateSlaPolicy({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSlaPoliciesQueryKey() });
        setForm({ name: "", priority: "normal", firstResponseMinutes: "60", resolutionMinutes: "1440" });
        toast({ title: "SLA policy added" });
      },
      onError: () => toast({ title: "Could not save SLA policy", description: "Admin access is required.", variant: "destructive" }),
    },
  });
  const updatePolicy = useUpdateSlaPolicy({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSlaPoliciesQueryKey() });
        setEditingId(null);
        toast({ title: "SLA policy updated" });
      },
      onError: () => toast({ title: "Could not update SLA policy", description: "Admin access is required.", variant: "destructive" }),
    },
  });
  const isAdmin = user?.role === "admin";

  const startEditing = (policy: NonNullable<typeof policies>[number]) => {
    setEditingId(policy.id);
    setForm({
      name: policy.name,
      priority: policy.priority,
      firstResponseMinutes: String(policy.firstResponseMinutes),
      resolutionMinutes: String(policy.resolutionMinutes),
    });
  };

  const savePolicy = () => {
    const data = {
      name: form.name.trim(),
      priority: form.priority as "low" | "normal" | "high" | "urgent",
      firstResponseMinutes: Number(form.firstResponseMinutes),
      resolutionMinutes: Number(form.resolutionMinutes),
    };
    if (!data.name || data.firstResponseMinutes < 1 || data.resolutionMinutes < 1) return;
    if (editingId) updatePolicy.mutate({ id: editingId, data });
    else createPolicy.mutate({ data });
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-4 p-8 pt-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
            <p className="text-muted-foreground">Manage your account settings and preferences.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your personal information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="Admin User" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue="admin@example.com" />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /> SLA policies</CardTitle>
                <CardDescription>Set first-response and resolution targets by ticket priority.</CardDescription>
              </div>
              {!isAuthLoading && !user && <Button variant="outline" onClick={login}><LogIn className="mr-2 h-4 w-4" /> Sign in to manage</Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {isAuthLoading ? <div className="text-sm text-muted-foreground">Checking administrator access...</div> : !user ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Sign in with your support account to configure SLA policies.</div>
            ) : !isAdmin ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Only administrators can create or change SLA policies.</div>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium">{editingId ? "Edit policy" : "Add policy"}</h3>
                    {editingId && <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setForm({ name: "", priority: "normal", firstResponseMinutes: "60", resolutionMinutes: "1440" }); }}>Cancel edit</Button>}
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="grid gap-2 md:col-span-2"><Label htmlFor="sla-name">Policy name</Label><Input id="sla-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Urgent customer issue" /></div>
                    <div className="grid gap-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
                    <div className="grid gap-2"><Label htmlFor="sla-first">First response (min)</Label><Input id="sla-first" type="number" min="1" value={form.firstResponseMinutes} onChange={(e) => setForm({ ...form, firstResponseMinutes: e.target.value })} /></div>
                    <div className="grid gap-2"><Label htmlFor="sla-resolution">Resolution (min)</Label><Input id="sla-resolution" type="number" min="1" value={form.resolutionMinutes} onChange={(e) => setForm({ ...form, resolutionMinutes: e.target.value })} /></div>
                    <div className="flex items-end md:col-span-3"><Button onClick={savePolicy} disabled={createPolicy.isPending || updatePolicy.isPending || !form.name.trim()}><Save className="mr-2 h-4 w-4" /> {editingId ? "Save changes" : "Add policy"}</Button></div>
                  </div>
                </div>
                <div className="space-y-3">
                  {isPoliciesLoading ? <div className="text-sm text-muted-foreground">Loading policies...</div> : policies?.length ? policies.map((policy) => (
                    <div key={policy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                      <div className="min-w-[180px]"><div className="font-medium">{policy.name}</div><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="capitalize">{policy.priority}</Badge><span>{policy.firstResponseMinutes} min first response</span><span>•</span><span>{policy.resolutionMinutes} min resolution</span></div></div>
                      <div className="flex items-center gap-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={policy.isActive} onCheckedChange={(isActive) => updatePolicy.mutate({ id: policy.id, data: { isActive } })} /> {policy.isActive ? "Active" : "Inactive"}</div><Button variant="outline" size="sm" onClick={() => startEditing(policy)}>Edit</Button></div>
                    </div>
                  )) : <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground"><Plus className="mx-auto mb-2 h-4 w-4" />No SLA policies yet.</div>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

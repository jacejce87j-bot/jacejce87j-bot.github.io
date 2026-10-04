import { getApiUrl } from "@/lib/api";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSupportUser } from "@/hooks/use-support-user";
import {
  useCreateSlaPolicy,
  useListSlaPolicies,
  useUpdateSlaPolicy,
  getListSlaPoliciesQueryKey,
  useCreateTicketTemplate,
  useListTicketTemplates,
  useUpdateTicketTemplate,
  useDeleteTicketTemplate,
  getListTicketTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Clock3, FileText, Plus, Save, Trash2 } from "lucide-react";

export default function Settings() {
  const { user, isLoading: isAuthLoading } = useSupportUser();
  const { data: policies, isLoading: isPoliciesLoading } = useListSlaPolicies();
  const { data: templates, isLoading: isTemplatesLoading } = useListTicketTemplates();
  const [form, setForm] = useState({ name: "", priority: "normal", firstResponseMinutes: "60", resolutionMinutes: "1440" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "" });
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [macros, setMacros] = useState<Array<{ id: number; name: string; content: string; scope: string; isActive: boolean }>>([]);
  const [macroAnalytics, setMacroAnalytics] = useState<Array<{ macroId: number; name: string; scope: string | null; usageCount: number; lastUsedAt: string | null }>>([]);
  const [macroForm, setMacroForm] = useState({ name: "", content: "", scope: "all" });
  const [routingAgents, setRoutingAgents] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [onCallAgentId, setOnCallAgentId] = useState("");
  const [backupAgentId, setBackupAgentId] = useState("");
  const [routingSaving, setRoutingSaving] = useState(false);
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
  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateForm({ name: "", description: "" });
  };
  const createTemplate = useCreateTicketTemplate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTicketTemplatesQueryKey() });
        resetTemplateForm();
        toast({ title: "Template added" });
      },
      onError: () => toast({ title: "Could not save template", description: "Admin access is required.", variant: "destructive" }),
    },
  });
  const updateTemplate = useUpdateTicketTemplate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTicketTemplatesQueryKey() });
        resetTemplateForm();
        toast({ title: "Template updated" });
      },
      onError: () => toast({ title: "Could not update template", description: "Admin access is required.", variant: "destructive" }),
    },
  });
  const deleteTemplate = useDeleteTicketTemplate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTicketTemplatesQueryKey() });
        toast({ title: "Template deleted" });
      },
      onError: () => toast({ title: "Could not delete template", description: "Admin access is required.", variant: "destructive" }),
    },
  });
  const normalizedRole = String(user?.role ?? "").trim().toLowerCase();
  const isAdmin = normalizedRole === "admin";
  const canManageTemplates = ["admin", "supervisor", "agent"].includes(normalizedRole);
  const loadMacros = async () => {
    const response = await fetch(getApiUrl("/api/settings/ticket-macros"), { credentials: "include" });
    if (response.ok) setMacros(await response.json());
  };
  const loadMacroAnalytics = async () => {
    const response = await fetch(getApiUrl("/api/settings/ticket-macros/analytics"), { credentials: "include" });
    if (response.ok) setMacroAnalytics(await response.json());
  };
  useEffect(() => { void loadMacros(); void loadMacroAnalytics(); }, []);
  useEffect(() => {
    void Promise.all([
      fetch(getApiUrl("/api/agents"), { credentials: "include" }).then((response) => response.ok ? response.json() : []),
      fetch(getApiUrl("/api/settings/routing"), { credentials: "include" }).then((response) => response.ok ? response.json() : { onCallAgentId: null }),
    ]).then(([agents, routing]) => {
      setRoutingAgents(Array.isArray(agents) ? agents : []);
      setOnCallAgentId(routing?.onCallAgentId == null ? "" : String(routing.onCallAgentId));
      setBackupAgentId(routing?.backupAgentId == null ? "" : String(routing.backupAgentId));
    });
  }, []);
  const saveRouting = async () => {
    setRoutingSaving(true);
    try {
      const response = await fetch(getApiUrl("/api/settings/routing"), {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onCallAgentId: onCallAgentId || null, backupAgentId: backupAgentId || null }),
      });
      if (!response.ok) throw new Error("Unable to save routing settings");
      toast({ title: "Routing settings saved" });
    } catch (error) {
      toast({ title: "Could not save routing settings", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setRoutingSaving(false);
    }
  };
  const saveMacro = async () => {
    if (!macroForm.name.trim() || !macroForm.content.trim()) return;
    const response = await fetch(getApiUrl("/api/settings/ticket-macros"), {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(macroForm),
    });
    if (response.ok) {
      setMacroForm({ name: "", content: "", scope: "all" });
      await loadMacros();
      await loadMacroAnalytics();
      toast({ title: "Macro added" });
    } else toast({ title: "Could not save macro", variant: "destructive" });
  };
  const deleteMacro = async (id: number) => {
    const response = await fetch(getApiUrl(`/api/settings/ticket-macros/${id}`), { method: "DELETE", credentials: "include" });
    if (response.ok) await loadMacros();
  };

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
  const saveTemplate = () => {
    const data = {
      name: templateForm.name.trim(),
      description: templateForm.description.trim(),
    };
    if (!data.name || !data.description) return;
    if (editingTemplateId) updateTemplate.mutate({ id: editingTemplateId, data });
    else createTemplate.mutate({ data });
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
          <CardHeader><CardTitle>Ticket routing</CardTitle><CardDescription>Assign new unassigned tickets to the configured on-call agent.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!isAdmin ? <p className="text-sm text-muted-foreground">Only administrators can change routing settings.</p> : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid min-w-[280px] gap-2"><Label htmlFor="on-call-agent">On-call agent</Label><Select value={onCallAgentId || "none"} onValueChange={(value) => setOnCallAgentId(value === "none" ? "" : value)}><SelectTrigger id="on-call-agent"><SelectValue placeholder="No automatic assignment" /></SelectTrigger><SelectContent><SelectItem value="none">No automatic assignment</SelectItem>{routingAgents.map((agent) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} ({agent.email})</SelectItem>)}</SelectContent></Select></div>
                <div className="grid min-w-[280px] gap-2"><Label htmlFor="backup-agent">Backup agent</Label><Select value={backupAgentId || "none"} onValueChange={(value) => setBackupAgentId(value === "none" ? "" : value)}><SelectTrigger id="backup-agent"><SelectValue placeholder="No backup assignment" /></SelectTrigger><SelectContent><SelectItem value="none">No backup assignment</SelectItem>{routingAgents.filter((agent) => String(agent.id) !== onCallAgentId).map((agent) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} ({agent.email})</SelectItem>)}</SelectContent></Select></div>
                <Button onClick={() => void saveRouting()} disabled={routingSaving}>{routingSaving ? "Saving..." : "Save routing"}</Button>
              </div>
            )}
          </CardContent>
        </Card>
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
              {!isAuthLoading && !user && <span className="text-sm text-muted-foreground">Access unavailable</span>}
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
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Ticket templates</CardTitle>
                <CardDescription>Create reusable description text for new tickets. Templates do not change ticket subject, priority, or other fields.</CardDescription>
              </div>
              {!isAuthLoading && !user && <span className="text-sm text-muted-foreground">Access unavailable</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {isAuthLoading ? <div className="text-sm text-muted-foreground">Checking administrator access...</div> : !user ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Sign in with your support account to manage ticket templates.</div>
            ) : !canManageTemplates ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Only support administrators, supervisors, or agents with template access can create or change ticket templates.</div>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium">{editingTemplateId ? "Edit template" : "Add template"}</h3>
                    {editingTemplateId && <Button variant="ghost" size="sm" onClick={resetTemplateForm}>Cancel edit</Button>}
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="template-name">Template name</Label>
                      <Input
                        id="template-name"
                        value={templateForm.name}
                        onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })}
                        placeholder="Password reset request"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="template-description">Description text</Label>
                      <textarea
                        id="template-description"
                        value={templateForm.description}
                        onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })}
                        placeholder="Please provide the account email and describe the issue..."
                        className="min-h-[130px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div>
                      <Button onClick={saveTemplate} disabled={createTemplate.isPending || updateTemplate.isPending || !templateForm.name.trim() || !templateForm.description.trim()}>
                        <Save className="mr-2 h-4 w-4" /> {editingTemplateId ? "Save changes" : "Add template"}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {isTemplatesLoading ? <div className="text-sm text-muted-foreground">Loading templates...</div> : templates?.length ? templates.map((template) => (
                    <div key={template.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          {template.name}
                          {!template.isActive && <Badge variant="outline">Inactive</Badge>}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{template.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={template.isActive}
                          onCheckedChange={(isActive) => updateTemplate.mutate({ id: template.id, data: { isActive } })}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingTemplateId(template.id);
                            setTemplateForm({ name: template.name, description: template.description });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Delete ${template.name}`}
                          onClick={() => deleteTemplate.mutate({ id: template.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                      <Plus className="mx-auto mb-2 h-4 w-4" />No ticket templates yet.
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ticket macros</CardTitle>
            <CardDescription>Create reusable replies for descriptions, public replies, and internal notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canManageTemplates ? <div className="text-sm text-muted-foreground">You do not have permission to manage macros.</div> : (
              <>
                <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
                  <Input placeholder="Macro name" value={macroForm.name} onChange={(event) => setMacroForm({ ...macroForm, name: event.target.value })} />
                  <textarea placeholder="Hi there, your ticket has been received..." value={macroForm.content} onChange={(event) => setMacroForm({ ...macroForm, content: event.target.value })} className="min-h-[100px] rounded-md border bg-transparent px-3 py-2 text-sm" />
                  <Select value={macroForm.scope} onValueChange={(scope) => setMacroForm({ ...macroForm, scope })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Available everywhere</SelectItem>
                      <SelectItem value="description">Ticket descriptions</SelectItem>
                      <SelectItem value="public_comment">Public replies</SelectItem>
                      <SelectItem value="internal_comment">Internal notes</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={() => void saveMacro()} disabled={!macroForm.name.trim() || !macroForm.content.trim()}><Save className="mr-2 h-4 w-4" />Add macro</Button>
                </div>
                {macros.map((macro) => (
                  <div key={macro.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div><p className="font-medium">{macro.name}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{macro.content}</p><Badge variant="outline" className="mt-2">{macro.scope}</Badge></div>
                    <Button variant="outline" size="sm" onClick={() => void deleteMacro(macro.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                  <p className="font-medium">Macro usage analytics</p>
                  {macroAnalytics.length ? macroAnalytics.map((row) => (
                    <div key={`${row.macroId}-${row.scope ?? "unused"}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{row.name} <span className="text-muted-foreground">({row.scope ?? "unused"})</span></span>
                      <span className="shrink-0 text-muted-foreground">
                        {row.usageCount} uses{row.lastUsedAt ? ` · last ${new Date(row.lastUsedAt).toLocaleDateString()}` : ""}
                      </span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No macro usage recorded yet.</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

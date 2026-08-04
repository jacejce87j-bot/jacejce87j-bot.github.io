import { useState } from "react";
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
            ) : !isAdmin ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Only administrators can create or change ticket templates.</div>
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
      </div>
    </AppLayout>
  );
}

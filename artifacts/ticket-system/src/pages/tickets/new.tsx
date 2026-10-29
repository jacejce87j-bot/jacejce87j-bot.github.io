import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { 
  useCreateTicket, 
  useListContacts, 
  useListOrganizations,
  useListAgents,
  useListTicketTemplates,
  getListTicketsQueryKey,
  type TicketAttachment,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, FileText, Paperclip } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getMentionCandidates, replaceLastMention } from "@/lib/mentions";
import { MacroSelector } from "@/components/macro-selector";
import { useSupportUser } from "@/hooks/use-support-user";

const formSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  description: z.string().optional(),
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  type: z.enum(["question", "incident", "problem", "task"]),
  channel: z.enum(["email", "chat", "phone", "web", "api"]),
  requesterId: z.coerce.number().optional().nullable(),
  assigneeId: z.coerce.number().optional().nullable(),
  organizationId: z.coerce.number().optional().nullable(),
  scheduledAt: z.string().optional(),
}).refine((values) => Number.isSafeInteger(values.requesterId) && Number(values.requesterId) > 0, {
  path: ["requesterId"],
  message: "Requester is required",
}).refine((values) => Number.isSafeInteger(values.organizationId) && Number(values.organizationId) > 0, {
  path: ["organizationId"],
  message: "Organization is required",
});

type FormValues = z.infer<typeof formSchema>;

export default function NewTicket() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useSupportUser();

  const contactsQuery = useListContacts({ limit: 100 });
  const organizationsQuery = useListOrganizations({ limit: 100 });
  const agentsQuery = useListAgents();
  const templatesQuery = useListTicketTemplates();
  const contacts = Array.isArray(contactsQuery.data?.data) ? contactsQuery.data.data : [];
  const organizations = Array.isArray(organizationsQuery.data?.data) ? organizationsQuery.data.data : [];
  const agents = Array.isArray(agentsQuery.data) ? agentsQuery.data : [];
  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];
  const supportingQueries = [contactsQuery, organizationsQuery, agentsQuery, templatesQuery];
  const hasSupportingQueryError = supportingQueries.some((query) => query.isError);

  const [templateFields, setTemplateFields] = useState<any[] | null>(null);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string,string>>({});
  const [trackingDeviceTypes, setTrackingDeviceTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [cameraDeviceTypes, setCameraDeviceTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const { uploadFile, isUploading } = useUpload({
    onError: (error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
  });
  const normalizeTemplateFieldKey = (value: string) => {
    const raw = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[_\-/]+/g, " ")
      .replace(/\s+/g, " ");

    const aliases: Record<string, string> = {
      "fleet no": "fleetNum",
      "fleet number": "fleetNum",
      "fleetnum": "fleetNum",
      "number plate": "reg",
      "numberplate": "reg",
      "reg no": "reg",
      "registration": "reg",
      "camera id": "deviceId",
      "camera cell no": "deviceCellNo",
      "camera cell number": "deviceCellNo",
      "camera iccid": "cameraIccid",
      "tracking iccid": "trackingIccid",
      "camera type": "deviceType",
      "cameratype": "deviceType",
      "cell phone": "deviceCellNo",
      "cell no": "deviceCellNo",
      "phone no": "deviceCellNo",
      "device cell no": "deviceCellNo",
      "device cell": "deviceCellNo",
      "devicecellno": "deviceCellNo",
      "device id": "deviceId",
      "deviceid": "deviceId",
      "deviceimei": "trackingImei",
      "tracking imei": "trackingImei",
      "trackingimei": "trackingImei",
      "tracking imei no": "trackingImei",
      "tracking cell num": "trackingCellNum",
      "trackingcellnum": "trackingCellNum",
      "tracking cell number": "trackingCellNum",
      "tracking cell": "trackingCellNum",
      "tracking type": "trackingType",
      "trackingtype": "trackingType",
      "device type": "deviceType",
      "devicetype": "deviceType",
      "engine type": "engine",
      "odometer": "odo",
      "odometer reading": "odo",
      "colour": "colour",
      "color": "colour",
      "vin number": "vin",
      "vehicle id": "deviceId",
      "vesa num": "vesaNum",
      "vesa": "vesaNum",
      "vesanum": "vesaNum",
      "hours": "hours",
      "hrs": "hours",
      "channel": "channel",
      "channel 1": "channel",
      "channel 2": "channel",
      "channel 3": "channel",
      "channel 4": "channel",
      "channel 5": "channel",
      "channel 6": "channel",
      "channel 7": "channel",
      "channel 8": "channel",
      "channel1": "channel",
      "channel2": "channel",
      "channel3": "channel",
      "channel4": "channel",
      "channel5": "channel",
      "channel6": "channel",
      "channel7": "channel",
      "channel8": "channel",
    };

    if (aliases[raw]) {
      return aliases[raw];
    }

    const cleaned = raw.replace(/[^a-z0-9]+/g, " ");
    const words = cleaned.split(" ").filter(Boolean);
    if (!words.length) return "";

    return words
      .map((part, index) => {
        if (!part) return "";
        if (index === 0) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("");
  };
  useEffect(() => {
    const loadDeviceTypes = async () => {
      try {
        const [trackingRes, cameraRes] = await Promise.all([
          fetch(getApiUrl("/api/device-types?category=tracking"), {
            credentials: "include",
            headers: getAuthHeaders(),
          }),
          fetch(getApiUrl("/api/device-types?category=camera"), {
            credentials: "include",
            headers: getAuthHeaders(),
          }),
        ]);
        const [trackingData, cameraData] = await Promise.all([
          trackingRes.ok ? trackingRes.json() : [],
          cameraRes.ok ? cameraRes.json() : [],
        ]);
        setTrackingDeviceTypes(Array.isArray(trackingData) ? trackingData : []);
        setCameraDeviceTypes(Array.isArray(cameraData) ? cameraData : []);
      } catch {
        setTrackingDeviceTypes([]);
        setCameraDeviceTypes([]);
      }
    };
    void loadDeviceTypes();
  }, []);

  function inferFieldsFromTemplateDescription(description: string): Array<{ key: string; label: string; required?: boolean; value?: string }> {
    // Accept both real newline chars and literal "\\n" sequences in descriptions
    const sanitized = String(description ?? "").replace(/\\n/g, "\n");
    const lines = sanitized.split(/\\n|\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: Array<{ key: string; label: string; required?: boolean; value?: string }> = [];
    for (const line of lines) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const label = m[1].trim();
      const value = m[2].trim();
      const key = normalizeTemplateFieldKey(label);
      if (!key) continue;
      out.push({ key, label, value: value || undefined });
    }

    return out;
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject: "",
      description: "",
      status: "open",
      priority: "normal",
      type: "question",
      channel: "web",
      requesterId: null,
      assigneeId: null,
      organizationId: null,
      scheduledAt: "",
    },
  });

  const descriptionValue = form.watch("description") ?? "";
  const mentionSuggestions = getMentionCandidates(descriptionValue, contacts);

  const createTicket = useCreateTicket({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
        toast({ title: "Ticket created successfully" });
        setLocation(`/tickets/${data.id}`);
      },
      onError: () => {
        toast({ title: "Failed to create ticket", variant: "destructive" });
      }
    }
  });

  const handleTicketAttachment = async (file: File) => {
    const uploaded = await uploadFile(file);
    if (!uploaded) return;
    setTicketAttachments((current) => [
      ...current,
      {
        name: uploaded.metadata.name,
        size: uploaded.metadata.size,
        contentType: uploaded.metadata.contentType,
        objectPath: uploaded.objectPath,
        uploadedAt: new Date().toISOString(),
      },
    ]);
  };

  const onSubmit = (data: FormValues) => {
    let finalDescription = data.description || '';
    if (templateFields && templateFields.length) {
      const built = templateFields.map((f: any) => `${f.label}: ${templateFieldValues[f.key] ?? ''}`).join('\n');
      finalDescription = [built, data.description || ''].filter(Boolean).join('\n\n');
    }

    createTicket.mutate({ 
      data: {
        ...data,
        description: finalDescription || undefined,
        templateData: (templateFields ?? []).map((field: any) => ({
          key: normalizeTemplateFieldKey(String(field.key || field.label || "")),
          label: String(field.label || field.name || field.key || "Field"),
          value: templateFieldValues[field.key] ?? "",
        })),
        attachments: ticketAttachments,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt).toISOString() : null,
      } as any,
    });
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-8 pt-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Link href="/tickets">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">New Ticket</h2>
            <p className="text-muted-foreground">Create a new customer request.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ticket Information</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {hasSupportingQueryError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <p>Some ticket options could not be loaded. You can still complete the basic fields, or retry now.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void Promise.all(supportingQueries.map((query) => query.refetch()))}
                    >
                      Retry ticket options
                    </Button>
                  </div>
                )}
                
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject *</FormLabel>
                      <FormControl>
                        <Input placeholder="Brief summary of the issue..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {templates?.some((template) => template.isActive) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium leading-none">Description template</label>
                      <span className="text-xs text-muted-foreground">(optional)</span>
                    </div>
                    <Select
                      onValueChange={(value) => {
                        if (!value) {
                          setTemplateFields(null);
                          setTemplateFieldValues({});
                          form.setValue("description", "", { shouldDirty: true });
                          return;
                        }

                        const template = templates.find((candidate) => candidate.id.toString() === value) as any;
                        if (template) {
                          const explicitFields = Array.isArray(template.fields) ? template.fields : [];
                          const sourceFields = explicitFields.length
                            ? explicitFields
                            : inferFieldsFromTemplateDescription(template.description || "");
                          const resolvedFields = sourceFields.map((field: any) => ({
                            ...field,
                            key: normalizeTemplateFieldKey(String(field.key || field.label || field.name || "")),
                            label: normalizeTemplateFieldKey(String(field.key || field.label || field.name || "")) === "channel"
                              ? "Channel"
                              : String(field.label || field.name || field.key || "Field"),
                          })).filter((field: any, index: number, fields: any[]) =>
                            field.key && fields.findIndex((candidate: any) => candidate.key === field.key) === index
                          );

                          if (resolvedFields.length) {
                            setTemplateFields(resolvedFields);
                            setTemplateFieldValues(Object.fromEntries(resolvedFields.map((field: any) => [
                              field.key,
                              typeof field.value === "string"
                                ? field.value
                                : typeof field.defaultValue === "string" ? field.defaultValue : "",
                            ])));
                            form.setValue("description", "", { shouldDirty: true });
                          } else {
                            setTemplateFields(null);
                            setTemplateFieldValues({});
                            form.setValue("description", template.description, { shouldDirty: true });
                          }
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a template to prefill the description" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.filter((template) => template.isActive).map((template) => (
                          <SelectItem key={template.id} value={template.id.toString()}>
                            <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{template.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Every field from the selected template is captured on the ticket and included in its description.</p>


                  </div>
                )}

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Textarea
                            placeholder="Detailed description of the problem... @name or @email"
                            className="min-h-[150px]"
                            value={field.value ?? ""}
                            onChange={(event) => field.onChange(event.target.value)}
                          />
                          <MacroSelector
                            scope="description"
                            userId={user?.id}
                            context={{
                              organization: organizations.find((organization) => organization.id === form.watch("organizationId")),
                              contact: contacts.find((contact) => contact.id === form.watch("requesterId")),
                              user,
                              ticket: { subject: form.watch("subject") },
                            }}
                            onInsert={(content) => field.onChange(field.value ? `${field.value}\n\n${content}` : content)}
                          />
                          {mentionSuggestions.length > 0 && (
                            <div className="rounded-md border bg-muted/20 p-2">
                              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mention a contact</p>
                              <div className="flex flex-wrap gap-2">
                                {mentionSuggestions.map((contact) => (
                                  <button
                                    key={contact.id}
                                    type="button"
                                    className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                                    onClick={() => form.setValue("description", replaceLastMention(field.value ?? "", contact), { shouldDirty: true })}
                                  >
                                    {contact.name} · {contact.email}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {templateFields && templateFields.length ? (
                  <section className="space-y-4 rounded-lg border bg-slate-50/80 p-4 dark:bg-slate-950/30">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Template installation details
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {templateFields.map((f: any) => (
                        <div key={f.key} className="space-y-2">
                          <label className="text-sm font-medium">{f.label}{f.required ? ' *' : ''}</label>
                          {f.key === "channel" ? (
                            <Select value={templateFieldValues[f.key] ?? ""} onValueChange={(value) => setTemplateFieldValues((prev) => ({ ...prev, [f.key]: value }))}>
                              <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 8 }, (_, index) => `Channel ${index + 1}`).map((option) => (
                                  <SelectItem key={option} value={option}>{option}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : f.key === "trackingType" || f.key === "deviceType" ? (
                            <Select
                              value={templateFieldValues[f.key] ?? "none"}
                              onValueChange={(value) => setTemplateFieldValues((prev) => ({ ...prev, [f.key]: value === "none" ? "" : value }))}
                            >
                              <SelectTrigger><SelectValue placeholder={f.key === "trackingType" ? "Select tracking device" : "Select camera device"} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No device selected</SelectItem>
                                {(f.key === "trackingType" ? trackingDeviceTypes : cameraDeviceTypes).map((deviceType) => (
                                  <SelectItem key={deviceType.id} value={deviceType.name}>{deviceType.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={f.type === "number" ? "number" : f.type === "phone" ? "tel" : "text"}
                              value={templateFieldValues[f.key] ?? ''}
                              onChange={(e) => setTemplateFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              placeholder={f.label}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      These fields are saved separately on the ticket and included in its description.
                    </p>
                  </section>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="requesterId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Requester *</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} 
                          value={field.value ? field.value.toString() : "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select requester" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Select requester</SelectItem>
                            {contacts.map(contact => (
                              <SelectItem key={contact.id} value={contact.id.toString()}>
                                {contact.name} ({contact.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="organizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization *</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} 
                          value={field.value ? field.value.toString() : "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select organization" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-72 overflow-y-auto">
                            <SelectItem value="none">Select organization</SelectItem>
                            {organizations.map(org => (
                              <SelectItem key={org.id} value={org.id.toString()}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {(() => {
                    const selectedOrganization = organizations.find((org) => org.id === form.watch("organizationId"));
                    return selectedOrganization?.address ? (
                      <div className="md:col-span-2 rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="font-medium">Job address</div>
                        <div className="text-muted-foreground">{selectedOrganization.address}</div>
                      </div>
                    ) : null;
                  })()}

                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Booking date and time</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="assigneeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignee</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} 
                          value={field.value ? field.value.toString() : "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select assignee" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {agents?.map(agent => (
                              <SelectItem key={agent.id} value={agent.id.toString()}>
                                {agent.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="question">Question</SelectItem>
                            <SelectItem value="incident">Incident</SelectItem>
                            <SelectItem value="problem">Problem</SelectItem>
                            <SelectItem value="task">Task</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="channel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channel</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select channel" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="chat">Chat</SelectItem>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="web">Web Portal</SelectItem>
                            <SelectItem value="api">API</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      Attachments
                    </div>
                    <label className="cursor-pointer">
                      <Button asChild size="sm" variant="outline" disabled={isUploading}>
                        <span>{isUploading ? "Uploading..." : "Add file"}</span>
                      </Button>
                      <input
                        type="file"
                        className="sr-only"
                        disabled={isUploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.currentTarget.value = "";
                          if (file) void handleTicketAttachment(file);
                        }}
                      />
                    </label>
                  </div>
                  {ticketAttachments.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ticketAttachments.map((attachment) => (
                        <div key={`${attachment.objectPath}-${attachment.uploadedAt}`} className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No files attached yet.</p>
                  )}
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-border">
                  <Link href="/tickets">
                    <Button variant="outline" type="button">Cancel</Button>
                  </Link>
                  <Button type="submit" disabled={createTicket.isPending}>
                    {createTicket.isPending ? "Creating..." : "Create Ticket"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

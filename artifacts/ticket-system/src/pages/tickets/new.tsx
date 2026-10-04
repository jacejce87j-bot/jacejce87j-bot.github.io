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
  const [selectedTemplateFieldKeys, setSelectedTemplateFieldKeys] = useState<string[] | null>(null);
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
      "camera type": "deviceType",
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
  const installationFields = [
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
    { key: "trackingImei", label: "Tracking IMEI" },
    { key: "trackingCellNum", label: "Tracking Cell Num" },
    { key: "vesaNum", label: "VESA NUM" },
    { key: "hours", label: "HOURS" },
    { key: "channel", label: "Channel" },
  ];

  function templateHasVesa(template: any) {
    if (!template) return false;
    const fields = Array.isArray(template.fields) ? template.fields : [];
    for (const f of fields) {
      const k = normalizeTemplateFieldKey(String(f.key || f.label || ""));
      if (k === 'vesaNum') return true;
    }
    const inferred = inferFieldsFromTemplateDescription(template.description || "");
    for (const f of inferred) {
      const k = normalizeTemplateFieldKey(String(f.key || f.label || ""));
      if (k === 'vesaNum') return true;
    }
    return false;
  }

  function templateHasHours(template: any) {
    if (!template) return false;
    const fields = Array.isArray(template.fields) ? template.fields : [];
    for (const f of fields) {
      const k = normalizeTemplateFieldKey(String(f.key || f.label || ""));
      if (k === 'hours') return true;
    }
    const inferred = inferFieldsFromTemplateDescription(template.description || "");
    for (const f of inferred) {
      const k = normalizeTemplateFieldKey(String(f.key || f.label || ""));
      if (k === 'hours') return true;
    }
    return false;
  }
  const [installationValues, setInstallationValues] = useState<Record<string, string>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const loadDeviceTypes = async () => {
      try {
        const [trackingRes, cameraRes] = await Promise.all([
          fetch("/api/device-types?category=tracking", { credentials: "include" }),
          fetch("/api/device-types?category=camera", { credentials: "include" }),
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
    const allowed = new Set(installationFields.map((f) => f.key).concat(["trackingType", "deviceType", "vesaNum", "hours"]));

    for (const line of lines) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const label = m[1].trim();
      const value = m[2].trim();
      const key = normalizeTemplateFieldKey(label);
      if (!key) continue;
      if (!allowed.has(key)) continue;
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
    const installationPayload = Object.fromEntries(
      installationFields
        .filter((field) => field.key !== "channel")
        .map((field) => [field.key, installationValues[field.key] ?? ''])
    );

    const selectedTrackingType = installationValues.trackingType ?? "";
    const selectedCameraType = installationValues.deviceType ?? "";

    let finalDescription = data.description || '';
    if (templateFields && templateFields.length) {
      const built = templateFields.map((f: any) => `${f.label}: ${templateFieldValues[f.key] ?? ''}`).join('\n');
      finalDescription = [built, data.description || ''].filter(Boolean).join('\n\n');
    }

    createTicket.mutate({ 
      data: {
        ...data,
        ...installationPayload,
        trackingType: selectedTrackingType,
        deviceType: selectedCameraType,
        description: finalDescription || undefined,
        attachments: ticketAttachments,
      } as any,
    });
  };

  const visibleTemplateFieldKeys = (selectedTemplateFieldKeys && selectedTemplateFieldKeys.length) ? selectedTemplateFieldKeys : [];
  const showInstallationPanel = selectedTemplateId !== null && visibleTemplateFieldKeys.length > 0;

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
                        setSelectedTemplateId(value || null);
                        // if cleared selection, hide panel and clear installation values
                        if (!value) {
                          setSelectedTemplateId(null);
                          setSelectedTemplateFieldKeys(null);
                          setInstallationValues({});
                          setTemplateFields(null);
                          setTemplateFieldValues({});
                          form.setValue("description", "", { shouldDirty: true });
                          return;
                        }

                        const template = templates.find((candidate) => candidate.id.toString() === value) as any;
                        if (template) {
                          const fields = Array.isArray(template.fields) ? template.fields : [];
                          if (fields.length) {
                            const allowed = new Set([
                              ...installationFields.map((f) => f.key),
                              "trackingType",
                              "deviceType",
                            ]);

                            setInstallationValues((prev) => {
                              const next = { ...prev };
                              fields.forEach((f: any) => {
                                const normalizedKey = normalizeTemplateFieldKey(String(f.key || f.label || ""));
                                if (!allowed.has(normalizedKey)) {
                                  return;
                                }
                                next[normalizedKey] = typeof f.value === "string" ? f.value : typeof f.defaultValue === "string" ? f.defaultValue : "";
                              });
                              return next;
                            });

                            const normalizedKeys = Array.from(new Set(
                              fields
                                .map((f: any) => normalizeTemplateFieldKey(String(f.key || f.label || "")))
                                .filter((key: string) => allowed.has(key))
                            )) as string[];

                            // If any template in the system contains VESA or HOURS, map them onto this template
                            const globalHasVesa = Array.isArray(templates) && templates.some((t:any) => templateHasVesa(t));
                            if (globalHasVesa && !normalizedKeys.includes('vesaNum')) {
                              normalizedKeys.push('vesaNum');
                              setInstallationValues((prev) => ({ ...prev, vesaNum: prev.vesaNum ?? '' }));
                            }
                            const globalHasHours = Array.isArray(templates) && templates.some((t:any) => templateHasHours(t));
                            if (globalHasHours && !normalizedKeys.includes('hours')) {
                              normalizedKeys.push('hours');
                              setInstallationValues((prev) => ({ ...prev, hours: prev.hours ?? '' }));
                            }

                            setSelectedTemplateFieldKeys(normalizedKeys);

                            setTemplateFields(null);
                            setTemplateFieldValues({});
                          } else {
                            // If the template does not include an explicit fields array, try
                            // to infer installation fields from the free-form description
                            // (lines like "VESA NUM: 123" or "HOURS: 4"). If any are found,
                            // surface them in the installation panel; otherwise fall back
                            // to populating the description only.
                            const inferred = inferFieldsFromTemplateDescription(template.description || "");
                            if (inferred.length) {
                              const allowed = new Set([
                                ...installationFields.map((f) => f.key),
                                "trackingType",
                                "deviceType",
                              ]);

                              setInstallationValues((prev) => {
                                const next = { ...prev };
                                inferred.forEach((f) => {
                                  const normalized = normalizeTemplateFieldKey(String(f.key || f.label || ""));
                                  if (allowed.has(normalized)) {
                                    next[normalized] = f.value ?? "";
                                  }
                                });
                                return next;
                              });

                              const normalizedKeys = Array.from(new Set(inferred.map((f) => normalizeTemplateFieldKey(String(f.key || f.label || ""))).filter((k) => k && ([...installationFields.map(x=>x.key), 'trackingType','deviceType'].includes(k)))) ) as string[];

                              // If any template in the system contains VESA or HOURS, map them onto this template
                              const globalHasVesa = Array.isArray(templates) && templates.some((t:any) => templateHasVesa(t));
                              if (globalHasVesa && !normalizedKeys.includes('vesaNum')) {
                                normalizedKeys.push('vesaNum');
                                setInstallationValues((prev) => ({ ...prev, vesaNum: prev.vesaNum ?? '' }));
                              }
                              const globalHasHours = Array.isArray(templates) && templates.some((t:any) => templateHasHours(t));
                              if (globalHasHours && !normalizedKeys.includes('hours')) {
                                normalizedKeys.push('hours');
                                setInstallationValues((prev) => ({ ...prev, hours: prev.hours ?? '' }));
                              }

                              setSelectedTemplateFieldKeys(normalizedKeys);

                              setTemplateFields(null);
                              setTemplateFieldValues({});
                            } else {
                              setTemplateFields(null);
                              setTemplateFieldValues({});
                              setSelectedTemplateFieldKeys(null);
                              form.setValue("description", template.description, { shouldDirty: true });
                            }
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
                    <p className="text-xs text-muted-foreground">Selecting a template only fills the Description field; you can edit it before creating the ticket.</p>


                  </div>
                )}

                {templateFields && templateFields.length ? (
                  <div className="space-y-3">
                    {templateFields.map((f: any) => (
                      <div key={f.key} className="grid grid-cols-1 gap-2">
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
                        ) : (
                          <Input value={templateFieldValues[f.key] ?? ''} onChange={(e) => setTemplateFieldValues((prev) => ({ ...prev, [f.key]: (e.target as HTMLInputElement).value }))} />
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">These fields come from the selected template and will be combined into the description on submit.</p>
                  </div>
                ) : null}

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

                {showInstallationPanel ? (
                  <div className="space-y-4 rounded-lg border bg-slate-50/80 p-4 dark:bg-slate-950/30">
                   <div className="flex items-center justify-between gap-3">
                     <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Template installation details</h3>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                     {installationFields.filter((field) => visibleTemplateFieldKeys.includes(field.key)).map((field) => (
                       <div key={field.key} className="space-y-2">
                         <label className="text-sm font-medium">{field.label}</label>
                         {field.key === "channel" ? (
                           <Select
                             value={installationValues.channel ?? ""}
                             onValueChange={(value) => setInstallationValues((prev) => ({ ...prev, channel: value }))}
                           >
                             <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                             <SelectContent>
                               {Array.from({ length: 8 }, (_, index) => `Channel ${index + 1}`).map((option) => (
                                 <SelectItem key={option} value={option}>{option}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         ) : (
                           <Input
                             value={installationValues[field.key] ?? ""}
                             onChange={(event) => setInstallationValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                             placeholder={field.label}
                           />
                         )}
                       </div>
                     ))}

                     {visibleTemplateFieldKeys.includes('trackingType') ? (
                       <div className="space-y-2">
                         <label className="text-sm font-medium">Tracking Device Type</label>
                         <Select
                           value={installationValues.trackingType ?? "none"}
                           onValueChange={(val) => setInstallationValues((prev) => ({ ...prev, trackingType: val === "none" ? "" : val }))}
                         >
                           <SelectTrigger>
                             <SelectValue placeholder="Select tracking device" />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="none">No tracking device selected</SelectItem>
                             {trackingDeviceTypes.map((type) => (
                               <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                     ) : null}

                     {visibleTemplateFieldKeys.includes('deviceType') ? (
                       <div className="space-y-2">
                         <label className="text-sm font-medium">Camera Device Type</label>
                         <Select
                           value={installationValues.deviceType ?? "none"}
                           onValueChange={(val) => setInstallationValues((prev) => ({ ...prev, deviceType: val === "none" ? "" : val }))}
                         >
                           <SelectTrigger>
                             <SelectValue placeholder="Select camera device" />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="none">No camera device selected</SelectItem>
                             {cameraDeviceTypes.map((type) => (
                               <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                     ) : null}
                   </div>
                  </div>
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

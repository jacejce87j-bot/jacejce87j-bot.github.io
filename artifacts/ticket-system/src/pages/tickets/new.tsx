import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { 
  useCreateTicket, 
  useListContacts, 
  useListOrganizations,
  useListAgents,
  useListTicketTemplates,
  getListTicketsQueryKey
} from "@workspace/api-client-react";
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
import { ArrowLeft, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
});

type FormValues = z.infer<typeof formSchema>;

export default function NewTicket() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: contacts } = useListContacts({ limit: 100 });
  const { data: organizations } = useListOrganizations({ limit: 100 });
  const { data: agents } = useListAgents();
  const { data: templates } = useListTicketTemplates();

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

  const onSubmit = (data: FormValues) => {
    createTicket.mutate({ 
      data: {
        ...data,
        description: data.description || undefined,
      }
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
                      <FormLabel className="mb-0">Description template</FormLabel>
                      <span className="text-xs text-muted-foreground">(optional)</span>
                    </div>
                    <Select
                      onValueChange={(value) => {
                        const template = templates.find((candidate) => candidate.id.toString() === value);
                        if (template) form.setValue("description", template.description, { shouldDirty: true });
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

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Detailed description of the problem..." 
                          className="min-h-[150px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="requesterId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Requester</FormLabel>
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
                            <SelectItem value="none">No requester</SelectItem>
                            {contacts?.data.map(contact => (
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
                        <FormLabel>Organization</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} 
                          value={field.value ? field.value.toString() : "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select organization" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No organization</SelectItem>
                            {organizations?.data.map(org => (
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

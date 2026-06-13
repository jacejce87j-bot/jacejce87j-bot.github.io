import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { 
  useGetOrganization, 
  getGetOrganizationQueryKey,
  useListContacts,
  getListContactsQueryKey,
  useListTickets,
  getListTicketsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { ArrowLeft, Globe, Briefcase, CreditCard, Users, Ticket as TicketIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function OrganizationDetail() {
  const [, params] = useRoute("/organizations/:id");
  const orgId = params?.id ? parseInt(params.id) : 0;
  
  const { data: org, isLoading: isLoadingOrg } = useGetOrganization(orgId, {
    query: {
      enabled: !!orgId,
      queryKey: getGetOrganizationQueryKey(orgId)
    }
  });

  const { data: contacts, isLoading: isLoadingContacts } = useListContacts(
    { organizationId: orgId, limit: 50 },
    {
      query: {
        enabled: !!orgId,
        queryKey: getListContactsQueryKey({ organizationId: orgId, limit: 50 })
      }
    }
  );

  const { data: tickets, isLoading: isLoadingTickets } = useListTickets(
    { organizationId: orgId, limit: 50 },
    {
      query: {
        enabled: !!orgId,
        queryKey: getListTicketsQueryKey({ organizationId: orgId, limit: 50 })
      }
    }
  );

  if (isLoadingOrg) {
    return (
      <AppLayout>
        <div className="flex-1 p-8">Loading organization...</div>
      </AppLayout>
    );
  }

  if (!org) {
    return (
      <AppLayout>
        <div className="flex-1 p-8 text-center text-muted-foreground">Organization not found</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-8 pt-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-4">
          <Link href="/organizations">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
              <span className="text-2xl font-bold">{getInitials(org.name)}</span>
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{org.name}</h2>
              {org.domain && (
                <a href={`https://${org.domain}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline flex items-center gap-1 mt-1">
                  <Globe className="h-3 w-3" /> {org.domain}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Briefcase className="h-3 w-3" /> Industry</div>
                  <div className="text-sm font-medium">{org.industry || "—"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> Plan</div>
                  <div className="text-sm font-medium">
                    {org.plan ? <Badge variant="secondary">{org.plan}</Badge> : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="h-3 w-3" /> Total Contacts</div>
                  <div className="text-sm font-medium">{org.contactCount || 0}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TicketIcon className="h-3 w-3" /> Total Tickets</div>
                  <div className="text-sm font-medium">{org.ticketCount || 0}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {org.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{org.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes added.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-3">
            <Tabs defaultValue="tickets" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="tickets">Tickets ({org.ticketCount || 0})</TabsTrigger>
                <TabsTrigger value="contacts">Contacts ({org.contactCount || 0})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="tickets">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Tickets</CardTitle>
                    <CardDescription>Tickets created by contacts at this organization.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[80px]">ID</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead>Requester</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Updated</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoadingTickets ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-24 text-center">Loading tickets...</TableCell>
                            </TableRow>
                          ) : tickets?.data.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-24 text-center">No tickets found.</TableCell>
                            </TableRow>
                          ) : (
                            tickets?.data.map((ticket) => (
                              <TableRow key={ticket.id} className="hover:bg-muted/50 cursor-pointer group">
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  <Link href={`/tickets/${ticket.id}`} className="hover:underline">#{ticket.id}</Link>
                                </TableCell>
                                <TableCell>
                                  <Link href={`/tickets/${ticket.id}`} className="font-medium group-hover:text-primary transition-colors">
                                    {ticket.subject}
                                  </Link>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-muted-foreground">{ticket.requester?.name || '—'}</span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="capitalize">
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
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="contacts">
                <Card>
                  <CardHeader>
                    <CardTitle>Contacts</CardTitle>
                    <CardDescription>People associated with this organization.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Tickets</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoadingContacts ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-24 text-center">Loading contacts...</TableCell>
                            </TableRow>
                          ) : contacts?.data.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-24 text-center">No contacts found.</TableCell>
                            </TableRow>
                          ) : (
                            contacts?.data.map((contact) => (
                              <TableRow key={contact.id} className="hover:bg-muted/50 cursor-pointer group">
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback>{getInitials(contact.name)}</AvatarFallback>
                                    </Avatar>
                                    <Link href={`/contacts/${contact.id}`} className="font-medium group-hover:text-primary transition-colors">
                                      {contact.name}
                                    </Link>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {contact.email}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="capitalize">
                                    {contact.role?.replace('_', ' ') || 'User'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {contact.ticketCount || 0}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

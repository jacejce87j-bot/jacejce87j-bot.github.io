import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { 
  useGetContact, 
  getGetContactQueryKey,
  useListContactTickets,
  getListContactTicketsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { ArrowLeft, Mail, Phone, Building2, Tag, Calendar, FileText } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ContactDetail() {
  const [, params] = useRoute("/contacts/:id");
  const contactId = params?.id ? parseInt(params.id) : 0;
  
  const { data: contact, isLoading: isLoadingContact } = useGetContact(contactId, {
    query: {
      enabled: !!contactId,
      queryKey: getGetContactQueryKey(contactId)
    }
  });

  const { data: tickets, isLoading: isLoadingTickets } = useListContactTickets(contactId, {
    query: {
      enabled: !!contactId,
      queryKey: getListContactTicketsQueryKey(contactId)
    }
  });

  if (isLoadingContact) {
    return (
      <AppLayout>
        <div className="flex-1 p-8">Loading contact...</div>
      </AppLayout>
    );
  }

  if (!contact) {
    return (
      <AppLayout>
        <div className="flex-1 p-8 text-center text-muted-foreground">Contact not found</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center gap-4">
          <Link href="/contacts">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarFallback className="text-xl">{getInitials(contact.name)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold tracking-tight">{contact.name}</h2>
                <Badge variant="outline" className="capitalize">{contact.role?.replace('_', ' ') || 'User'}</Badge>
              </div>
              <p className="text-muted-foreground">{contact.email}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${contact.email}`} className="text-sm hover:underline">{contact.email}</a>
                </div>
                {contact.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${contact.phone}`} className="text-sm hover:underline">{contact.phone}</a>
                  </div>
                )}
                {contact.organization && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <Link href={`/organizations/${contact.organization.id}`} className="text-sm hover:underline font-medium">
                      {contact.organization.name}
                    </Link>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Added {formatRelativeTime(contact.createdAt)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {contact.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes added.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Tickets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">ID</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingTickets ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">Loading tickets...</TableCell>
                        </TableRow>
                      ) : tickets?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">No tickets found for this contact.</TableCell>
                        </TableRow>
                      ) : (
                        tickets?.map((ticket) => (
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
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

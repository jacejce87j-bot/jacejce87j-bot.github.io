import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListContacts, getListContactsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { Search, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ContactList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  
  const { data, isLoading } = useListContacts({ 
    page, 
    limit: 25, 
    ...(search ? { q: search } : {})
  }, { 
    query: { 
      queryKey: getListContactsQueryKey({ page, limit: 25, ...(search ? { q: search } : {}) }) 
    } 
  });

  return (
    <AppLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Contacts</h2>
            <p className="text-muted-foreground">Manage your customers and end-users.</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add Contact
          </Button>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {data?.total || 0} contacts
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
                  </TableRow>
                ) : data?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">No contacts found.</TableCell>
                  </TableRow>
                ) : (
                  data?.data.map((contact) => (
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
                      <TableCell>
                        {contact.organization ? (
                          <Link href={`/organizations/${contact.organization.id}`} className="text-sm hover:underline">
                            {contact.organization.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
          
          {data && data.total > data.limit && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <div className="text-sm text-muted-foreground">
                Page {page} of {Math.ceil(data.total / data.limit)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(data.total / data.limit)}
              >
                Next
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}

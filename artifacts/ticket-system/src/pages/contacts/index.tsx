import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListContacts, getListContactsQueryKey, useListOrganizations, useCreateContact } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { Search, Plus, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ContactList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", organizationId: "none", role: "end_user", notes: "" });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizations } = useListOrganizations({ limit: 100 });
  const createContact = useCreateContact({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        setOpen(false);
        setForm({ name: "", email: "", phone: "", organizationId: "none", role: "end_user", notes: "" });
        toast({ title: "Contact added" });
      },
      onError: () => toast({ title: "Could not add contact", description: "Check the required fields and try again.", variant: "destructive" }),
    },
  });
  
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
          <Button onClick={() => setOpen(true)}>
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>Create a customer or end-user record.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="contact-name">Name *</Label><Input id="contact-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Morgan" /></div>
            <div className="grid gap-2"><Label htmlFor="contact-email">Email *</Label><Input id="contact-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="alex@example.com" /></div>
            <div className="grid gap-2"><Label htmlFor="contact-phone">Phone</Label><Input id="contact-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0100" /></div>
            <div className="grid gap-2"><Label>Organization</Label><Select value={form.organizationId} onValueChange={(organizationId) => setForm({ ...form, organizationId })}><SelectTrigger><SelectValue placeholder="No organization" /></SelectTrigger><SelectContent><SelectItem value="none">No organization</SelectItem>{organizations?.data.map((org) => <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Role</Label><Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="end_user">End user</SelectItem><SelectItem value="agent">Agent</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="contact-notes">Notes</Label><Input id="contact-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional context" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={createContact.isPending || !form.name.trim() || !form.email.trim()} onClick={() => createContact.mutate({ data: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, organizationId: form.organizationId === "none" ? null : Number(form.organizationId), role: form.role as "end_user" | "agent" | "admin", notes: form.notes.trim() || undefined } })}>{createContact.isPending ? "Adding..." : "Add contact"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListOrganizations, getListOrganizationsQueryKey, useCreateOrganization, useDeleteOrganization } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { Search, Plus, Building2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function OrganizationList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", industry: "", plan: "", notes: "" });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createOrganization = useCreateOrganization({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
        setOpen(false);
        setForm({ name: "", domain: "", industry: "", plan: "", notes: "" });
        toast({ title: "Organization added" });
      },
      onError: () => toast({ title: "Could not add organization", description: "Check the required fields and try again.", variant: "destructive" }),
    },
  });
  const deleteOrganization = useDeleteOrganization({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
        toast({ title: "Organization deleted" });
      },
      onError: () => toast({ title: "Delete failed", description: "Could not delete the organization.", variant: "destructive" }),
    },
  });
   
  const { data, isLoading } = useListOrganizations({ 
    page, 
    limit: 25, 
    ...(search ? { q: search } : {})
  }, { 
    query: { 
      queryKey: getListOrganizationsQueryKey({ page, limit: 25, ...(search ? { q: search } : {}) }) 
    } 
  });

  return (
    <AppLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Organizations</h2>
            <p className="text-muted-foreground">Manage companies and business accounts.</p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Organization
          </Button>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {data?.total || 0} organizations
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Contacts</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
                  </TableRow>
                ) : data?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No organizations found.</TableCell>
                  </TableRow>
                ) : (
                  data?.data.map((org) => (
                    <TableRow key={org.id} className="hover:bg-muted/50 group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-md">
                            <AvatarFallback className="rounded-md bg-primary/10 text-primary">
                              <Building2 className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <Link href={`/organizations/${org.id}`} className="font-medium group-hover:text-primary transition-colors">
                            {org.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {org.domain ? (
                          <a href={`https://${org.domain}`} target="_blank" rel="noreferrer" className="hover:underline">
                            {org.domain}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {org.plan ? (
                          <Badge variant="secondary">{org.plan}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {org.contactCount || 0}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {org.ticketCount || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteOrganization.mutate({ id: org.id })}
                          disabled={deleteOrganization.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
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
            <DialogTitle>Add organization</DialogTitle>
            <DialogDescription>Create a company or business account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="org-name">Name *</Label><Input id="org-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Inc." /></div>
            <div className="grid gap-2"><Label htmlFor="org-domain">Domain</Label><Input id="org-domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" /></div>
            <div className="grid gap-2"><Label htmlFor="org-industry">Industry</Label><Input id="org-industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Software" /></div>
            <div className="grid gap-2"><Label htmlFor="org-plan">Plan</Label><Input id="org-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="Enterprise" /></div>
            <div className="grid gap-2"><Label htmlFor="org-notes">Notes</Label><Input id="org-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional context" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={createOrganization.isPending || !form.name.trim()} onClick={() => createOrganization.mutate({ data: { name: form.name.trim(), domain: form.domain.trim() || undefined, industry: form.industry.trim() || undefined, plan: form.plan.trim() || undefined, notes: form.notes.trim() || undefined } })}>{createOrganization.isPending ? "Adding..." : "Add organization"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

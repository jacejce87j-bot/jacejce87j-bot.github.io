import { useRef, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import {
  useListOrganizations,
  getListOrganizationsQueryKey,
  useCreateOrganization,
  useDeleteOrganization,
  useUpdateOrganization,
  type Organization,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { Search, Plus, Building2, Trash2, Pencil } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl, getAuthHeaders } from "@/lib/api";

type SiteForm = { id?: number; name: string; address: string };

async function requestOrganizationSites(path: string, method = "GET", data?: { name: string; address: string }) {
  const response = await fetch(getApiUrl(path), {
    method,
    headers: {
      ...getAuthHeaders(),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Could not save organization sites (HTTP ${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

export default function OrganizationList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [form, setForm] = useState({ name: "", domain: "", industry: "", plan: "", address: "", notes: "" });
  const [siteRows, setSiteRows] = useState<SiteForm[]>([]);
  const [originalSiteRows, setOriginalSiteRows] = useState<SiteForm[]>([]);
  const [deletedSiteIds, setDeletedSiteIds] = useState<number[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState("");
  const [savingSites, setSavingSites] = useState(false);
  const siteLoadSequence = useRef(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createOrganization = useCreateOrganization({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
      },
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
  const updateOrganization = useUpdateOrganization({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
      },
    },
  });

  const openCreateDialog = () => {
    siteLoadSequence.current += 1;
    setSitesLoading(false);
    setEditingOrganization(null);
    setForm({ name: "", domain: "", industry: "", plan: "", address: "", notes: "" });
    setSiteRows([]);
    setOriginalSiteRows([]);
    setDeletedSiteIds([]);
    setSitesError("");
    setOpen(true);
  };

  const loadOrganizationSites = async (organizationId: number) => {
    const requestId = ++siteLoadSequence.current;
    setSitesLoading(true);
    setSitesError("");
    try {
      const sites = await requestOrganizationSites(`/api/organizations/${organizationId}/sites`) as SiteForm[];
      if (!Array.isArray(sites)) throw new Error("Organization sites returned an invalid response.");
      if (requestId === siteLoadSequence.current) {
        setSiteRows(sites);
        setOriginalSiteRows(sites);
      }
    } catch (error) {
      if (requestId === siteLoadSequence.current) {
        setSitesError(error instanceof Error ? error.message : "Could not load organization sites.");
      }
    } finally {
      if (requestId === siteLoadSequence.current) setSitesLoading(false);
    }
  };

  const openEditDialog = async (organization: Organization) => {
    setEditingOrganization(organization);
    setForm({
      name: organization.name,
      domain: organization.domain ?? "",
      industry: organization.industry ?? "",
      plan: organization.plan ?? "",
      address: organization.address ?? "",
      notes: organization.notes ?? "",
    });
    setOpen(true);
    setSiteRows([]);
    setOriginalSiteRows([]);
    setSitesError("");
    setDeletedSiteIds([]);
    await loadOrganizationSites(organization.id);
  };

  const saveOrganization = async () => {
    if (!form.name.trim()) return;
    const populatedSites = siteRows.filter((site) => site.name.trim() || site.address.trim());
    if (populatedSites.some((site) => !site.name.trim() || !site.address.trim())) {
      setSitesError("Enter both a name and address for each site, or remove the empty site row.");
      return;
    }
    if (sitesError) return;
    const data = {
      name: form.name.trim(),
      domain: form.domain.trim() || null,
      industry: form.industry.trim() || null,
      plan: form.plan.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };

    setSavingSites(true);
    try {
      const organization = editingOrganization
        ? await updateOrganization.mutateAsync({ id: editingOrganization.id, data })
        : await createOrganization.mutateAsync({
            data: {
              ...data,
              domain: data.domain ?? undefined,
              industry: data.industry ?? undefined,
              plan: data.plan ?? undefined,
              address: data.address ?? undefined,
              notes: data.notes ?? undefined,
            },
          });
      const orgId = editingOrganization?.id ?? organization.id;
      if (!editingOrganization) setEditingOrganization(organization);
      const originalById = new Map(originalSiteRows
        .filter((site): site is SiteForm & { id: number } => site.id !== undefined)
        .map((site) => [site.id, site]));
      for (let index = 0; index < siteRows.length; index += 1) {
        const site = siteRows[index];
        if (!site || (!site.name.trim() && !site.address.trim())) continue;
        const values = { name: site.name.trim(), address: site.address.trim() };
        if (!site.id) {
          const createdSite = await requestOrganizationSites(`/api/organizations/${orgId}/sites`, "POST", values) as SiteForm;
          if (createdSite.id) {
            setSiteRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, id: createdSite.id } : row));
            setOriginalSiteRows((rows) => [...rows, createdSite]);
          }
        } else {
          const original = originalById.get(site.id);
          if (original && (original.name !== values.name || original.address !== values.address)) {
            await requestOrganizationSites(`/api/organizations/${orgId}/sites/${site.id}`, "PATCH", values);
          }
        }
      }
      for (const siteId of deletedSiteIds) {
        await requestOrganizationSites(`/api/organizations/${orgId}/sites/${siteId}`, "DELETE");
        setDeletedSiteIds((ids) => ids.filter((id) => id !== siteId));
      }
      queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["organization-sites", orgId] });
      setOpen(false);
      setEditingOrganization(null);
      toast({ title: editingOrganization ? "Organization updated" : "Organization added" });
    } catch (error) {
      toast({
        title: editingOrganization ? "Could not save organization" : "Could not add organization",
        description: error instanceof Error ? error.message : "Check the fields and try again.",
        variant: "destructive",
      });
    } finally {
      setSavingSites(false);
    }
  };
   
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
          <Button onClick={openCreateDialog}>
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
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(org)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteOrganization.mutate({ id: org.id })}
                            disabled={deleteOrganization.isPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </div>
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
      <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          siteLoadSequence.current += 1;
          setSitesLoading(false);
          setEditingOrganization(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrganization ? "Edit organization" : "Add organization"}</DialogTitle>
            <DialogDescription>
              {editingOrganization ? "Update organization details and the service address shown on job cards." : "Create a company or business account."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="org-name">Name *</Label><Input id="org-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Inc." /></div>
            <div className="grid gap-2"><Label htmlFor="org-domain">Domain</Label><Input id="org-domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" /></div>
            <div className="grid gap-2"><Label htmlFor="org-industry">Industry</Label><Input id="org-industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Software" /></div>
            <div className="grid gap-2"><Label htmlFor="org-plan">Plan</Label><Input id="org-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="Enterprise" /></div>
            <div className="grid gap-2"><Label htmlFor="org-address">Default service address</Label><Input id="org-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Fallback address if no sites are configured" /></div>
            <section className="grid gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Sites / locations</Label>
                  <p className="text-xs text-muted-foreground">Add the job locations available when creating tickets for this organization.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSitesError("");
                    setSiteRows((rows) => [...rows, { name: "", address: "" }]);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add site
                </Button>
              </div>
              {sitesLoading ? <p className="text-sm text-muted-foreground">Loading sites…</p> : null}
              {siteRows.map((site, index) => (
                <div key={site.id ?? `new-${index}`} className="grid gap-2 rounded-md bg-muted/30 p-3 sm:grid-cols-[1fr_1.5fr_auto]">
                  <Input
                    value={site.name}
                    onChange={(event) => {
                      setSitesError("");
                      setSiteRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row));
                    }}
                    placeholder="Site name"
                    aria-label={`Site ${index + 1} name`}
                  />
                  <Input
                    value={site.address}
                    onChange={(event) => {
                      setSitesError("");
                      setSiteRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, address: event.target.value } : row));
                    }}
                    placeholder="Full job address"
                    aria-label={`Site ${index + 1} address`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove site ${site.name || index + 1}`}
                    onClick={() => {
                      const siteId = site.id;
                      if (siteId !== undefined) setDeletedSiteIds((ids) => [...ids, siteId]);
                      setSitesError("");
                      setSiteRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {sitesError ? (
                <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
                  <span>{sitesError}</span>
                  {editingOrganization && !sitesLoading ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadOrganizationSites(editingOrganization.id)}>
                      Retry
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
            <div className="grid gap-2"><Label htmlFor="org-notes">Notes</Label><Input id="org-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional context" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={createOrganization.isPending || updateOrganization.isPending || savingSites || sitesLoading || !form.name.trim()}
              onClick={saveOrganization}
            >
              {createOrganization.isPending || updateOrganization.isPending || savingSites
                ? "Saving..."
                : editingOrganization ? "Save changes" : "Add organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

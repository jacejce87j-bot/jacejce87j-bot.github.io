import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getListTicketsQueryKey, useListOrganizations, useListTickets } from "@workspace/api-client-react";
import { ArrowLeft, Search } from "lucide-react";
import { createBrandedPdf, drawBrandedTable, saveBrandedPdf } from "@/lib/branded-report-pdf";

export default function OrganizationReports() {
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim();

  const { data: orgsResp, isLoading: isOrganizationsLoading } = useListOrganizations({ limit: 200 });
  const { data: ticketsResp, isLoading: isTicketsLoading } = useListTickets(
    trimmedSearch ? { q: trimmedSearch, limit: 200 } : { limit: 1 },
    {
      query: {
        enabled: !!trimmedSearch,
        queryKey: getListTicketsQueryKey(
          trimmedSearch ? { q: trimmedSearch, limit: 200 } : { limit: 1 },
        ),
      },
    },
  );

  const orgs = Array.isArray(orgsResp?.data) ? orgsResp.data : [];
  const matchingOrgIds = useMemo(() => {
    if (!trimmedSearch) return new Set<number>();
    const ids = new Set<number>();
    for (const ticket of ticketsResp?.data ?? []) {
      if (ticket.organizationId) ids.add(Number(ticket.organizationId));
    }
    return ids;
  }, [trimmedSearch, ticketsResp]);

  const filteredOrgs = useMemo(() => {
    if (!trimmedSearch) return orgs;
    const term = trimmedSearch.toLowerCase();
    return orgs.filter((org: any) => {
      const nameMatches = org.name?.toLowerCase().includes(term);
      if (nameMatches) return true;
      return matchingOrgIds.has(Number(org.id));
    });
  }, [trimmedSearch, orgs, matchingOrgIds]);

  async function exportPdf() {
    const doc = await createBrandedPdf("Organization Report", "portrait");
    drawBrandedTable(doc, ["Organization", "Contacts", "Tickets"], filteredOrgs.map((org) => [org.name, String(org.contactCount ?? 0), String(org.ticketCount ?? 0)]), [330, 90, 90]);
    saveBrandedPdf(doc, "organization-report.pdf");
  }

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-8 pt-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Organization Reports</h2>
            <p className="text-muted-foreground">Select an organization to view its tickets.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Search by organization name or REG.</CardDescription>
            <Button variant="outline" onClick={() => void exportPdf()} disabled={isOrganizationsLoading || !filteredOrgs.length}>Export PDF</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organizations or REG"
                className="pl-9"
              />
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isOrganizationsLoading || (trimmedSearch && isTicketsLoading) ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">Loading organizations...</TableCell>
                    </TableRow>
                  ) : filteredOrgs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">No organizations found.</TableCell>
                    </TableRow>
                  ) : (
                    filteredOrgs.map((org: any) => (
                      <TableRow key={org.id} className="hover:bg-muted/50">
                        <TableCell>{org.name}</TableCell>
                        <TableCell className="text-right">{org.contactCount ?? 0}</TableCell>
                        <TableCell className="text-right">{org.ticketCount ?? 0}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/organizations/${org.id}`}>
                            <Button size="sm">View Tickets</Button>
                          </Link>
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
    </AppLayout>
  );
}

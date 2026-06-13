import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMergeTicket, useListTickets } from "@workspace/api-client-react";
import { getGetTicketQueryKey, getListTicketsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, GitMerge, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MergeTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTicketId: number;
  sourceSubject: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  on_hold: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  solved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function MergeTicketDialog({
  open,
  onOpenChange,
  sourceTicketId,
  sourceSubject,
}: MergeTicketDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      setConfirmed(false);
    }
  }, [open]);

  const { data: ticketsData } = useListTickets(
    { limit: 50, q: search || undefined },
    { query: { enabled: open } }
  );

  const merge = useMergeTicket({
    mutation: {
      onSuccess: (targetTicket) => {
        toast({ title: "Tickets merged", description: `This ticket was merged into #${targetTicket.id}` });
        queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(sourceTicketId) });
        onOpenChange(false);
        navigate(`/tickets/${targetTicket.id}`);
      },
      onError: () => {
        toast({ title: "Merge failed", description: "Could not merge the ticket. Please try again.", variant: "destructive" });
      },
    },
  });

  const candidates = (ticketsData?.data ?? []).filter(
    (t) => t.id !== sourceTicketId && t.status !== "closed" && !t.mergedIntoId
  );

  const selected = candidates.find((t) => t.id === selectedId);

  function handleMerge() {
    if (!selectedId) return;
    merge.mutate({ id: sourceTicketId, data: { targetTicketId: selectedId } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            Merge Ticket
          </DialogTitle>
          <DialogDescription>
            Choose a target ticket to merge <span className="font-medium text-foreground">#{sourceTicketId}</span> into. All comments and activity will be moved and the source ticket will be closed.
          </DialogDescription>
        </DialogHeader>

        {!confirmed ? (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets by subject..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Ticket list */}
            <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {candidates.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No tickets found</div>
              ) : (
                candidates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors",
                      selectedId === t.id
                        ? "bg-primary/10"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">#{t.id}</span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", STATUS_COLORS[t.status] ?? "")}>
                          {t.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-0.5 truncate">{t.subject}</p>
                      {t.assignee && (
                        <p className="text-xs text-muted-foreground mt-0.5">Assigned to {t.assignee.name}</p>
                      )}
                    </div>
                    {selectedId === t.id && (
                      <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                disabled={!selectedId}
                onClick={() => setConfirmed(true)}
              >
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Confirmation */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">This action cannot be undone.</p>
                <p className="mt-1 text-amber-700 dark:text-amber-300">The source ticket will be permanently closed and all its comments will be moved to the target ticket.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-1 rounded-lg border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Source (will be closed)</p>
                <p className="text-sm font-medium">#{sourceTicketId} — {sourceSubject}</p>
              </div>
              <div className="flex items-center self-center">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Target (will receive comments)</p>
                <p className="text-sm font-medium">#{selected?.id} — {selected?.subject}</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmed(false)}>Back</Button>
              <Button
                variant="destructive"
                onClick={handleMerge}
                disabled={merge.isPending}
              >
                <GitMerge className="mr-2 h-4 w-4" />
                {merge.isPending ? "Merging..." : "Confirm Merge"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

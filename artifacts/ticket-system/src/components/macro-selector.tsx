import { getApiUrl } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveMacroVariables, type MacroContext } from "@/lib/macros/variable-resolver";

type Macro = { id: number; name: string; content: string; scope: string };

export function MacroSelector({ scope, context, ticketId, userId, onInsert }: { scope: "description" | "public_comment" | "internal_comment"; context?: MacroContext; ticketId?: number | null; userId?: string | null; onInsert: (content: string) => void }) {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch(getApiUrl("/api/settings/ticket-macros"), { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setMacros(Array.isArray(data) ? data : []))
      .catch(() => setMacros([]));
  }, []);
  const available = useMemo(() => macros.filter((macro) => macro.scope === "all" || macro.scope === scope), [macros, scope]);
  if (!available.length) return null;
  const recordUsage = async (macro: Macro) => {
    try {
      const response = await fetch(getApiUrl(`/api/settings/ticket-macros/${macro.id}/usage`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, ticketId: ticketId ?? null, userId: userId ?? null }),
      });
      if (!response.ok) console.error(`Unable to record macro usage (${response.status})`);
    } catch (error) {
      console.error("Unable to record macro usage", error);
    }
  };
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start sm:w-64">Insert macro...</Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search macros..." />
            <CommandList>
              <CommandEmpty>No matching macros.</CommandEmpty>
              {available.map((macro) => (
                <CommandItem key={macro.id} value={`${macro.name} ${macro.content}`} onSelect={() => {
                  onInsert(resolveMacroVariables(macro.content, context ?? {}));
                  void recordUsage(macro);
                  setOpen(false);
                }}>
                  <span className="truncate">{macro.name}</span>
                  <span className="ml-auto max-w-[12rem] truncate text-xs text-muted-foreground">{macro.scope}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        Variables: {"{{customer_name}}"}, {"{{ticket_id}}"}, {"{{organization_name}}"}, {"{{agent_name}}"}, {"{{ticket_subject}}"}, {"{{current_date}}"}
      </p>
    </>
  );
}

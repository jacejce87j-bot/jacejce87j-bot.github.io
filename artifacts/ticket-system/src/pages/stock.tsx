import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { useSupportUser } from "@/hooks/use-support-user";

type StockItem = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  quantityOnHand: number;
  allocatedToFieldAgents: number;
};

type FieldAgent = {
  id: number;
  name: string;
  inventory: {
    stockItemId: number;
    stockItemName: string;
    sku: string | null;
    unit: string;
    quantityOnHand: number;
  }[];
};

type StockMovement = {
  id: number;
  movementType: string;
  quantityDelta: number;
  reason: string | null;
  fieldAgentName: string | null;
  ticketId: number | null;
  createdAt: string;
};

export default function StockPage() {
  const { user } = useSupportUser();
  const canManageStock = ["admin", "supervisor"].includes(user?.role ?? "");
  const [items, setItems] = useState<StockItem[]>([]);
  const [fieldAgents, setFieldAgents] = useState<FieldAgent[]>([]);
  const [form, setForm] = useState({ name: "", sku: "", unit: "units", initialQuantity: "0" });
  const [fieldAgentName, setFieldAgentName] = useState("");
  const [transfer, setTransfer] = useState({ fieldAgentId: "", stockItemId: "", quantity: "1" });
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [countedQuantities, setCountedQuantities] = useState<Record<number, string>>({});
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [movements, setMovements] = useState<Record<number, StockMovement[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl("/api/stock"), { headers: getAuthHeaders() });
      const agentsResponse = await fetch(getApiUrl("/api/stock/field-agents"), { headers: getAuthHeaders() });
      const [payload, agentsPayload] = await Promise.all([
        response.json().catch(() => ({})),
        agentsResponse.json().catch(() => ({})),
      ]);
      if (!response.ok || !agentsResponse.ok) {
        throw new Error(payload.error || agentsPayload.error || "Unable to load stock.");
      }
      setItems(payload.data ?? []);
      setFieldAgents(agentsPayload.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load stock.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const createItem = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(getApiUrl("/api/stock"), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          unit: form.unit.trim(),
          initialQuantity: Number(form.initialQuantity),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to create stock item.");
      setForm({ name: "", sku: "", unit: "units", initialQuantity: "0" });
      setNotice("Stock item added.");
      await loadItems();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create stock item.");
    } finally {
      setSaving(false);
    }
  };

  const createFieldAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(getApiUrl("/api/stock/field-agents"), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: fieldAgentName.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to add Field Agent.");
      setFieldAgentName("");
      setNotice("Field Agent added.");
      await loadItems();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add Field Agent.");
    } finally {
      setSaving(false);
    }
  };

  const transferStock = async (event: React.FormEvent) => {
    event.preventDefault();
    const quantity = Number(transfer.quantity);
    if (!transfer.fieldAgentId || !transfer.stockItemId || !Number.isSafeInteger(quantity) || quantity < 1) {
      setError("Select a Field Agent and stock item, and enter a positive quantity.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(getApiUrl("/api/stock/transfers"), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldAgentId: Number(transfer.fieldAgentId),
          stockItemId: Number(transfer.stockItemId),
          quantity,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to transfer stock.");
      setTransfer({ ...transfer, quantity: "1" });
      setNotice(`Transferred ${quantity} ${payload.transfer.item.unit} of ${payload.transfer.item.name} to ${payload.transfer.fieldAgent.name}.`);
      await loadItems();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to transfer stock.");
    } finally {
      setSaving(false);
    }
  };

  const returnStock = async (agent: FieldAgent, item: FieldAgent["inventory"][number]) => {
    const key = `${agent.id}:${item.stockItemId}`;
    const quantity = Number(returnQuantities[key] ?? "1");
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      setError("Enter a positive quantity to return.");
      return;
    }
    if (quantity > item.quantityOnHand) {
      setError(`Only ${item.quantityOnHand} ${item.unit} of ${item.stockItemName} are held by ${agent.name}.`);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(getApiUrl("/api/stock/returns"), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldAgentId: agent.id,
          stockItemId: item.stockItemId,
          quantity,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to return stock to Orion Stock.");
      setReturnQuantities((current) => ({ ...current, [key]: "1" }));
      setNotice(`Returned ${quantity} ${item.unit} of ${item.stockItemName} from ${agent.name} to Orion Stock.`);
      await loadItems();
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : "Unable to return stock to Orion Stock.");
    } finally {
      setSaving(false);
    }
  };

  const saveCount = async (item: StockItem) => {
    const quantityOnHand = Number(countedQuantities[item.id] ?? item.quantityOnHand);
    if (!Number.isSafeInteger(quantityOnHand) || quantityOnHand < 0 || !adjustmentReason.trim()) {
      setError("Enter a valid non-negative count and a reason for the adjustment.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(getApiUrl(`/api/stock/${item.id}`), {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ quantityOnHand, reason: adjustmentReason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to update stock count.");
      setAdjustmentReason("");
      setCountedQuantities((current) => ({ ...current, [item.id]: String(quantityOnHand) }));
      setNotice(`${item.name} balance updated.`);
      await loadItems();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update stock count.");
    } finally {
      setSaving(false);
    }
  };

  const loadMovements = async (itemId: number) => {
    setError(null);
    try {
      const response = await fetch(getApiUrl(`/api/stock/${itemId}/movements`), { headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load stock history.");
      setMovements((current) => ({ ...current, [itemId]: payload.data ?? [] }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load stock history.");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock</h1>
          <p className="text-muted-foreground">Manage stock balances and review usage recorded against tickets.</p>
        </div>

        {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
        {notice && <div role="status" className="rounded-md border border-green-600/30 bg-green-600/5 px-4 py-3 text-sm">{notice}</div>}

        {canManageStock && <Card>
          <CardHeader><CardTitle>Add stock item</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createItem} className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="stock-name">Item name</Label>
                <Input id="stock-name" required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-sku">SKU (optional)</Label>
                <Input id="stock-sku" maxLength={80} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-unit">Unit</Label>
                <Input id="stock-unit" required maxLength={32} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-opening">Starting balance</Label>
                <Input id="stock-opening" type="number" min={0} step={1} required value={form.initialQuantity} onChange={(event) => setForm({ ...form, initialQuantity: event.target.value })} />
              </div>
              <div className="md:col-span-5">
                <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Saving..." : "Add stock item"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>}

        {canManageStock && <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Field Agents</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={createFieldAgent} className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="field-agent-name">Field Agent name</Label>
                  <Input
                    id="field-agent-name"
                    required
                    maxLength={160}
                    value={fieldAgentName}
                    onChange={(event) => setFieldAgentName(event.target.value)}
                    placeholder="Enter Field Agent name"
                  />
                </div>
                <Button type="submit" className="mt-auto" disabled={saving || !fieldAgentName.trim()}>
                  {saving ? "Saving..." : "Add"}
                </Button>
              </form>
              {fieldAgents.length ? (
                <div className="space-y-3">
                  {fieldAgents.map((agent) => (
                    <div key={agent.id} className="rounded-md border p-3">
                      <h3 className="font-medium">{agent.name}</h3>
                      {agent.inventory.some((balance) => balance.quantityOnHand > 0) ? (
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {agent.inventory.filter((balance) => balance.quantityOnHand > 0).map((balance) => (
                            <li key={balance.stockItemId} className="flex flex-wrap items-end justify-between gap-3 rounded-md bg-muted/30 p-3">
                              <div className="min-w-[150px] flex-1">
                                <p className="font-medium text-foreground">{balance.stockItemName}</p>
                                <p>{balance.quantityOnHand} {balance.unit} with {agent.name}</p>
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor={`return-${agent.id}-${balance.stockItemId}`}>Return quantity</Label>
                                  <Input
                                    id={`return-${agent.id}-${balance.stockItemId}`}
                                    type="number"
                                    min={1}
                                    max={balance.quantityOnHand}
                                    step={1}
                                    value={returnQuantities[`${agent.id}:${balance.stockItemId}`] ?? "1"}
                                    onChange={(event) => setReturnQuantities((current) => ({
                                      ...current,
                                      [`${agent.id}:${balance.stockItemId}`]: event.target.value,
                                    }))}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={saving || !Number.isSafeInteger(Number(returnQuantities[`${agent.id}:${balance.stockItemId}`] ?? "1")) || Number(returnQuantities[`${agent.id}:${balance.stockItemId}`] ?? "1") < 1 || Number(returnQuantities[`${agent.id}:${balance.stockItemId}`] ?? "1") > balance.quantityOnHand}
                                  onClick={() => void returnStock(agent, balance)}
                                >
                                  {saving ? "Returning..." : "Return to Orion Stock"}
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="mt-1 text-sm text-muted-foreground">No stock allocated.</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No Field Agents added yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Allocate stock from Orion Stock</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={transferStock} className="space-y-4">
                <div className="space-y-2">
                  <Label>Field Agent</Label>
                  <Select
                    value={transfer.fieldAgentId}
                    onValueChange={(fieldAgentId) => setTransfer({ ...transfer, fieldAgentId })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select Field Agent" /></SelectTrigger>
                    <SelectContent>
                      {fieldAgents.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stock item</Label>
                  <Select
                    value={transfer.stockItemId}
                    onValueChange={(stockItemId) => setTransfer({ ...transfer, stockItemId })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select stock item" /></SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name} · {item.quantityOnHand} {item.unit} in Orion Stock
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-quantity">Quantity</Label>
                  <Input
                    id="transfer-quantity"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={transfer.quantity}
                    onChange={(event) => setTransfer({ ...transfer, quantity: event.target.value })}
                  />
                </div>
                <Button type="submit" disabled={saving || !transfer.fieldAgentId || !transfer.stockItemId || !items.length}>
                  {saving ? "Transferring..." : "Transfer stock"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>}

        <Card>
          <CardHeader><CardTitle>Stock on hand in Orion Stock</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {loading ? <p className="text-sm text-muted-foreground">Loading stock...</p> : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock items have been added yet.</p>
              ) : items.map((item) => (
                <div key={item.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {item.sku ? `SKU ${item.sku} · ` : ""}
                        {item.quantityOnHand} {item.unit} in Orion Stock
                        {item.allocatedToFieldAgents > 0
                          ? ` · ${item.allocatedToFieldAgents} with Field Agents · ${item.quantityOnHand + item.allocatedToFieldAgents} total`
                          : ` · ${item.quantityOnHand} total`}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void loadMovements(item.id)}>
                      {movements[item.id] ? "Refresh history" : "View history"}
                    </Button>
                  </div>
                  {canManageStock && <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
                    <div className="space-y-2">
                      <Label htmlFor={`count-${item.id}`}>Set counted balance</Label>
                      <Input
                        id={`count-${item.id}`}
                        type="number"
                        min={0}
                        step={1}
                        value={countedQuantities[item.id] ?? String(item.quantityOnHand)}
                        onChange={(event) => setCountedQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`reason-${item.id}`}>Reason for count correction</Label>
                      <Input id={`reason-${item.id}`} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="e.g. Monthly stock take" />
                    </div>
                    <Button className="self-end" disabled={saving || !adjustmentReason.trim()} onClick={() => void saveCount(item)}>Save count</Button>
                  </div>}
                  {movements[item.id] && (
                    <div className="mt-4 space-y-2 border-t pt-3">
                      <h4 className="text-sm font-medium">Recent movement history</h4>
                      {movements[item.id].length ? movements[item.id].map((movement) => (
                        <div key={movement.id} className="flex justify-between gap-3 text-sm">
                          <span>
                            {movement.movementType.replaceAll("_", " ")}
                            {movement.fieldAgentName ? ` · ${movement.fieldAgentName}` : ""}
                            {movement.ticketId ? ` · Ticket #${movement.ticketId}` : ""}
                            {movement.reason ? ` · ${movement.reason}` : ""}
                          </span>
                          <span className={movement.quantityDelta < 0 ? "text-destructive" : "text-green-700"}>
                            {movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta} {item.unit}
                          </span>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No stock movements recorded.</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

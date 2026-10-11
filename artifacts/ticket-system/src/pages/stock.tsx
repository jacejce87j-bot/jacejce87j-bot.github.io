import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { useSupportUser } from "@/hooks/use-support-user";

type StockItem = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  quantityOnHand: number;
};

type StockMovement = {
  id: number;
  movementType: string;
  quantityDelta: number;
  reason: string | null;
  ticketId: number | null;
  createdAt: string;
};

export default function StockPage() {
  const { user } = useSupportUser();
  const canManageStock = ["admin", "supervisor"].includes(user?.role ?? "");
  const [items, setItems] = useState<StockItem[]>([]);
  const [form, setForm] = useState({ name: "", sku: "", unit: "units", initialQuantity: "0" });
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load stock.");
      setItems(payload.data ?? []);
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

        <Card>
          <CardHeader><CardTitle>Stock on hand</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {loading ? <p className="text-sm text-muted-foreground">Loading stock...</p> : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock items have been added yet.</p>
              ) : items.map((item) => (
                <div key={item.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">{item.sku ? `SKU ${item.sku} · ` : ""}{item.quantityOnHand} {item.unit} on hand</p>
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
                          <span>{movement.movementType.replaceAll("_", " ")}{movement.ticketId ? ` · Ticket #${movement.ticketId}` : ""}{movement.reason ? ` · ${movement.reason}` : ""}</span>
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

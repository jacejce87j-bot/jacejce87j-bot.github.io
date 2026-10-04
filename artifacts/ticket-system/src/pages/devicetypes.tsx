import { getApiUrl } from "@/lib/api";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

type DeviceTypeRecord = {
  id: number;
  name: string;
  category: "tracking" | "camera";
};

export default function DeviceTypesPage() {
  const [trackingTypes, setTrackingTypes] = useState<DeviceTypeRecord[]>([]);
  const [cameraTypes, setCameraTypes] = useState<DeviceTypeRecord[]>([]);
  const [trackingInput, setTrackingInput] = useState("");
  const [cameraInput, setCameraInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<"tracking" | "camera" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDeviceTypes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [trackingRes, cameraRes] = await Promise.all([
        fetch(getApiUrl("/api/device-types?category=tracking"), { credentials: "include" }),
        fetch(getApiUrl("/api/device-types?category=camera"), { credentials: "include" }),
      ]);

      if (!trackingRes.ok || !cameraRes.ok) {
        throw new Error("The device type list could not be loaded.");
      }

      const trackingData = await trackingRes.json();
      const cameraData = await cameraRes.json();
      setTrackingTypes(Array.isArray(trackingData) ? trackingData : []);
      setCameraTypes(Array.isArray(cameraData) ? cameraData : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The device type list could not be loaded.");
      setTrackingTypes([]);
      setCameraTypes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchDeviceTypes();
  }, []);

  const submitDeviceType = async (category: "tracking" | "camera") => {
    const value = category === "tracking" ? trackingInput : cameraInput;
    const trimmed = value.trim();

    if (!trimmed) {
      setError(`Please enter a ${category} device type before saving.`);
      return;
    }

    setIsSubmitting(category);
    setError(null);

    try {
      const response = await fetch(getApiUrl("/api/device-types"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, category }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? `Failed to add ${category} device type.`);
      }

      if (category === "tracking") setTrackingInput("");
      if (category === "camera") setCameraInput("");
      await fetchDeviceTypes();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The device type could not be saved.");
    } finally {
      setIsSubmitting(null);
    }
  };

  const deleteDeviceType = async (id: number) => {
    const response = await fetch(getApiUrl(`/api/device-types/${id}`), {
      method: "DELETE",
      credentials: "include",
    });

    if (response.ok) {
      await fetchDeviceTypes();
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Device Types</h1>
          <p className="text-muted-foreground">Manage the tracking and camera device types available for new tickets.</p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tracking Devices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={trackingInput}
                  onChange={(event) => setTrackingInput(event.target.value)}
                  placeholder="Enter tracking device type"
                />
                <Button
                  onClick={() => void submitDeviceType("tracking")}
                  disabled={isSubmitting !== null || !trackingInput.trim()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isSubmitting === "tracking" ? "Saving..." : "Add"}
                </Button>
              </div>

              <div className="space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : trackingTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tracking device types yet.</p>
                ) : (
                  trackingTypes.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span>{item.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => void deleteDeviceType(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Camera Devices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={cameraInput}
                  onChange={(event) => setCameraInput(event.target.value)}
                  placeholder="Enter camera device type"
                />
                <Button
                  onClick={() => void submitDeviceType("camera")}
                  disabled={isSubmitting !== null || !cameraInput.trim()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isSubmitting === "camera" ? "Saving..." : "Add"}
                </Button>
              </div>

              <div className="space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : cameraTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No camera device types yet.</p>
                ) : (
                  cameraTypes.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span>{item.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => void deleteDeviceType(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

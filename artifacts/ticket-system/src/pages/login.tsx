import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login() {
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Guard against double submission clicks

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Explicitly trim email string to remove auto-fill trailing spaces
        body: JSON.stringify({ email: email.trim(), password }),
      });

      // 💡 SAFE RESPONSE PARSING:
      // Read raw text first to avoid uncaught JSON.parse exceptions on empty/HTML bodies
      const rawText = await res.text();
      let data: any = {};

      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          // Response is not JSON (e.g., HTML 404 page or unhandled text)
          throw new Error(`Server returned non-JSON response (HTTP ${res.status}).`);
        }
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `Authentication failed (HTTP ${res.status}).`);
      }

      if (!data.token) {
        throw new Error("No authentication token received from server.");
      }

      // Store under all key variants matching sign-in.tsx / Expo cross-compat
      localStorage.setItem("userToken", data.token);
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("token", data.token);

      // Invalidate query cache for auth state
      await queryClient.invalidateQueries({
        queryKey: ["/api/auth/user"],
      });

      // Hard navigate to force fresh workspace load
      window.location.href = "/";
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "An unexpected error occurred.");
      setIsSubmitting(false); // Re-enable submission on error
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      {/* Orion Tracking Full Logo */}
      <div className="mb-6 flex justify-center">
        <img
          src="/orion-logo-full.png"
          alt="Orion Tracking Logo"
          className="h-16 w-auto object-contain"
        />
      </div>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Sign in to SupportDesk</CardTitle>
          <CardDescription>
            Enter your internal credentials to access the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="agent@oriontracking.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
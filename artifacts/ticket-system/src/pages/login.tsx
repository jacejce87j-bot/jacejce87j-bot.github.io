import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Headset, ShieldCheck } from "lucide-react";

export default function Login() {
  const { login, isLoading } = useAuth();

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md items-center justify-center">
        <Card className="w-full overflow-hidden shadow-lg">
          <div className="flex items-center gap-3 bg-sidebar px-6 py-5 text-sidebar-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Headset className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold">SupportDesk</div>
              <div className="text-xs text-sidebar-foreground/70">Ticket management workspace</div>
            </div>
          </div>
          <CardHeader className="space-y-2 pb-4 pt-8 text-center">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to manage tickets, customer records, SLA policies, and attachments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pb-8">
            <Button className="w-full" size="lg" onClick={login} disabled={isLoading}>
              {isLoading ? "Checking session..." : "Log in"}
            </Button>
            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Your session protects workspace data and private ticket attachments.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
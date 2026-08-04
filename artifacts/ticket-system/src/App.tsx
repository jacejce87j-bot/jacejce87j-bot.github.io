import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import TicketList from "@/pages/tickets/index";
import ContactList from "@/pages/contacts/index";
import OrganizationList from "@/pages/organizations/index";
import AgentList from "@/pages/agents/index";
import Settings from "@/pages/settings";
import TicketDetail from "@/pages/tickets/[id]";
import NewTicket from "@/pages/tickets/new";
import ContactDetail from "@/pages/contacts/[id]";
import OrganizationDetail from "@/pages/organizations/[id]";
import Login from "@/pages/login";
import { useAuth } from "@workspace/replit-auth-web";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path="/tickets" component={TicketList} />
      <Route path="/tickets/new" component={NewTicket} />
      <Route path="/tickets/:id" component={TicketDetail} />
      <Route path="/contacts" component={ContactList} />
      <Route path="/contacts/:id" component={ContactDetail} />
      <Route path="/organizations" component={OrganizationList} />
      <Route path="/organizations/:id" component={OrganizationDetail} />
      <Route path="/agents" component={AgentList} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="text-sm text-muted-foreground">Checking your session...</div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

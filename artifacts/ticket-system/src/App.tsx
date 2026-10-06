import { Component, type ErrorInfo, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import TicketList from "@/pages/tickets/index";
import ContactList from "@/pages/contacts/index";
import OrganizationList from "@/pages/organizations/index";
import AgentList from "@/pages/agents/index";
import Settings from "@/pages/settings";
import Users from "@/pages/users/index";
import DeviceTypesPage from "@/pages/devicetypes";
import Reports from "@/pages/reports";
import OrganizationReports from "@/pages/reports/organizations";
import HealthReportPage from "@/pages/reports/health";
import SlaReports from "@/pages/reports/sla";
import AgentKpisReport from "@/pages/reports/agent-kpis";
import ReportBuilder from "@/pages/reports/builder";
import TicketDetailsReport from "@/pages/reports/ticket-details";
import KnowledgeBasePage from "@/pages/knowledge-base";
import TicketDetail from "@/pages/tickets/[id]";
import NewTicket from "@/pages/tickets/new";
import ContactDetail from "@/pages/contacts/[id]";
import OrganizationDetail from "@/pages/organizations/[id]";
import Login from "@/pages/login";
import PasswordChange from "@/pages/password-change";
import { useSupportUser } from "@/hooks/use-support-user";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppRoutes() {
  const { user, isLoading, accessDenied } = useSupportUser();

  if (isLoading) {
    return <LoadingScreen label="Loading your SupportDesk workspace..." />;
  }

  const isSignedIn = !!user;

  // 1. Unauthenticated Route Guard
  if (!isSignedIn) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/sign-in" component={Login} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  // 2. Access Denied Guard
  if (accessDenied) {
    return <AccessDenied />;
  }

  if (user?.mustChangePassword) {
    return <PasswordChange />;
  }

  // 3. Authenticated Route Tree (Direct children under Switch, no Fragments)
  return (
    <Switch>
      <Route path="/login">
        <Redirect to="/" />
      </Route>
      <Route path="/sign-in">
        <Redirect to="/" />
      </Route>

      <Route path="/" component={Dashboard} />
      <Route path="/tickets" component={TicketList} />
      <Route path="/tickets/new" component={TicketCreationRoute} />
      <Route path="/tickets/:id" component={TicketDetail} />
      <Route path="/contacts" component={ContactList} />
      <Route path="/contacts/:id" component={ContactDetail} />
      <Route path="/users" component={Users} />
      <Route path="/devicetypes" component={DeviceTypesPage} />
      <Route path="/reports" component={Reports} />
      <Route path="/reports/organizations" component={OrganizationReports} />
      <Route path="/reports/builder" component={ReportBuilder} />
      <Route path="/reports/ticket-details" component={TicketDetailsReport} />
      <Route path="/reports/health" component={HealthReportPage} />
      <Route path="/reports/sla" component={SlaReports} />
      <Route path="/reports/agent-kpis" component={AgentKpisReport} />
      <Route path="/knowledge-base/:id" component={KnowledgeBasePage} />
      <Route path="/knowledge-base" component={KnowledgeBasePage} />
      <Route path="/organizations" component={OrganizationList} />
      <Route path="/organizations/:id" component={OrganizationDetail} />
      <Route path="/agents" component={AgentList} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function TicketCreationRoute() {
  return (
    <RouteErrorBoundary>
      <NewTicket />
    </RouteErrorBoundary>
  );
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ticket creation page failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="w-full max-w-lg rounded-xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold">Ticket creation could not load</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The form encountered an unexpected error. Reload the page to try again.
            </p>
            <Button type="button" className="mt-6" onClick={() => window.location.reload()}>
              Reload ticket form
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

class AppErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SupportDesk application failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="w-full max-w-lg rounded-xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold">SupportDesk could not load</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An unexpected error stopped this page from rendering. Reload to try again.
            </p>
            <Button type="button" className="mt-6" onClick={() => window.location.reload()}>
              Reload SupportDesk
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Workspace access unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is signed in, but it could not be provisioned for SupportDesk.
          Contact an administrator for access.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
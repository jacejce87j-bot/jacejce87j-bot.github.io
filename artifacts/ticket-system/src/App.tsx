import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import {
  ClerkProvider,
  SignUp,
  useAuth as useClerkAuth,
  useClerk,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
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
import { useSupportUser } from "@/hooks/use-support-user";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function AppRoutes() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user, isLoading: isSupportUserLoading, accessDenied } = useSupportUser();

  if (!isLoaded) {
    return <LoadingScreen label="Loading secure sign-in..." />;
  }

  return (
    <Switch>
      <Route path="/sign-in/*?" component={Login} />
      <Route
        path="/sign-up/*?"
        component={() => (
          <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
            <SignUp
              routing="path"
              path={`${basePath}/sign-up`}
              signInUrl={`${basePath}/sign-in`}
            />
          </main>
        )}
      />
      {!isSignedIn ? (
        <Route>
          <Redirect to="/sign-in" />
        </Route>
      ) : isSupportUserLoading ? (
        <Route>
          <LoadingScreen label="Loading your SupportDesk workspace..." />
        </Route>
      ) : accessDenied || !user ? (
        <Route>
          <AccessDenied />
        </Route>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/tickets" component={TicketList} />
          <Route
            path="/tickets/new"
            component={() => (
              <RouteErrorBoundary>
                <NewTicket />
              </RouteErrorBoundary>
            )}
          />
          <Route path="/tickets/:id" component={TicketDetail} />
          <Route path="/contacts" component={ContactList} />
          <Route path="/contacts/:id" component={ContactDetail} />
          <Route path="/organizations" component={OrganizationList} />
          <Route path="/organizations/:id" component={OrganizationDetail} />
          <Route path="/agents" component={AgentList} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </>
      )}
    </Switch>
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
        <AppLayout>
          <div className="flex min-h-full items-center justify-center p-8">
            <div className="max-w-lg rounded-xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
              <h1 className="text-xl font-semibold">Ticket creation could not load</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The form encountered an unexpected error. Reload the page to try again.
              </p>
              <Button type="button" className="mt-6" onClick={() => window.location.reload()}>
                Reload ticket form
              </Button>
            </div>
          </div>
        </AppLayout>
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

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function ClerkApp() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        theme: shadcn,
        cssLayerName: "clerk",
        options: {
          logoPlacement: "inside",
          logoLinkUrl: basePath || "/",
          logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
        },
        variables: {
          colorPrimary: "#2563eb",
          colorForeground: "#0f172a",
          colorMutedForeground: "#64748b",
          colorBackground: "#ffffff",
          colorInput: "#ffffff",
          colorInputForeground: "#0f172a",
          colorNeutral: "#cbd5e1",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          borderRadius: "0.5rem",
        },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Sign in to SupportDesk",
            subtitle: "Welcome back. Sign in to continue.",
          },
        },
        signUp: {
          start: {
            title: "Create your SupportDesk account",
            subtitle: "Get started with your support workspace.",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryClientCacheInvalidator />
      <AppRoutes />
    </ClerkProvider>
  );
}


export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkApp />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
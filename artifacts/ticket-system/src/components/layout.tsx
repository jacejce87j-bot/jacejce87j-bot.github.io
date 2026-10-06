import { getApiUrl } from "@/lib/api";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Ticket,
  Users,
  Building2,
  Settings,
  Headset,
  FolderCog,
  BarChart3,
  Gauge,
  Activity,
  BookOpen,
  LogOut,
} from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { useSupportUser } from "@/hooks/use-support-user";

interface LayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useSupportUser();

  const handleLogout = () => {
    // 1. Get token before clearing storage
    const token = localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token");

    // 2. Synchronously wipe ALL local and session storage FIRST
    localStorage.removeItem("userToken");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("token");
    // also remove legacy keys
    localStorage.removeItem("user_token");
    sessionStorage.clear();

    // 3. Clear TanStack Query memory cache entirely
    queryClient.removeQueries({ queryKey: ["/api/auth/user"] });
    queryClient.clear();

    // 4. Non-blocking fire-and-forget backend notification
    if (token) {
      fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).catch(() => {}); // Intentionally non-blocking
    }

    // 4b. Clear any global/native token copies used by mobile/native transport
    try {
      if ((globalThis as any).__AUTH_TOKEN__) delete (globalThis as any).__AUTH_TOKEN__;
      if ((globalThis as any).__API_BASE_URL__) delete (globalThis as any).__API_BASE_URL__;
    } catch (e) {
      // ignore
    }

    // 5. Calculate correct login path respecting Vite BASE_URL
    const baseUrl = import.meta.env.BASE_URL || "/";
    const loginPath = baseUrl.endsWith("/") ? `${baseUrl}login` : `${baseUrl}/login`;

    // 6. Hard redirect to login screen
    window.location.href = loginPath;
  };

  const navGroups = [
    {
      label: "Work",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/tickets", label: "Tickets", icon: Ticket },
      ],
    },
    {
      label: "People & Accounts",
      items: [
        { href: "/contacts", label: "Contacts", icon: Users },
        { href: "/organizations", label: "Organisations", icon: Building2 },
        { href: "/users", label: "Users", icon: Users },
        { href: "/agents", label: "Agents", icon: Headset },
      ],
    },
    {
      label: "Fleet / Operations",
      items: [
        { href: "/devicetypes", label: "Device Types", icon: FolderCog },
        { href: "/reports/health", label: "Vehicle Health", icon: Activity },
      ],
    },
    {
      label: "Analytics",
      items: [
        { href: "/reports", label: "Reports", icon: BarChart3 },
        { href: "/reports/builder", label: "Report Builder", icon: BarChart3 },
        { href: "/reports/agent-kpis", label: "Agent KPIs", icon: Gauge },
      ],
    },
    {
      label: "Knowledge / Administration",
      items: [
        { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <nav className="w-64 border-r border-border bg-sidebar flex-shrink-0 flex flex-col">
        {/* Navigation Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <img 
              src="/orion-logo.png" 
              alt="Orion" 
              className="h-6 w-auto object-contain flex-shrink-0" 
            />
            <span className="font-bold text-lg text-sidebar-foreground tracking-tight truncate">
              SupportDesk
            </span>
          </div>
          <NotificationBell />
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-5 px-3">
            {navGroups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {group.label}
                </h2>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const isActive =
                      location === item.href ||
                      (item.href !== "/" && location.startsWith(item.href));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        {/* User Footer & Logout */}
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-md px-3 py-2">
            <div className="truncate text-sm font-medium text-sidebar-foreground">
              {[user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
                "Support user"}
            </div>
            <div className="truncate text-xs text-sidebar-foreground/60">
              {user?.email || "Signed in"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </nav>

      {/* Main Content Viewport */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
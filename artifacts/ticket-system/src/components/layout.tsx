import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Ticket,
  Users,
  Building2,
  Settings,
  Headset,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/organizations", label: "Organizations", icon: Building2 },
    { href: "/agents", label: "Agents", icon: Headset },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <nav className="w-64 border-r border-border bg-sidebar flex-shrink-0 flex flex-col">
        <div className="h-14 flex items-center px-6 border-b border-sidebar-border">
          <span className="font-bold text-lg text-sidebar-foreground tracking-tight">SupportDesk</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link href={item.href} className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

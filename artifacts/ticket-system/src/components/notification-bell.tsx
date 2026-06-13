import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { Bell, BellRing, Wifi, WifiOff, CheckCheck, X, AlertTriangle, Clock, MessageSquare, Ticket, UserCheck, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, type Notification, type NotificationType } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";

function NotifIcon({ type }: { type: NotificationType }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (type) {
    case "ticket:sla_breach":   return <AlertTriangle className={cn(cls, "text-red-500")} />;
    case "ticket:sla_warning":  return <Clock className={cn(cls, "text-amber-500")} />;
    case "ticket:created":      return <Plus className={cn(cls, "text-blue-500")} />;
    case "ticket:assigned":     return <UserCheck className={cn(cls, "text-violet-500")} />;
    case "ticket:status_changed": return <Ticket className={cn(cls, "text-sky-500")} />;
    case "comment:added":       return <MessageSquare className={cn(cls, "text-emerald-500")} />;
    default:                    return <Bell className={cls} />;
  }
}

function urgencyColor(type: NotificationType): string {
  if (type === "ticket:sla_breach") return "border-l-red-500";
  if (type === "ticket:sla_warning") return "border-l-amber-400";
  return "border-l-border";
}

export function NotificationBell() {
  const { notifications, unreadCount, connected, markAllRead, markRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  function handleNotifClick(n: Notification) {
    markRead(n.id);
    if (n.ticketId) {
      navigate(`/tickets/${n.ticketId}`);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open && unreadCount > 0) {} }}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          open && "bg-sidebar-accent text-sidebar-foreground",
        )}
        aria-label="Notifications"
      >
        {unreadCount > 0
          ? <BellRing className="h-4 w-4 animate-[ring_1.5s_ease-in-out_infinite]" />
          : <Bell className="h-4 w-4" />
        }
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            ref={panelRef}
            className="absolute right-0 top-10 z-50 w-80 rounded-lg border border-border bg-card shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-card-foreground">Notifications</span>
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                    connected ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
                  )}
                  title={connected ? "Live" : "Reconnecting..."}
                >
                  {connected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                </span>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">SLA alerts and updates will appear here</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        "relative flex gap-3 px-4 py-3 cursor-pointer border-l-2 transition-colors",
                        urgencyColor(n.type),
                        n.read
                          ? "bg-card hover:bg-muted/40"
                          : "bg-primary/5 hover:bg-primary/10",
                      )}
                      onClick={() => handleNotifClick(n)}
                    >
                      <div className="mt-0.5">
                        <NotifIcon type={n.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-xs font-medium leading-tight", n.read ? "text-foreground/70" : "text-foreground")}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                        className="absolute top-2 right-6 opacity-0 group-hover:opacity-100 hover:text-foreground text-muted-foreground/50 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

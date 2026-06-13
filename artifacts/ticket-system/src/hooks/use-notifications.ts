import { useEffect, useRef, useState, useCallback } from "react";

export type NotificationType =
  | "ticket:created"
  | "ticket:assigned"
  | "ticket:status_changed"
  | "ticket:sla_breach"
  | "ticket:sla_warning"
  | "comment:added"
  | "connected";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  ticketId?: number;
  timestamp: string;
  read: boolean;
}

function buildNotification(raw: Record<string, unknown>): Notification | null {
  const id = `${Date.now()}-${Math.random()}`;
  const timestamp = (raw.timestamp as string) ?? new Date().toISOString();
  const ticketId = raw.ticketId as number | undefined;

  switch (raw.type as NotificationType) {
    case "ticket:created":
      return {
        id, type: "ticket:created", ticketId, timestamp, read: false,
        title: "New ticket created",
        body: `#${ticketId} — ${raw.subject} (${raw.priority})`,
      };
    case "ticket:assigned":
      return {
        id, type: "ticket:assigned", ticketId, timestamp, read: false,
        title: "Ticket assigned",
        body: `#${ticketId} assigned to ${raw.agentName}`,
      };
    case "ticket:status_changed":
      return {
        id, type: "ticket:status_changed", ticketId, timestamp, read: false,
        title: "Ticket status changed",
        body: `#${ticketId} changed from ${raw.oldStatus} to ${raw.newStatus}`,
      };
    case "ticket:sla_breach":
      return {
        id, type: "ticket:sla_breach", ticketId, timestamp, read: false,
        title: "SLA breached",
        body: `#${ticketId} — ${raw.subject} is ${raw.minutesOverdue}m overdue`,
      };
    case "ticket:sla_warning":
      return {
        id, type: "ticket:sla_warning", ticketId, timestamp, read: false,
        title: "SLA warning",
        body: `#${ticketId} — ${raw.subject} breaches in ${raw.minutesUntilBreach}m`,
      };
    case "comment:added":
      return {
        id, type: "comment:added", ticketId, timestamp, read: false,
        title: "New comment",
        body: `${raw.authorName ?? "Someone"} commented on #${ticketId}`,
      };
    default:
      return null;
  }
}

const MAX_NOTIFICATIONS = 50;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const addNotification = useCallback((n: Notification) => {
    setNotifications((prev) => [n, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = RECONNECT_BASE_MS;
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as Record<string, unknown>;
        if (data.type === "connected") return;
        const n = buildNotification(data);
        if (n) addNotification(n);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (unmounted.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [addNotification]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, connected, markRead, markAllRead, dismiss };
}

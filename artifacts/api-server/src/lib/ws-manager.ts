import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
import { logger } from "./logger";
import { JWT_SECRET } from "./jwt-secret";

export type NotificationEvent =
  | { type: "ticket:created"; ticketId: number; subject: string; priority: string; assigneeId: number | null }
  | { type: "ticket:assigned"; ticketId: number; subject: string; agentId: number; agentName: string }
  | { type: "ticket:status_changed"; ticketId: number; subject: string; oldStatus: string; newStatus: string }
  | { type: "ticket:sla_breach"; ticketId: number; subject: string; priority: string; minutesOverdue: number }
  | { type: "ticket:sla_warning"; ticketId: number; subject: string; priority: string; minutesUntilBreach: number }
  | { type: "comment:added"; ticketId: number; subject: string; authorName: string | null; isPublic: boolean };

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // 1. Authenticate connection via query string: /ws?token=YOUR_JWT
    const requestUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const token = requestUrl.searchParams.get("token");

    if (!token) {
      logger.warn({ ip: req.socket.remoteAddress }, "WebSocket connection rejected: Missing token");
      ws.close(4001, "Unauthorized: Token required");
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err) {
      logger.warn({ ip: req.socket.remoteAddress }, "WebSocket connection rejected: Invalid token");
      ws.close(4001, "Unauthorized: Invalid token");
      return;
    }

    logger.info({ ip: req.socket.remoteAddress }, "WebSocket client authenticated & connected");

    ws.on("close", () => {
      logger.info("WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
    });

    // 2. Send welcome ping
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
  });

  wss.on("error", (err) => {
    logger.error({ err }, "WebSocket server error");
  });

  logger.info("WebSocket server initialised at /ws");
  return wss;
}

export function broadcast(event: NotificationEvent): void {
  if (!wss) return;
  const payload = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });
  if (sent > 0) {
    logger.info({ eventType: event.type, recipients: sent }, "WS event broadcast");
  }
}

export function getConnectedClients(): number {
  if (!wss) return 0;
  let count = 0;
  wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) count++; });
  return count;
}
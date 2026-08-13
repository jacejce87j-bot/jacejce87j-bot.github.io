import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/ws-manager";
import { startSlaChecker } from "./lib/sla-checker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Read HOST from process.env, defaulting to '0.0.0.0' for Tailscale accessibility
const host = process.env["HOST"] || "0.0.0.0";

const server = createServer(app);
initWebSocketServer(server);
startSlaChecker(60_000);

// Bind server explicitly to host and port
server.listen(port, host, () => {
  logger.info({ port, host }, `Server listening on http://${host}:${port}`);
});

server.on("error", (err) => {
  logger.error({ err }, "HTTP server error");
  process.exit(1);
});
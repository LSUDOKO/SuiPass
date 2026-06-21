// SuiPass: App factory — hostname-routed Hono app
// Routes: mcp.* -> MCP + API, single process

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppDeps } from "./deps";
import { mcpRoutes } from "./mcp/routes";
import { apiRoutes } from "./api/routes";
import { oauthRoutes } from "./oauth/routes";

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  // Global middleware
  app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "content-type"], exposeHeaders: ["x-suipass-payment"] }));

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0", name: "suipass" }));

  // Dashboard API
  app.route("/api", apiRoutes(deps));

  // OAuth 2.1 authorization server
  app.route("/oauth", oauthRoutes(deps));

  // MCP routes (card-specific endpoints)
  app.route("/", mcpRoutes(deps));

  return app;
}

// SuiPass: MCP route handler — serves the per-card MCP server tools
// Lanes: secret-in-URL path: /c/<secret>/mcp

import { Hono } from "hono";
import type { AppDeps } from "../deps";
import { buildMcpServer } from "./server";
import { hashCardSecret } from "@suipass/engine";

export function mcpRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  // Secret-in-URL lane: /c/<secret>/mcp
  app.post("/c/:secret/mcp", async (c) => {
    const secret = c.req.param("secret")!;
    const secretHash = hashCardSecret(secret);
    const card = deps.store.getCardBySecretHash(secretHash);

    if (!card) {
      return c.json({ error: "card not found" }, 404);
    }

    const server = buildMcpServer(deps, card);

    // MCP Streamable HTTP transport
    const body = await c.req.json();
    const response = await server.handleRequest(body);
    return c.json(response);
  });

  // MCP over SSE or GET (basic info)
  app.get("/c/:secret/mcp", async (c) => {
    const secret = c.req.param("secret")!;
    const secretHash = hashCardSecret(secret);
    const card = deps.store.getCardBySecretHash(secretHash);

    if (!card) {
      return c.text("card not found", 404);
    }

    return c.json({
      name: "suipass",
      version: "1.0.0",
      card: card.name,
      status: card.status,
      instructions: "Send POST requests with MCP JSON-RPC payloads to this endpoint.",
    });
  });

  return app;
}

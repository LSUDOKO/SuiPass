// SuiPass: Dashboard REST API (zkLogin-authed)
// Replaces Privy-based auth with zkLogin JWT verification.
// Key endpoints: onboard (zkLogin), compile (Venice), issue card, manage cards.

import { Hono } from "hono";
import { z } from "zod";
import { RefusalError, EngineError } from "@suipass/engine";
import type { AppDeps } from "../deps";
import { verifyAuthHeader } from "./zklogin";
import type { CardTerms } from "@suipass/engine";

export function apiRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  // Middleware: authenticate via zkLogin JWT
  app.use("*", async (c, next) => {
    const auth = c.req.header("authorization");
    const verified = await verifyAuthHeader(deps.verifyZkLoginToken, auth);

    if (!verified) {
      // Allow unauthenticated access to public endpoints
      c.set("userId", null);
      c.set("userAddress", null);
    } else {
      c.set("userId", verified.userId);
      c.set("userAddress", verified.address);
      c.set("zkPayload", verified.payload);

      // Auto-onboard: create user if first visit
      const existing = deps.store.getUserByAddress(verified.address);
      if (!existing) {
        deps.store.upsertUser({
          id: verified.userId,
          address: verified.address,
          authJson: JSON.stringify(verified.payload),
        });
      }
    }
    await next();
  });

  // ─── Auth Status ───

  app.get("/auth/status", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ authed: false });
    return c.json({
      authed: true,
      userId,
      address: c.get("userAddress"),
      name: c.get("zkPayload")?.name,
      email: c.get("zkPayload")?.email,
      picture: c.get("zkPayload")?.picture,
    });
  });

  // ─── Onboard (zkLogin verifies, user created in middleware) ───

  app.post("/onboard", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);

    const user = deps.store.getUser(userId);
    return c.json({
      onboarded: true,
      userId: user!.id,
      address: user!.address,
    });
  });

  // ─── Cards ───

  app.get("/cards", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const cards = deps.store.listCards(userId);
    return c.json({ cards: cards.map((cr) => ({ id: cr.id, name: cr.name, status: cr.status, terms: cr.terms })) });
  });

  app.get("/cards/:id", async (c) => {
    const card = deps.store.getCard(c.req.param("id")!);
    if (!card) return c.json({ error: "not found" }, 404);
    return c.json({
      id: card.id,
      name: card.name,
      status: card.status,
      terms: card.terms,
      card_obj_id: card.card_obj_id,
      cap_id: card.cap_id,
      created_at: card.created_at,
    });
  });

  app.get("/cards/:id/tree", async (c) => {
    const cardId = c.req.param("id")!;
    const chain = deps.store.ancestorChain(cardId);
    return c.json({ chain: chain.map((cr) => ({ id: cr.id, name: cr.name, status: cr.status })) });
  });

  // ─── Compile (Venice NL -> CardTerms) ───

  app.post("/compile", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    if (!deps.veniceChat) return c.json({ error: "NL compiler not available (no VENICE_API_KEY)" }, 503);

    const body = await c.req.json<{ prompt: string }>();
    if (!body.prompt) return c.json({ error: "prompt required" }, 400);

    const { compileCard } = await import("../venice/compiler");
    const result = await compileCard(deps.veniceChat, body.prompt);
    return c.json(result);
  });

  // ─── Issue Card ───

  app.post("/cards", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);

    const body = await c.req.json<{ name: string; terms: CardTerms }>();
    if (!body.name || !body.terms) return c.json({ error: "name and terms required" }, 400);

    const { issueRootCard } = await import("@suipass/engine");
    const result = await issueRootCard(
      { store: deps.store, suiClient: deps.suiClient, gasSponsor: deps.gasSponsor, packageId: deps.packageId },
      { userId, name: body.name, terms: body.terms },
    );

    return c.json({
      card_id: result.cardId,
      secret: result.secret,
      terms: result.terms,
      card_obj_id: result.cardObjId,
    });
  });

  // ─── Freeze / Unfreeze / Revoke ───

  app.post("/cards/:id/freeze", async (c) => {
    const { freezeCard } = await import("@suipass/engine");
    await freezeCard({ store: deps.store, suiClient: deps.suiClient, gasSponsor: deps.gasSponsor, packageId: deps.packageId }, c.req.param("id")!);
    return c.json({ frozen: true });
  });

  app.post("/cards/:id/unfreeze", async (c) => {
    const { unfreezeCard } = await import("@suipass/engine");
    await unfreezeCard({ store: deps.store, suiClient: deps.suiClient, gasSponsor: deps.gasSponsor, packageId: deps.packageId }, c.req.param("id")!);
    return c.json({ unfrozen: true });
  });

  app.post("/cards/:id/revoke", async (c) => {
    const { revokeCard } = await import("@suipass/engine");
    await revokeCard({ store: deps.store, suiClient: deps.suiClient, gasSponsor: deps.gasSponsor, packageId: deps.packageId }, c.req.param("id")!);
    return c.json({ revoked: true });
  });

  // ─── Charges / Activity ───

  app.get("/cards/:id/charges", async (c) => {
    const card = deps.store.getCard(c.req.param("id")!);
    if (!card) return c.json({ error: "not found" }, 404);
    const charges = deps.store.listCharges(card.id);
    return c.json({ charges });
  });

  app.get("/cards/:id/activity", async (c) => {
    const card = deps.store.getCard(c.req.param("id")!);
    if (!card) return c.json({ error: "not found" }, 404);
    const logs = deps.store.listEventLogs(card.id);
    return c.json({ activity: logs });
  });

  // ─── Error handler ───

  app.onError(async (err, c) => {
    if (err instanceof RefusalError) {
      return c.json(err.toJSON(), 422);
    }
    if (err instanceof EngineError) {
      return c.json({ error: `${err.stage}: ${err.message}` }, 500);
    }
    return c.json({ error: err.message ?? "internal error" }, 500);
  });

  return app;
}

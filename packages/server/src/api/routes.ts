// SuiPass: Dashboard REST API (zkLogin-authed)
// Replaces Privy-based auth with zkLogin JWT verification.
// Key endpoints: onboard (zkLogin), compile (Venice), issue card, manage cards.

import { Hono } from "hono";
import { z } from "zod";
import { RefusalError, EngineError } from "@suipass/engine";
import type { AppDeps } from "../deps";
import { verifyAuthHeader, type ZkLoginPayload } from "./zklogin";
import type { CardTerms } from "@suipass/engine";

declare module "hono" {
  interface ContextVariableMap {
    userId: string | null;
    userAddress: string | null;
    zkPayload: ZkLoginPayload | null;
  }
}

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

const { compileIntent } = await import("../venice/compiler");
const result = await compileIntent(body.prompt, { chat: deps.veniceChat, resolvers: (await import("../venice/resolvers")).registryResolvers() });
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

  app.delete("/cards/:id", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const cardId = c.req.param("id")!;
    const card = deps.store.getCard(cardId);
    if (!card) return c.json({ error: "not found" }, 404);
    const n = deps.store.deleteCardTree(cardId);
    return c.json({ deleted: n > 0 });
  });

  app.post("/nuke", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const { nukeAll } = await import("@suipass/engine");
    await nukeAll({ store: deps.store, suiClient: deps.suiClient, gasSponsor: deps.gasSponsor, packageId: deps.packageId }, userId);
    return c.json({ nuked: true });
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

  // ─── Demo paywall marketplace (for hackathon demos) ───
  // Products available:
  //   $0.50 — AI Training Dataset (1.2M rows, parquet, 340 MB)
  //   $1.00 — Real-time Market Data Feed (Sui DEX volume, top 50 pairs)
  //   $2.00 — Premium API Access (30-day key, 10K req/day, webhook support)
  //
  // The paid_fetch MCP tool parses the 402 body's accepts array, finds
  // scheme "x-sui" / network "sui-testnet", pays the USDC amount from
  // the card, and retries with X-SuiPass-Payment.

  const DEMO_PRODUCTS = [
    {
      id: "ai-dataset",
      name: "AI Training Dataset",
      price: "0.50",
      description: "High-quality curated dataset for ML model training",
      rows: 1200000,
      format: "parquet",
      size_mb: 340,
      features: ["Labeled 1.2M rows", "Clean UTF-8", "Schema included", "CC0 license"],
    },
    {
      id: "market-feed",
      name: "Real-time Market Data Feed",
      price: "1.00",
      description: "Live Sui DEX volume, liquidity, and price feeds — top 50 trading pairs",
      pairs: 50,
      exchanges: ["Cetus", "DeepBook V3", "Turbos", "Kriya", "FlowX"],
      update_ms: 1000,
      fields: ["price", "volume_24h", "tvl", "fee_rate", "spread"],
      sample: {
        pair: "SUI/USDC",
        price: "2.8471",
        volume_24h: "12458320.50",
        tvl: "8923451.00",
        change_24h: "+3.42%",
      },
    },
    {
      id: "api-access",
      name: "Premium API Access Pass",
      price: "2.00",
      description: "Full API access with webhooks and priority support for 30 days",
      duration_days: 30,
      rate_limit: "10,000 req/day",
      features: ["REST + WebSocket", "Webhook callbacks", "Priority support SLA", "Usage analytics dashboard"],
      endpoints: [
        { path: "/v1/market/dex", method: "GET", desc: "All DEX pairs with real-time stats" },
        { path: "/v1/market/sui/deep", method: "GET", desc: "DeepBook V3 order book snapshots" },
        { path: "/v1/agent/spend", method: "POST", desc: "Execute agentic payments via card" },
        { path: "/v1/analytics/volume", method: "GET", desc: "Historical volume aggregations" },
      ],
    },
  ] as const;

  // Default: first product (AI dataset)
  app.get("/demo/premium-data", async (c) => {
    const productId = c.req.query("product") ?? "ai-dataset";
    const product = DEMO_PRODUCTS.find((p) => p.id === productId) ?? DEMO_PRODUCTS[0];

    const paid = c.req.header("X-SuiPass-Payment");
    if (paid) {
      // Payment confirmed — serve the premium content
      return c.json({
        purchased: true,
        product: product.name,
        tx_ref: paid.slice(0, 16) + "...",
        downloaded_at: new Date().toISOString(),
        data: product,
        license: "MIT — free to use, no attribution required",
      });
    }

    // Payment required — return x402 compliant 402 with Sui payment option
    return c.json(
      {
        status: "payment_required",
        accepts: [{ scheme: "x-sui", network: "sui-testnet", amount: product.price }],
        description: `${product.name} · $${product.price} USDC`,
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          price_usdc: product.price,
        },
        available_products: DEMO_PRODUCTS.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          description: p.description,
        })),
      },
      402,
    );
  });

  // Product listing (no paywall — shows the marketplace catalog)
  app.get("/demo/products", async (c) => {
    return c.json({
      marketplace: "SuiPass Premium Data Marketplace",
      products: DEMO_PRODUCTS.map((p) => ({
        id: p.id,
        name: p.name,
        price: `$${p.price} USDC`,
        description: p.description,
      })),
      payment: {
        scheme: "x-sui",
        network: "sui-testnet",
        how_to_buy: "Use an AI agent with a SuiPass card via the paid_fetch MCP tool",
      },
    });
  });

  // Sponsor info — shows where to send testnet USDC for the sponsor account
  app.get("/demo/sponsor-info", async (c) => {
    const sponsorAddress = deps.gasSponsor.sponsorAddress;
    return c.json({
      sponsor_address: sponsorAddress,
      network: "sui-testnet",
      usdc_coin_type: process.env.SUIPASS_USDC_COIN_TYPE ?? "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
      purpose: "Fund this address with testnet USDC to enable card swaps, payments, and paid_fetch operations",
      faucet_guide: [
        {
          step: 1,
          action: "Get testnet SUI for gas",
          url: "https://faucet.sui.io/",
          note: "Gas is needed for all Sui transactions"
        },
        {
          step: 2,
          action: "Get testnet USDC from Circle Faucet",
          url: "https://faucet.circle.com/",
          note: "Select Sui Testnet, request 20 USDC (resets every 2 hours)"
        },
        {
          step: 3,
          action: "Send testnet USDC to the sponsor address above",
          note: "Use any Sui wallet (Sui Wallet, OKX Wallet) on testnet"
        },
        {
          step: 4,
          action: "Try the demo again — swaps, payments, and paid_fetch will work",
          note: "The server auto-detects USDC coins in the sponsor account"
        },
      ],
    });
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

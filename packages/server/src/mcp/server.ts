// SuiPass: Per-card MCP server for Sui.
// Same tool interface as the EVM version, but backed by Sui PTBs.
// Tools: card, pay, paid_fetch, execute, issue_subcard, revoke_subcard

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  RefusalError,
  EngineError,
  atomsToUsdc,
  parseUsdcAmount,
  cardState as getCardState,
  spend,
  executeOperation,
  issueSubCard,
  buildRevokeCardPTB,
  buildFreezeCardPTB,
  buildSpendPTB,
  type SpendDeps,
  type ExecuteDeps,
  type CardRow,
  type CardTerms,
} from "@suipass/engine";
import type { AppDeps } from "../deps";
import { spendDeps, spendKey } from "../deps";

const SERVER_INFO = { name: "suipass", version: "1.0.0" };

const INSTRUCTIONS = [
  "SuiPass is the agent's spending card on Sui: a scoped, revocable spending authority granted by the card owner. The connection itself is the card; it holds no funds of its own and every action is checked against the card's terms (per-payment cap, period budget, expiry, merchant allowlists).",
  "Tools: `card` reports status, terms and remaining budget (check it before the first spend). `pay` sends USDC to a recipient on Sui. `paid_fetch` fetches an HTTP resource and pays its 402 challenge automatically. `execute` calls a Sui Move function within the card's scope. `issue_subcard` mints a narrower child card for a sub-agent and returns its connection URL. `revoke_subcard` kills a child card and its descendants instantly.",
  "A frozen card still answers `card` but refuses spends. Refusals name the violated term; read the message before retrying.",
].join("\n\n");

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function refused(e: RefusalError): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
}

function failed(message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ status: "error", message }, null, 2) }],
    isError: true,
  };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof RefusalError) return refused(e);
    if (e instanceof EngineError) return failed(`${e.stage}: ${e.message}`);
    return failed(e instanceof Error ? e.message : String(e));
  }
}

export function cardUrl(secret: string): string {
  const base = process.env.SUIPASS_PUBLIC_MCP_BASE ?? `http://localhost:${process.env.PORT ?? 4070}`;
  return `${base}/c/${secret}/mcp`;
}

export function buildMcpServer(deps: AppDeps, card: CardRow): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  const sd: SpendDeps = spendDeps(deps);
  const now = () => Math.floor(Date.now() / 1000);
  const treeKey = spendKey(deps.store, card.id);
  const locked = <T>(fn: () => Promise<T>): Promise<T> => deps.spendMutex.run(treeKey, fn);

  // ─── card (always) ───

  server.registerTool(
    "card",
    {
      title: "Card status",
      description: "Your spending card's terms and live state: remaining budget this period, lifetime remaining, expiry, recent charges, sub-cards. Call this first to learn what you can spend.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      run(async () => {
        const state = getCardState(sd.store, card.id, now());
        const iso = (sec: number | null | undefined) =>
          sec === null || sec === undefined ? null : new Date(sec * 1000).toISOString();
        const charges = sd.store.listCharges(card.id, 10).map((c) => ({
          amount: atomsToUsdc(c.amount_atoms),
          fee: atomsToUsdc(c.fee_atoms),
          to: c.to_addr,
          status: c.status,
          tx: c.tx_hash,
          memo: c.memo,
          at: iso(c.created_at),
        }));
        const root = sd.store.ancestorChain(card.id).at(-1);
        const account = root ? (sd.store.getUser(root.user_id)?.address ?? null) : null;
        return {
          ...state,
          account,
          expires_at: iso(state?.expires_at),
          period_resets_at: iso(state?.period_resets_at),
          recent_charges: charges,
        };
      }),
  );

  // ─── pay (always available for SuiPass cards) ───

  server.registerTool(
    "pay",
    {
      title: "Pay USDC on Sui",
      description: "Send USDC on Sui to a recipient address, within this card's limits. Blocks until the payment confirms on-chain (seconds). Refusals are typed (over_period_limit, merchant_not_allowed, ...) — relay them honestly to your user. Use idempotency_key to make retries safe.",
      inputSchema: {
        to: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/).describe("recipient Sui address"),
        amount: z.string().regex(/^\d+(\.\d{1,6})?$/).describe("USDC amount, decimal string, e.g. \"1.50\""),
        memo: z.string().max(280).optional().describe("what this payment is for"),
        idempotency_key: z.string().max(128).optional().describe("same key -> same charge (safe retries)"),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args: { to: string; amount: string; memo?: string; idempotency_key?: string }) =>
      run(() =>
        locked(() =>
          spend(sd, card.id, {
            kind: "pay",
            mode: "pay",
            to: args.to,
            amountAtoms: parseUsdcAmount(args.amount),
            memo: args.memo,
            idempotencyKey: args.idempotency_key,
          }),
        ),
      ),
  );

  // ─── paid_fetch (cards with pay capability) ───

  server.registerTool(
    "paid_fetch",
    {
      title: "Fetch a paid resource",
      description: "Fetch a URL; if it answers 402 (x402 payment required), pay it from this card automatically and return the content. Use max_price to cap what you're willing to pay.",
      inputSchema: {
        url: z.string().url().describe("the resource URL"),
        max_price: z.string().regex(/^\d+(\.\d{1,6})?$/).optional().describe("max USDC you allow for this fetch"),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async (args: { url: string; max_price?: string }) =>
      run(async () => {
        const first = await fetch(args.url, { redirect: "manual" });
        if (first.status !== 402) {
          return { paid: false, status: first.status, content: (await first.text()).slice(0, 10000) };
        }

        // Parse x402 challenge
        let accepts: Array<{ scheme: string; network: string; amount: string }> = [];
        const prHeader = first.headers.get("PAYMENT-REQUIRED") ?? first.headers.get("payment-required");
        if (prHeader) {
          try {
            accepts = JSON.parse(prHeader).accepts ?? [];
          } catch { /* ignore */ }
        } else {
          const body = await first.json().catch(() => ({})) as Record<string, unknown>;
          accepts = (body.accepts ?? []) as Array<{ scheme: string; network: string; amount: string }>;
        }

        // Look for a Sui-compatible payment option
        const req = accepts.find((r) => r.scheme === "x-sui" || r.network?.includes("sui"));
        if (!req) {
          throw new RefusalError("invalid_terms", "no compatible Sui payment option", { offered: accepts.map((a) => `${a.scheme}/${a.network}`).join(",") || "none" });
        }

        if (args.max_price) {
          const maxAtoms = parseUsdcAmount(args.max_price);
          const priceAtoms = parseUsdcAmount(req.amount);
          if (priceAtoms > maxAtoms) {
            throw new RefusalError("price_exceeds_max", `resource costs ${req.amount} USDC, above your max_price`);
          }
        }

        // Execute payment — use the gas sponsor's Sui address as recipient
        // (the demo endpoint doesn't specify a merchant address; a real x402 would)
        const receipt = await locked(() =>
          spend(sd, card.id, {
            kind: "x402",
            mode: "pay",
            to: deps.gasSponsor.sponsorAddress,
            amountAtoms: parseUsdcAmount(req.amount),
            memo: `x402: ${args.url}`,
          }),
        );

        // Retry with payment proof
        const retry = await fetch(args.url, {
          headers: { "X-SuiPass-Payment": receipt.tx ?? "" },
          redirect: "manual",
        });

        return {
          paid: true,
          content: (await retry.text()).slice(0, 10000),
          receipt,
        };
      }),
  );

  // ─── execute (protocol calls — DeepBook swaps) ───

  server.registerTool(
    "execute",
    {
      title: "Execute a protocol operation",
      description: "Run a DeFi operation within this card's scope. Supports DeepBook V3 (deepbook) and Cetus DEX (cetus) swaps. The card budget is deducted by the swap amount.",
      inputSchema: {
        protocol: z.enum(["deepbook", "cetus"]).describe("the protocol to use: deepbook or cetus"),
        action: z.string().describe("the operation: swap_exact_quote_for_base (sell USDC, buy SUI), swap_exact_base_for_quote (sell SUI, buy USDC), or swap (generic)"),
        sell_coin: z.string().describe("coin type to sell, e.g. 0xa1ec7fc0...::usdc::USDC for Circle USDC"),
        buy_coin: z.string().describe("coin type to buy, e.g. 0x2::sui::SUI"),
        amount: z.string().regex(/^\d+(\.\d{1,6})?$/).describe("amount to sell, decimal string, e.g. \"10.00\""),
        min_out: z.string().regex(/^\d+$/).optional().describe("minimum buy amount in atomic units (raw, no decimals), e.g. 1000000"),
        pool_id: z.string().optional().describe("DeepBook pool object ID (optional, uses default USDC/SUI pool)"),
        memo: z.string().max(280).optional(),
        idempotency_key: z.string().max(128).optional(),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args: {
      protocol: "deepbook" | "cetus";
      action: string;
      sell_coin: string;
      buy_coin: string;
      amount: string;
      min_out?: string;
      pool_id?: string;
      memo?: string;
      idempotency_key?: string;
    }) =>
      run(() =>
        locked(() =>
          executeOperation(
            { store: sd.store, suiClient: sd.suiClient, gasSponsor: deps.gasSponsor, packageId: deps.packageId },
            card.id,
            {
              protocol: args.protocol,
              action: args.action,
              sellCoinType: args.sell_coin,
              buyCoinType: args.buy_coin,
              amountAtoms: parseUsdcAmount(args.amount),
              minOutAtoms: args.min_out ? BigInt(args.min_out) : undefined,
              poolId: args.pool_id,
              memo: args.memo,
              idempotencyKey: args.idempotency_key,
            },
          ),
        ),
      ),
  );

  // ─── sub-card management ───

  if (card.terms.subcards !== false) {
    server.registerTool(
      "issue_subcard",
      {
        title: "Issue a sub-card",
        description: "Mint a tighter child card for a sub-agent. Terms must fit inside this card's. Returns the sub-card's connection URL — treat it as a secret.",
        inputSchema: {
          name: z.string().min(1).max(80).describe("label shown in the owner's dashboard"),
          terms: z.object({
            pay: z.object({
              period: z.object({ amount: z.string(), seconds: z.number().int().min(60) }).optional(),
              lifetime: z.object({ amount: z.string() }).optional(),
            }).optional(),
            expiry: z.number().int().optional(),
            maxUses: z.number().int().min(1).optional(),
            perTxMax: z.string().optional(),
            merchants: z.array(z.string().regex(/^0x[0-9a-fA-F]{40,64}$/)).optional(),
            subcards: z.boolean().optional(),
          }),
        },
        annotations: { openWorldHint: false },
      },
      async (args: { name: string; terms: unknown }) =>
        run(async () => {
          const issued = await issueSubCard(
            { store: sd.store, gasSponsor: deps.gasSponsor, packageId: deps.packageId },
            { parentCardId: card.id, name: args.name, terms: args.terms as CardTerms },
          );
          return { card_id: issued.cardId, card_url: cardUrl(issued.secret), terms: issued.terms };
        }),
    );

    server.registerTool(
      "revoke_subcard",
      {
        title: "Revoke a sub-card",
        description: "Kill a sub-card you issued (and its descendants) instantly.",
        inputSchema: {
          card_id: z.string().describe("the sub-card's id to revoke"),
        },
        annotations: { destructiveHint: true, openWorldHint: false },
      },
      async (args: { card_id: string }) =>
        run(async () => {
          const target = sd.store.getCard(args.card_id);
          if (!target) throw new RefusalError("card_not_found", "no such card");

          // Verify requester is an ancestor
          const descendants = sd.store.subtreeIds(card.id);
          if (!descendants.includes(args.card_id)) {
            throw new RefusalError("not_your_subcard", "target card is not a descendant of this card");
          }

          sd.store.setSubtreeStatus(args.card_id, "revoked");
          return { revoked: true, card_id: args.card_id };
        }),
    );
  }

  return server;
}

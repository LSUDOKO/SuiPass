// E2E: paid_fetch against the LIVE SuiPass MCP server on Render.
//
// Tests the full pipeline against a REAL card on the deployed server:
//   1. Connect MCP SDK client to your card URL
//   2. Call `card` to verify budget, status, on-chain account
//   3. Call `paid_fetch` against the demo API on the SAME server
//   4. Verify: 402 parsed → spend called → retry → premium data returned
//
// All operations hit the real on-chain Sui testnet (pending budget checks,
// real USDC transfers, real tx digests).
//
// Usage:
//   SUIPASS_CARD_URL="https://suipass-server.onrender.com/c/<your-secret>/mcp" \
//     bun run scripts/e2e-paid-fetch.ts
//
// Or save the URL to a file and point SUIPASS_CARD_FILE at it:
//   SUIPASS_CARD_FILE=/path/to/card-url.txt bun run scripts/e2e-paid-fetch.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ─── Config ───

const DEMO_BASE = "https://suipass-server.onrender.com/api/demo";
const DEMO_PRODUCTS = [
  { url: `${DEMO_BASE}/premium-data?product=ai-dataset`, price: "0.50", name: "AI Training Dataset", priceLabel: "AI Dataset ($0.50)" },
  { url: `${DEMO_BASE}/premium-data?product=market-feed`, price: "1.00", name: "Real-time Market Data Feed", priceLabel: "Market Feed ($1.00)" },
];

function getCardUrl(): string {
  const fromEnv = process.env.SUIPASS_CARD_URL;
  if (fromEnv) return fromEnv;

  const fromFile = process.env.SUIPASS_CARD_FILE;
  if (fromFile) {
    const content = Bun.file(fromFile).text();
    return content.trim();
  }

  // Last resort: check a well-known dev location
  try {
    const devData = Bun.file("/Users/alkautsar/Documents/s0nderlabs/remit/.dev/m2-card.json");
    if (devData.exists()) {
      const parsed = JSON.parse(devData.text());
      if (parsed.card_url) return parsed.card_url;
    }
  } catch { /* ignore */ }

  console.error("❌ No card URL provided.");
  console.error("   Set SUIPASS_CARD_URL or SUIPASS_CARD_FILE, or create a card in the dashboard");
  console.error("   and paste the URL.");
  console.error("");
  console.error("   Example:");
  console.error("     SUIPASS_CARD_URL=\"https://suipass-server.onrender.com/c/abc123/mcp\" \\");
  console.error("       bun run scripts/e2e-paid-fetch.ts");
  process.exit(1);
}

// ─── Helpers ───

const parse = (r: { content?: unknown }) =>
  JSON.parse((r.content as Array<{ text: string }>)[0]!.text);

let pass = true;
let totalChecks = 0;
let passedChecks = 0;

const check = (label: string, cond: boolean, extra?: unknown) => {
  totalChecks++;
  if (cond) passedChecks++;
  const icon = cond ? "✅" : "❌";
  console.log(`${icon} ${label}${extra !== undefined ? `\n    ${JSON.stringify(extra)}` : ""}`);
  if (!cond) pass = false;
};

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ───

async function main(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  E2E: paid_fetch against LIVE SuiPass Server");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const cardUrl = getCardUrl();
  console.log(`🔗 Card URL: ${cardUrl}`);
  console.log(`🎯 Demo API: ${DEMO_BASE}`);
  console.log(`🌐 Network:   sui-testnet (live)\n`);

  // 1. Connect MCP client to the LIVE server
  console.log("─── Step 1: Connect MCP Client & Read Card ───");

  const client = new Client({ name: "e2e-tester", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(cardUrl));

  try {
    await client.connect(transport);
    check("MCP client connected to live server", true);
  } catch (e) {
    check("MCP client connected to live server", false, {
      error: e instanceof Error ? e.message : String(e),
    });
    process.exit(1);
  }

  // 2. Call `card` tool
  console.log("\n─── Step 2: Card Status ───");
  const state = parse(await client.callTool({ name: "card", arguments: {} }));

  check("card status is active or okay", state.status === "active" || state.status === "ok", {
    status: state.status,
  });
  check("card has remaining budget", typeof state.remaining_this_period === "string" && Number(state.remaining_this_period) > 0, {
    remaining: state.remaining_this_period,
  });
  check("card has on-chain account", typeof state.account === "string" && (state.account as string).startsWith("0x"), {
    account: state.account,
  });
  check("card has ISO timestamps", typeof state.expires_at === "string" && !Number.isNaN(Date.parse(state.expires_at as string)));

  console.log(`  Status:   ${state.status}`);
  console.log(`  Budget:   $${state.remaining_this_period} remaining`);
  console.log(`  Account:  ${state.account}`);
  console.log(`  Expires:  ${state.expires_at}`);
  console.log(`  Subcards: ${(state.subcards as string[] | undefined)?.length ?? 0} issued`);

  // 3. Test the demo endpoint returns 402
  console.log("\n─── Step 3: Verify Demo Endpoint (402 Payment Required) ───");

  const firstResp = await fetch(DEMO_PRODUCTS[0]!.url, { redirect: "manual" });
  check("demo endpoint returns 402", firstResp.status === 402);

  const body = await firstResp.json() as Record<string, unknown>;
  const accepts = body.accepts as Array<{ scheme: string; network: string; amount: string }> | undefined;
  check("402: accepts x-sui on sui-testnet", accepts?.some((a) => a.scheme === "x-sui" || a.network === "sui-testnet"));
  check("402: AI Dataset costs $0.50", accepts?.[0]?.amount === "0.50");

  console.log(`  ${body.description as string}`);
  console.log(`  Scheme: ${accepts?.[0]?.scheme}/${accepts?.[0]?.network}`);

  // 4. Call paid_fetch for the first product (AI Dataset, $0.50)
  console.log(`\n─── Step 4: paid_fetch — "${DEMO_PRODUCTS[0]!.name}" ───`);

  const t0 = Date.now();
  const paidResult = parse(await client.callTool({
    name: "paid_fetch",
    arguments: {
      url: DEMO_PRODUCTS[0]!.url,
      max_price: "1.00",
    },
  }));
  const duration = ((Date.now() - t0) / 1000).toFixed(1);

  if (paidResult.paid === true) {
    check(`✅ Payment succeeded in ${duration}s`, true);
    check("premium data received", typeof paidResult.content === "string" && paidResult.content.length > 0);

    // Parse and validate the premium content
    if (typeof paidResult.content === "string") {
      try {
        const content = JSON.parse(paidResult.content);
        check("premium data: purchased flag", content.purchased === true);
        check("premium data: correct product name", content.product === DEMO_PRODUCTS[0]!.name.split(" (")[0]);
        check("premium data: has tx_ref", typeof content.tx_ref === "string" && content.tx_ref.length > 0);
        check("premium data: has product features", Array.isArray(content.data?.features));

        console.log(`  ✅ Product:    ${content.product}`);
        console.log(`  ✅ TX ref:     ${content.tx_ref}`);
        console.log(`  ✅ Downloaded: ${content.downloaded_at as string}`);
        if (content.data?.features) {
          console.log(`  ✅ Features:   ${(content.data.features as string[]).join(", ")}`);
        }
        if (content.data?.rows) {
          console.log(`  ✅ Dataset:    ${(content.data.rows as number).toLocaleString()} rows`);
        }
      } catch {
        // Content isn't JSON — maybe it's the receipt or an error page
        console.log(`  Content preview: ${(paidResult.content as string).slice(0, 200)}`);
      }
    }

    // Show the receipt
    if (paidResult.receipt) {
      const r = paidResult.receipt as Record<string, unknown>;
      console.log(`  Receipt: tx=${r.tx as string}, remaining=$${r.remaining_this_period as string}`);
    }
  } else if (paidResult.code === "card_frozen" || paidResult.code === "card_revoked") {
    check(`Card not active: ${paidResult.code as string}`, false, paidResult);
  } else if (paidResult.status === "error" || paidResult.status === "refused") {
    check(`paid_fetch failed: ${paidResult.message as string}`, false, paidResult);
  } else {
    check(`unexpected response`, false, paidResult);
  }

  // 5. Optional: Test the second product (Market Feed, $1.00)
  const remainingAfterFirst = paidResult.paid === true
    ? Number((paidResult.receipt as Record<string, unknown> | undefined)?.remaining_this_period as string ?? "0")
    : Number(state.remaining_this_period as string);
  if (paidResult.paid === true && remainingAfterFirst >= 2) {
    console.log(`\n─── Step 5 (bonus): paid_fetch — "${DEMO_PRODUCTS[1]!.name}" ───`);

    const t1 = Date.now();
    const result2 = parse(await client.callTool({
      name: "paid_fetch",
      arguments: {
        url: DEMO_PRODUCTS[1]!.url,
        max_price: "1.50",
      },
    }));
    const duration2 = ((Date.now() - t1) / 1000).toFixed(1);

    if (result2.paid === true) {
      check(`✅ Second payment succeeded in ${duration2}s`, true);
      if (typeof result2.content === "string") {
        try {
          const content = JSON.parse(result2.content);
          check("market feed: purchased", content.purchased === true);
          check("market feed: correct product", content.product === DEMO_PRODUCTS[1]!.name.split(" (")[0]);
          check("market feed: has sample data", typeof content.data?.sample === "object");
          if (content.data?.sample) {
            const s = content.data.sample as Record<string, unknown>;
            console.log(`  Sample: ${s.pair as string} @ $${s.price as string}`);
            console.log(`  Volume 24h: $${s.volume_24h as string}`);
          }
        } catch {
          check("market feed: content received", true, { preview: (result2.content as string).slice(0, 100) });
        }
      }
    } else {
      check(`Second paid_fetch skipped: ${result2.message ?? "unknown"}`, false, result2);
    }
  } else if (paidResult.paid === true) {
    console.log(`\n⚠️  Skipping second product — remaining budget ($${state.remaining_this_period}) may not cover $1.00+ fee`);
  }

  // 6. Re-read card state to verify budget decreased (only if payment succeeded)
  if (paidResult.paid === true) {
    console.log("\n─── Step 6: Verify Budget Updated ───");
    // Brief delay for the charge log to propagate
    await sleep(1000);
    const finalState = parse(await client.callTool({ name: "card", arguments: {} }));
    const remaining = Number(finalState.remaining_this_period as string);
    const original = Number(state.remaining_this_period as string);
    check("card budget decreased after payment", remaining < original, {
      before: original.toFixed(2),
      after: remaining.toFixed(2),
    });
    console.log(`  Budget: $${original.toFixed(2)} → $${remaining.toFixed(2)}`);
    console.log(`  Spent:  $${(original - remaining).toFixed(2)}`);
  }

  // 7. Clean close
  await client.close();
  console.log("\n─── Step 7: Done ───");
  check("MCP client closed", true);

  // ─── Results ───
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  RESULTS: ${passedChecks}/${totalChecks} passed`);
  console.log(`  Overall: ${pass ? "PASS ✅" : "FAIL ❌"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error("\nFATAL:", e instanceof Error ? e.message : String(e));
  if (e instanceof Error && e.stack) {
    console.error(e.stack.split("\n").slice(0, 8).join("\n"));
  }
  process.exit(1);
});

// Quick test: call `pay` directly to isolate the VM error
// If this works, the issue is in paid_fetch's 402 flow
// If this also fails with VM error, the issue is in spend() itself
//
// Usage:
//   SUIPASS_CARD_URL="https://.../c/<secret>/mcp" bun run scripts/test-pay-direct.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const cardUrl = process.env.SUIPASS_CARD_URL;
if (!cardUrl) { console.error("Set SUIPASS_CARD_URL"); process.exit(1); }

const parse = (r: { content?: unknown }) =>
  JSON.parse((r.content as Array<{ text: string }>)[0]!.text);

async function main() {
  console.log("─── Test: Direct `pay` call ───\n");

  const client = new Client({ name: "pay-tester", version: "0.0.1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(cardUrl)));
  console.log("✅ MCP connected\n");

  // First check the card
  const state = parse(await client.callTool({ name: "card", arguments: {} }));
  console.log(`Card: ${state.status}, $${state.remaining_this_period} remaining`);
  console.log(`Account: ${state.account}\n`);

  // Try a direct pay of $0.01 to the gas sponsor's own address
  console.log("Calling `pay` ($0.01 to self)...");
  const t0 = Date.now();
  const result = parse(await client.callTool({
    name: "pay",
    arguments: {
      to: state.account as string,
      amount: "0.01",
      memo: "direct-pay-test",
      idempotency_key: `pay-test-${Date.now()}`,
    },
  }));

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nResult (${duration}s):`);
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "confirmed") {
    console.log("\n✅ pay succeeded!");
  } else if (result.code || result.status === "error") {
    console.log(`\n❌ pay failed: ${result.message ?? result.code}`);
  }

  await client.close();
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

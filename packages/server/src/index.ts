// SuiPass Server: single Hono process
// Replaces the EVM server completely — no 1Shot, no Privy, no Stripe

import { createApp } from "./app";
import { envInt, realDeps } from "./deps";

const deps = realDeps();
const app = createApp(deps);
const port = envInt("PORT", 4070);

// Periodic log of gas sponsor balance
const logInterval = envInt("SUIPASS_LOG_INTERVAL_MS", 300_000);
if (logInterval > 0) {
  setInterval(async () => {
    try {
      const balance = await deps.gasSponsor.getBalance();
      console.log(`[suipass] gas sponsor balance: ${(Number(balance) / 1e9).toFixed(4)} SUI`);
    } catch {
      // non-fatal
    }
  }, logInterval);
}

console.log(`[suipass] server listening on :${port}`);
console.log(`[suipass] sponsor address: ${deps.gasSponsor.sponsorAddress}`);

export default { port, fetch: app.fetch, idleTimeout: 120 };

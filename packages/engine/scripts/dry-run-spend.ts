// Dry-run: Build a spend PTB and submit it for dry-run to see the exact VM error.
// This helps diagnose VMVerificationOrDeserializationError.
//
// Usage:
//   SUIPASS_PACKAGE_ID=0x... SUIPASS_GAS_SPONSOR_KEY=... bun run scripts/dry-run-spend.ts

import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { buildSpendPTB, USDC_COIN_TYPE, CLOCK_OBJECT_ID, findSponsorCoin } from "../src/sui";

const PKG = process.env.SUIPASS_PACKAGE_ID!;
const SPONSOR_KEY = process.env.SUIPASS_GAS_SPONSOR_KEY!;
const SPONSOR_ADDR = process.env.SUIPASS_GAS_SPONSOR_ADDR!;

async function main() {
  const client = new SuiJsonRpcClient({ url: "https://fullnode.testnet.sui.io:443", network: "testnet" });
  const sponsor = Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(SPONSOR_KEY, "hex")));
  const sponsorAddr = sponsor.toSuiAddress();
  console.log(`Sponsor address: ${sponsorAddr}`);

  // Find a USDC coin
  const coinId = await findSponsorCoin(client, sponsorAddr, USDC_COIN_TYPE, 500_000n);
  console.log(`USDC coin: ${coinId ?? "NOT FOUND"}`);
  if (!coinId) { console.error("No USDC coin found"); process.exit(1); }

  // Get an existing Card + Cap to reference — these are from the store
  // For the dry-run, we need actual Card and Cap object IDs
  const cardId = process.env.TEST_CARD_OBJ_ID;
  const capId = process.env.TEST_CAP_ID;
  if (!cardId || !capId) {
    console.log("Set TEST_CARD_OBJ_ID and TEST_CAP_ID to real card objects on testnet");
    console.log("Check the server's database for newly created card objects");
    process.exit(1);
  }

  // Build the spend PTB
  const tx = buildSpendPTB({
    cardId,
    capId,
    amount: 500_000n,
    recipient: sponsorAddr,
    merchant: sponsorAddr,
    memo: "dry-run test",
    usdcCoinId: coinId,
  });

  // Set gas
  tx.setGasOwner(sponsorAddr);
  tx.setGasBudget(50_000_000);

  // Build and dry-run
  console.log("\nBuilding transaction...");
  const txBytes = await tx.build({ client });
  console.log(`Transaction bytes: ${txBytes.length} bytes`);

  console.log("\nDry-running transaction...");
  try {
    const result = await client.dryRunTransactionBlock({ transactionBlock: txBytes });
    console.log(`Status: ${result.effects?.status?.status ?? "unknown"}`);
    if (result.effects?.status?.status === "failure") {
      console.log(`Error: ${result.effects.status.error}`);
    }
    if (result.effects?.status?.error) {
      console.log(`Error detail: ${result.effects.status.error}`);
    }
    console.log(`Gas used: ${JSON.stringify(result.effects?.gasUsed)}`);
    console.log("\nFull result:", JSON.stringify(result, null, 2).slice(0, 5000));
  } catch (e) {
    console.error("Dry-run failed:", e instanceof Error ? e.message : String(e));
  }
}

main().catch(console.error);

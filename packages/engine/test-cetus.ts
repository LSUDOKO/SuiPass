import { AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";

async function main() {
  console.log("Creating Cetus client for testnet...");
  const client = new AggregatorClient({
    env: Env.Testnet,
    signer: "0x5063210e845dfff9d809e10d4ea6a512e40e42de15d244ffe71b61e4e24aa1ef",
  });

  // Try Circle USDC -> SUI
  console.log("\n=== Circle USDC -> SUI ===");
  try {
    const routers = await client.findRouters({
      from: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
      target: "0x2::sui::SUI",
      amount: "2000000",
      byAmountIn: true,
    });
    console.log("Result:", JSON.stringify(routers, null, 2).slice(0, 3000));
  } catch (e) {
    console.log("Error:", e instanceof Error ? e.message : String(e));
  }

  // Try SUI -> Circle USDC
  console.log("\n=== SUI -> Circle USDC ===");
  try {
    const routers2 = await client.findRouters({
      from: "0x2::sui::SUI",
      target: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
      amount: "1000000000",
      byAmountIn: true,
    });
    console.log("Result:", JSON.stringify(routers2, null, 2).slice(0, 3000));
  } catch (e) {
    console.log("Error:", e instanceof Error ? e.message : String(e));
  }
}

main().catch(console.error);

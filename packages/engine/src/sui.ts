// SuiPass: Sui network configuration
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

export type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

export const SUI_NETWORK: SuiNetwork = (process.env.SUIPASS_SUI_NETWORK as SuiNetwork) ?? "testnet";

export const SUI_RPC_URL: string =
  process.env.SUIPASS_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";

export const SUI_CLIENT = new SuiJsonRpcClient({ url: SUI_RPC_URL, network: SUI_NETWORK });

export const SUIPASS_PACKAGE_ID = process.env.SUIPASS_PACKAGE_ID!;

// Sui native USDC coin type on testnet/mainnet
// Default: Circle's official testnet USDC (sponsor must hold this coin type for pay/paid_fetch/spend)
export const USDC_COIN_TYPE =
  process.env.SUIPASS_USDC_COIN_TYPE ?? "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

// Clock object ID (constant across all Sui networks)
export const CLOCK_OBJECT_ID = "0x6";

// DeepBook V3 testnet (from @mysten/deepbook-v3 SDK)
export const DEEPBOOK_PACKAGE_ID = "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
export const DEEPBOOK_POOL_MODULE = "pool";
export const DEEP_COIN_TYPE = "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP";

// DeepBook V3 testnet pools (from @mysten/deepbook-v3 SDK canonical values)
export const DEEPBOOK_POOL_IDS: Record<string, string> = {
  "SUI_DBUSDC": "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
  "DEEP_SUI": "0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f",
  "DEEP_DBUSDC": "0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622",
};
export const DEEPBOOK_DEFAULT_POOL = DEEPBOOK_POOL_IDS["SUI_DBUSDC"]!;

// Module names
export const CARD_MODULE = "card";

// Function names
export const FUNCTIONS = {
  ISSUE_ROOT_CARD: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::issue_root_card`,
  ISSUE_SUBCARD: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::issue_subcard`,
  SPEND: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::spend`,
  LOG_CHARGE: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::log_charge`,
  REVOKE_CARD: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::revoke_card`,
  FREEZE_CARD: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::freeze_card`,
  UNFREEZE_CARD: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::unfreeze_card`,
  REMAINING_BUDGET: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::remaining_period_budget`,
} as const;

// Move error code -> typed refusal mapping
export const MOVE_ERROR_MAP: Record<number, string> = {
  0: "not_owner",
  1: "card_expired",
  2: "over_period_limit",
  3: "over_lifetime_limit",
  4: "per_tx_exceeded",
  5: "uses_exhausted",
  6: "card_revoked",
  7: "cap_not_authorized",
  8: "subcards_disabled",
  9: "exceeds_parent_terms",
  10: "not_parent_owner",
  11: "invalid_amount",
  12: "merchant_not_allowed",
};

// Find a coin of the given type owned by address with at least minBalance.
export async function findSponsorCoin(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
  minBalance?: bigint,
): Promise<string | null> {
  const coins = await client.getCoins({ owner, coinType, limit: 10 });
  for (const c of coins.data) {
    if (minBalance === undefined || BigInt(c.balance) >= minBalance) {
      return c.coinObjectId;
    }
  }
  return null;
}

export function moveErrorToRefusal(errorCode: number): string {
  return MOVE_ERROR_MAP[errorCode] ?? "unknown_error";
}

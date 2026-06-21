// SuiPass: Sui network configuration
import { SuiClient } from "@mysten/sui/client";

export type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

export const SUI_NETWORK: SuiNetwork = (process.env.SUIPASS_SUI_NETWORK as SuiNetwork) ?? "testnet";

export const SUI_RPC_URL: string =
  process.env.SUIPASS_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";

export const SUI_CLIENT = new SuiClient({ url: SUI_RPC_URL });

export const SUIPASS_PACKAGE_ID = process.env.SUIPASS_PACKAGE_ID!;

// Sui native USDC coin type on testnet/mainnet
export const USDC_COIN_TYPE =
  process.env.SUIPASS_USDC_COIN_TYPE ?? "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

// Clock object ID (constant across all Sui networks)
export const CLOCK_OBJECT_ID = "0x6";

// DeepBook V3 testnet (from @mysten/deepbook-v3 SDK)
export const DEEPBOOK_PACKAGE_ID = "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
export const DEEPBOOK_POOL_MODULE = "pool";
export const DEEP_COIN_TYPE = "0xdeeb7a4662eec9f2e3f1a1c6a35d9f11e7e4e7a::deep::DEEP";

// Pre-configured pool for USDC -> SUI on testnet.
// In production, look up the pool dynamically from the DeepBook registry.
// Default: SUI_DBUSDC pool on testnet
export const DEEPBOOK_POOL_IDS: Record<string, string> = {
  "SUI_DBUSDC": "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
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

export function moveErrorToRefusal(errorCode: number): string {
  return MOVE_ERROR_MAP[errorCode] ?? "unknown_error";
}

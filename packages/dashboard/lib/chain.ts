// SuiPass: Sui chain constants (Sui Testnet)
// Replaces the Base/viem EVM constants with Sui testnet config.

export const SUI_RPC_URL =
  process.env.NEXT_PUBLIC_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";

export const SUIPASS_PACKAGE_ID =
  process.env.NEXT_PUBLIC_SUIPASS_PACKAGE_ID ?? "";

// The SuiPass USDC coin type on Sui Testnet
export const USDC_COIN_TYPE =
  process.env.NEXT_PUBLIC_USDC_COIN_TYPE ??
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

// Google OAuth client ID for zkLogin
export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const SUI_NETWORK = "testnet";

export const API_BASE = process.env.NEXT_PUBLIC_SUIPASS_API ?? "http://localhost:4070/api";

/** The zkLogin redirect URI (after Google OAuth, the user comes back here) */
export const ZKLOGIN_REDIRECT_URI =
  process.env.NEXT_PUBLIC_ZKLOGIN_REDIRECT_URI ?? "http://localhost:4071";

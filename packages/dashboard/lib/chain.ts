// SuiPass: Sui chain constants (Sui Testnet)
// Replaces the Base/viem EVM constants with Sui testnet config.

export const SUI_RPC_URL =
  process.env.NEXT_PUBLIC_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";

export const SUIPASS_PACKAGE_ID =
  process.env.NEXT_PUBLIC_SUIPASS_PACKAGE_ID ?? "";

// The SuiPass USDC coin type on Sui Testnet
// Default: Circle's official testnet USDC
// Override via NEXT_PUBLIC_USDC_COIN_TYPE env var
export const USDC_COIN_TYPE =
  process.env.NEXT_PUBLIC_USDC_COIN_TYPE ??
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

// Google OAuth client ID for zkLogin
export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const SUI_NETWORK = "testnet";

export const API_BASE = process.env.NEXT_PUBLIC_SUIPASS_API ?? "http://localhost:4070/api";

/** The zkLogin redirect URI (after Google OAuth, the user comes back here) */
export const ZKLOGIN_REDIRECT_URI =
  process.env.NEXT_PUBLIC_ZKLOGIN_REDIRECT_URI ?? "http://localhost:4071";

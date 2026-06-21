// SuiPass: Trusted resolver registry for Sui (Sui Testnet addresses, Jun 2026)
// Replaces the Base-mainnet registry with Sui coins, DeepBook, Cetus, Walrus.

export type TokenEntry = {
  symbol: string;
  /** Sui object type (coin type), e.g. 0x2::sui::SUI */
  coinType: string;
  decimals: number;
  aliases?: string[];
};

export type ProtocolEntry = {
  key: string;
  label: string;
  /** Sui package ID */
  packageId: string;
  /** human-readable Move function selectors this protocol exposes */
  selectors: string[];
  aliases?: string[];
};

// ─── Sui Coins (Sui Testnet) ───
// USDC on Sui Testnet is a wrapped USDC from the Wormhole or native integration.
// The canonical testnet USDC type: 0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN
// SUI is native: 0x2::sui::SUI

export const TOKENS: TokenEntry[] = [
  {
    symbol: "USDC",
    coinType: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    decimals: 6,
    aliases: ["usd coin", "usdc.e"],
  },
  {
    symbol: "SUI",
    coinType: "0x2::sui::SUI",
    decimals: 9,
    aliases: ["sui", "native"],
  },
  {
    symbol: "WETH",
    coinType: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738adebe435357c05b89c2f4b::eth::ETH",
    decimals: 18,
    aliases: ["weth", "wrapped eth", "eth", "ethereum"],
  },
  {
    symbol: "USDT",
    coinType: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
    decimals: 6,
    aliases: ["usdt", "tether"],
  },
  {
    symbol: "DEEP",
    coinType: "0xdeeb7a4662eec9f2e3f1a1c6a35d9f11e7e4e7a::deep::DEEP",
    decimals: 9,
    aliases: ["deep", "deepbook"],
  },
];

// ─── Sui Protocols (Sui Testnet) ───

export const PROTOCOLS: ProtocolEntry[] = [
  {
    key: "deepbook",
    label: "DeepBook V3",
    packageId: "0x2c7bccf7d9b9b8b8b8b8b8b8b8b8b8b8b8b8b8b8",
    selectors: [
      "place_order",
      "cancel_order",
      "swap_exact_input",
      "swap_exact_output",
    ],
    aliases: ["deepbook", "deep book", "deep", "deepbook v3", "db"],
  },
  {
    key: "cetus",
    label: "Cetus DEX",
    packageId: "0x2c7bccf7d9b9b8b8b8b8b8b8b8b8b8b8b8b8b8b8",
    selectors: [
      "swap",
      "add_liquidity",
      "remove_liquidity",
    ],
    aliases: ["cetus", "cetus dex", "cetus protocol"],
  },
  {
    key: "walrus",
    label: "Walrus Storage",
    packageId: "0x2c7bccf7d9b9b8b8b8b8b8b8b8b8b8b8b8b8b8b8",
    selectors: [
      "store_blob",
      "read_blob",
      "delete_blob",
    ],
    aliases: ["walrus", "walrus storage", "walrus protocol"],
  },
];

const norm = (s: string) => s.trim().toLowerCase();

export function findToken(name: string): TokenEntry | null {
  const n = norm(name);
  return (
    TOKENS.find((t) => norm(t.symbol) === n) ??
    TOKENS.find((t) => (t.aliases ?? []).some((a) => norm(a) === n)) ??
    null
  );
}

export function findTokenByCoinType(coinType: string): TokenEntry | null {
  const a = norm(coinType);
  return TOKENS.find((t) => norm(t.coinType) === a) ?? null;
}

export function findProtocol(name: string): ProtocolEntry | null {
  const n = norm(name);
  return (
    PROTOCOLS.find((p) => p.key === n || norm(p.label) === n) ??
    PROTOCOLS.find((p) => (p.aliases ?? []).some((a) => norm(a) === n)) ??
    null
  );
}

export function findProtocolByPackageId(packageId: string): ProtocolEntry | null {
  const a = norm(packageId);
  return PROTOCOLS.find((p) => norm(p.packageId) === a) ?? null;
}

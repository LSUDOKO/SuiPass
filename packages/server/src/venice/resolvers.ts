// SuiPass: Trusted resolver toolkit (Sui edition)
// Resolves token and protocol names from the curated registry only.
// No external block explorer lookup — Sui addresses are all 0x-prefixed hex strings.

import { findProtocol, findProtocolByPackageId, findToken, findTokenByCoinType } from "./registry";

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{40,64}$/;

function isSuiHex(s: string): boolean {
  return SUI_ADDRESS_RE.test(s);
}

export type ResolvedEntity = {
  query: string;
  address: string;
  label: string;
  kind: "token" | "protocol" | "verified_contract" | "raw_address";
  source: "registry" | "user_input";
  decimals?: number;
  selectors?: string[];
};

export type Resolvers = {
  token: (name: string) => ResolvedEntity | null;
  protocol: (name: string) => ResolvedEntity | null;
  verifiedContract: (address: string) => Promise<ResolvedEntity | null>;
};

export function registryResolvers(): Resolvers {
  return {
    token(name: string) {
      const t = findToken(name);
      if (!t) return null;
      return {
        query: name,
        address: t.coinType,
        label: t.symbol,
        kind: "token",
        source: "registry",
        decimals: t.decimals,
      };
    },
    protocol(name: string) {
      const p = findProtocol(name);
      if (!p) return null;
      return {
        query: name,
        address: p.packageId,
        label: p.label,
        kind: "protocol",
        source: "registry",
        selectors: p.selectors,
      };
    },
    async verifiedContract(address: string) {
      if (!isSuiHex(address)) return null;
      const addr = address.toLowerCase();
      const tok = findTokenByCoinType(addr);
      if (tok) return { query: address, address: addr, label: tok.symbol, kind: "token", source: "registry", decimals: tok.decimals };
      const proto = findProtocolByPackageId(addr);
      if (proto) return { query: address, address: addr, label: proto.label, kind: "protocol", source: "registry" };
      return null;
    },
  };
}

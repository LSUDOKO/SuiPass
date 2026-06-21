// SuiPass: Card terms (replaces EVM caveat compiler)
// Sui's object model means no caveat bytecode compilation needed.
// CardTerms maps directly to Move function arguments.

import { RefusalError } from "./errors";

export type PayTerms = {
  period?: { amount: string; seconds: number };
  lifetime?: { amount: string };
};

export type CardTerms = {
  pay?: PayTerms;
  expiry?: number;
  maxUses?: number;
  perTxMax?: string;
  merchants?: string[];
  subcards?: boolean;
};

export function validateTerms(terms: CardTerms, now: number): void {
  if (!terms.pay) {
    throw new RefusalError("invalid_terms", "card needs at least a pay capability");
  }

  const { period, lifetime } = terms.pay;
  if (!period && !lifetime) {
    throw new RefusalError("invalid_terms", "pay needs period and/or lifetime cap", { field: "pay" });
  }

  if (period) {
    const amountAtoms = parseUsdcAmount(period.amount);
    if (amountAtoms <= 0n) {
      throw new RefusalError("invalid_terms", "period amount must be > 0", { field: "pay.period.amount" });
    }
    if (!Number.isInteger(period.seconds) || period.seconds < 60) {
      throw new RefusalError("invalid_terms", "period must be >= 60 seconds", { field: "pay.period.seconds" });
    }
  }

  if (lifetime) {
    const amountAtoms = parseUsdcAmount(lifetime.amount);
    if (amountAtoms <= 0n) {
      throw new RefusalError("invalid_terms", "lifetime amount must be > 0", { field: "pay.lifetime.amount" });
    }
  }

  if (terms.expiry !== undefined) {
    if (!Number.isInteger(terms.expiry) || terms.expiry <= now) {
      throw new RefusalError("invalid_terms", "expiry must be in the future", { field: "expiry" });
    }
  }

  if (terms.maxUses !== undefined) {
    if (!Number.isInteger(terms.maxUses) || terms.maxUses < 1) {
      throw new RefusalError("invalid_terms", "maxUses must be >= 1", { field: "maxUses" });
    }
  }

  if (terms.perTxMax !== undefined && parseUsdcAmount(terms.perTxMax) <= 0n) {
    throw new RefusalError("invalid_terms", "perTxMax must be > 0", { field: "perTxMax" });
  }

  if (terms.merchants !== undefined) {
    if (!terms.merchants.length) {
      throw new RefusalError("invalid_terms", "merchant lock needs at least one address", { field: "merchants" });
    }
    for (const m of terms.merchants) {
      if (!/^0x[0-9a-fA-F]{40,64}$/.test(m)) {
        throw new RefusalError("invalid_terms", `bad merchant address: ${m}`, { field: "merchants" });
      }
    }
  }
}

export function parseUsdcAmount(amount: string): bigint {
  const cleaned = amount.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) {
    throw new Error(`invalid USDC amount: ${amount}`);
  }
  const parts = cleaned.split(".");
  const whole = parts[0]!;
  const fraction = parts[1] ? parts[1].padEnd(6, "0") : "000000";
  return BigInt(whole) * 1_000_000n + BigInt(fraction);
}

export function atomsToUsdc(atoms: bigint): string {
  const whole = atoms / 1_000_000n;
  const fraction = atoms % 1_000_000n;
  return `${whole}.${fraction.toString().padStart(6, "0")}`;
}

export function usdcToAtoms(amount: string): bigint {
  return parseUsdcAmount(amount);
}

export function serializeCardTerms(terms: CardTerms): string {
  return JSON.stringify(terms);
}

export function deserializeCardTerms(json: string): CardTerms {
  return JSON.parse(json);
}

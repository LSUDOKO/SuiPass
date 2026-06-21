// SuiPass: Spend pipeline — PTB-based, no delegation carving, no estimate loop.
// Validates against stored state (mirrors on-chain checks), builds a PTB,
// sponsors gas, executes, and returns a receipt.

import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Transaction } from "@mysten/sui/transactions";
import { SUI_CLIENT, USDC_COIN_TYPE, moveErrorToRefusal, findSponsorCoin } from "./sui";
import { buildSpendPTB, buildLogChargePTB } from "./ptb";
import { GasSponsor } from "./sponsor";
import { RefusalError, EngineError } from "./errors";
import { atomsToUsdc, type CardTerms } from "./terms";
import type { Store } from "./store";
import type { CardRow, ChargeKind, ChargeRow } from "./store";
import { periodWindow } from "./store";

export type SpendMode = "pay" | "contract";

export type SpendRequest = {
  kind: ChargeKind;
  mode: SpendMode;
  to?: string;
  amountAtoms?: bigint;
  usdcCoinId?: string;
  merchant?: string;
  memo?: string;
  idempotencyKey?: string;
};

export type SpendDeps = {
  store: Store;
  suiClient: SuiJsonRpcClient;
  gasSponsor: GasSponsor;
  packageId: string;
  now?: () => number;
};

// ─── Validation (mirror of on-chain checks) ───

export function assertChainSpendable(chain: CardRow[], now: number): void {
  for (const card of chain) {
    if (card.status === "frozen") {
      throw new RefusalError("card_frozen", `card ${card.id === chain[0]!.id ? "" : "(ancestor) "}is frozen`, { card_id: card.id });
    }
    if (card.status === "revoked" || card.status === "nuked") {
      throw new RefusalError("card_revoked", "card has been revoked", { card_id: card.id });
    }
    if (card.terms.expiry !== undefined && now >= card.terms.expiry) {
      throw new RefusalError("card_expired", "card has expired", { card_id: card.id, expired_at: card.terms.expiry });
    }
  }
}

export function validateSpend(
  deps: SpendDeps,
  chain: CardRow[],
  req: SpendRequest,
  totalAtoms: bigint,
  now: number,
): void {
  const card = chain[0]!;

  if (!req.to || req.amountAtoms === undefined) {
    throw new RefusalError("invalid_terms", "pay requires to + amount");
  }
  if (req.amountAtoms <= 0n) throw new RefusalError("invalid_terms", "amount must be > 0");

  // Merchant allowlist
  for (const c of chain) {
    const merchants = c.terms.merchants;
    if (merchants && !merchants.some((m) => m.toLowerCase() === req.to!.toLowerCase())) {
      throw new RefusalError("merchant_not_allowed", `recipient ${req.to} is not on the card's merchant list`, {
        card_id: c.id,
      });
    }
  }

  // Per-tx max
  for (const c of chain) {
    const cap = c.terms.perTxMax;
    if (cap !== undefined) {
      const capAtoms = termsAmountToAtoms(cap);
      if (req.amountAtoms > capAtoms) {
        throw new RefusalError("per_tx_exceeded", `amount exceeds the per-charge max of ${cap} USDC`, {
          card_id: c.id,
          per_tx_max: cap,
        });
      }
    }
  }

  // Uses
  for (const c of chain) {
    if (c.terms.maxUses !== undefined) {
      const used = deps.store.subtreeUsesCount(c.id);
      if (used >= c.terms.maxUses) {
        throw new RefusalError("uses_exhausted", `card has used all ${c.terms.maxUses} redemptions`, { card_id: c.id });
      }
    }
  }

  // Money caps
  for (const c of chain) {
    const pay = c.terms.pay;
    if (!pay) continue;
    if (pay.period) {
      const w = periodWindow(pay.period.seconds, now);
      const spent = deps.store.subtreeSpentSince(c.id, w.start);
      const cap = termsAmountToAtoms(pay.period.amount);
      if (spent + totalAtoms > cap) {
        throw new RefusalError(
          "over_period_limit",
          `this charge (incl. fee) exceeds the period budget`,
          {
            card_id: c.id,
            remaining_this_period: atomsToUsdc(cap > spent ? cap - spent : 0n),
            period_resets_at: w.resetsAt,
          },
        );
      }
    }
    if (pay.lifetime) {
      const spent = deps.store.subtreeSpentLifetime(c.id);
      const cap = termsAmountToAtoms(pay.lifetime.amount);
      if (spent + totalAtoms > cap) {
        throw new RefusalError("over_lifetime_limit", "this charge exceeds the card's lifetime budget", {
          card_id: c.id,
          remaining_lifetime: atomsToUsdc(cap > spent ? cap - spent : 0n),
        });
      }
    }
  }
}

function termsAmountToAtoms(amount: string): bigint {
  const parts = amount.split(".");
  const whole = parts[0]!;
  const fraction = parts[1] ? parts[1].padEnd(6, "0") : "000000";
  return BigInt(whole) * 1_000_000n + BigInt(fraction);
}

// ─── Receipt type ───

export type Receipt = {
  status: "confirmed" | "pending" | "failed";
  tx: string | null;
  to: string;
  amount: string;
  fee: string;
  remaining_this_period: string | null;
  memo?: string;
  usage_count?: number;
};

// ─── The pipeline ───

export async function spend(deps: SpendDeps, cardId: string, req: SpendRequest): Promise<Receipt> {
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  const store = deps.store;
  const client = deps.suiClient ?? SUI_CLIENT;

  // Idempotency replay
  if (req.idempotencyKey) {
    const existing = store.chargeByIdempotency(cardId, req.idempotencyKey);
    if (existing) {
      if (existing.status === "failed" && existing.request_id === null) {
        store.deleteCharge(existing.id);
      } else {
        return receiptFromCharge(store, cardId, existing, now);
      }
    }
  }

  const chain = store.ancestorChain(cardId);
  if (!chain.length) throw new RefusalError("card_not_found", "no such card");
  const card = chain[0]!;
  assertChainSpendable(chain, now);

  const amountAtoms = req.amountAtoms ?? 0n;
  const recipient = req.to ?? (store.getUser(chain[chain.length - 1]!.user_id)?.address ?? "");
  const merchant = req.merchant ?? recipient;

  // Validate against stored state
  validateSpend(deps, chain, req, amountAtoms, now);

  // Auto-discover USDC coin if not specified
  const usdcCoinId =
    req.usdcCoinId ??
    (await findSponsorCoin(client, deps.gasSponsor.sponsorAddress, USDC_COIN_TYPE, amountAtoms)) ??
    "";

  if (!usdcCoinId) {
    throw new RefusalError("invalid_terms", "sponsor has insufficient USDC for this payment");
  }

  // Build PTB
  const tx = buildSpendPTB({
    cardId: card.id,
    capId: card.cap_id,
    amount: amountAtoms,
    recipient,
    merchant,
    memo: req.memo ?? "",
    usdcCoinId,
  });

  // Sponsor gas
  const sponsored = await deps.gasSponsor.sponsorTransaction(tx);

  // Insert charge record BEFORE execution (crash-safe accounting)
  const chargeId = crypto.randomUUID();
  store.insertCharge({
    id: chargeId,
    card_id: cardId,
    idempotency_key: req.idempotencyKey ?? null,
    kind: req.kind,
    to_addr: recipient,
    amount_atoms: amountAtoms,
    fee_atoms: 0n,
    request_id: null,
    tx_hash: null,
    status: "pending",
    memo: req.memo ?? null,
    created_at: now,
  });

  // Execute on-chain
  let result: { digest: string; effects: Record<string, unknown>; error?: string };
  try {
    const execResult = await deps.gasSponsor.executeTransaction(sponsored);
    result = execResult;
  } catch (e) {
    store.updateCharge(chargeId, { status: "failed" });
    throw new EngineError("spend", `transaction execution failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (result.error) {
    // Try to extract Move abort code
    const abortMatch = result.error.match(/aborted with error code (\d+)/);
    if (abortMatch) {
      const code = parseInt(abortMatch[1]!);
      const refusal = moveErrorToRefusal(code);
      store.updateCharge(chargeId, { status: "failed" });
      throw new RefusalError(refusal, `on-chain validation failed: ${result.error}`);
    }
    store.updateCharge(chargeId, { status: "failed" });
    throw new EngineError("spend", `on-chain execution failed: ${result.error}`);
  }

  // Extract usage count from event or effects
  const effectsStatus = result.effects?.status as Record<string, unknown> | undefined;
  const isSuccess = effectsStatus?.status === "success";

  if (isSuccess) {
    store.updateCharge(chargeId, {
      status: "confirmed",
      tx_hash: result.digest,
      request_id: result.digest,
    });

    // Fire-and-forget: create on-chain ChargeLog object for the activity log
    fireChargeLog(deps, cardId, card, amountAtoms, recipient, req, result.digest).catch(
      (e) => console.warn(`[spend] log_charge failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`),
    );

    store.insertEventLog({
      id: crypto.randomUUID(),
      card_id: cardId,
      charge_id: chargeId,
      type: "spend",
      data: JSON.stringify({
        amount: atomsToUsdc(amountAtoms),
        recipient,
        memo: req.memo,
        tx_digest: result.digest,
        usage_count: card.usage_count + 1,
      }),
      created_at: now,
    });
  } else {
    store.updateCharge(chargeId, { status: "failed" });
    throw new EngineError("spend", "transaction failed on-chain");
  }

  return receiptFromCharge(store, cardId, store.getCharge(chargeId)!, now);
}

function receiptFromCharge(
  store: Store,
  cardId: string,
  charge: ChargeRow,
  now: number,
): Receipt {
  const state = cardState(store, cardId, now);
  return {
    status: charge.status === "confirmed" ? "confirmed" : charge.status === "failed" ? "failed" : "pending",
    tx: charge.tx_hash,
    to: charge.to_addr ?? "",
    amount: atomsToUsdc(charge.amount_atoms),
    fee: atomsToUsdc(charge.fee_atoms),
    remaining_this_period: state?.remaining_this_period ?? null,
    ...(charge.memo ? { memo: charge.memo } : {}),
  };
}

export function cardState(store: Store, cardId: string, now: number): {
  card_id: string;
  status: string;
  terms: CardTerms;
  remaining_this_period: string | null;
  remaining_lifetime: string | null;
  period_resets_at: number | null;
  expires_at: number | null;
  uses_remaining: number | null;
  subcards: string[];
} | null {
  const card = store.getCard(cardId);
  if (!card) return null;
  const pay = card.terms.pay;

  let remainingPeriod: string | null = null;
  let resetsAt: number | null = null;
  if (pay?.period) {
    const w = periodWindow(pay.period.seconds, now);
    const spent = store.subtreeSpentSince(cardId, w.start);
    const cap = termsAmountToAtoms(pay.period.amount);
    remainingPeriod = atomsToUsdc(cap > spent ? cap - spent : 0n);
    resetsAt = w.resetsAt;
  }

  let remainingLifetime: string | null = null;
  if (pay?.lifetime) {
    const spent = store.subtreeSpentLifetime(cardId);
    const cap = termsAmountToAtoms(pay.lifetime.amount);
    remainingLifetime = atomsToUsdc(cap > spent ? cap - spent : 0n);
  }

  const expired = card.terms.expiry !== undefined && now >= card.terms.expiry;

  return {
    card_id: card.id,
    status: card.status === "active" && expired ? "expired" : card.status,
    terms: card.terms,
    remaining_this_period: remainingPeriod,
    remaining_lifetime: remainingLifetime,
    period_resets_at: resetsAt,
    expires_at: card.terms.expiry ?? null,
    uses_remaining: card.terms.maxUses !== undefined
      ? Math.max(0, card.terms.maxUses - store.subtreeUsesCount(cardId))
      : null,
    subcards: store.listChildren(cardId).map((c) => c.id),
  };
}

async function fireChargeLog(
  deps: SpendDeps,
  cardId: string,
  card: CardRow,
  amountAtoms: bigint,
  recipient: string,
  req: SpendRequest,
  txDigest: string,
): Promise<void> {
  const logTx = buildLogChargePTB({
    cardId: card.id,
    capId: card.cap_id,
    amount: amountAtoms,
    fee: 0n,
    recipient,
    memo: req.memo ?? "",
    txDigest,
  });

  const sponsored = await deps.gasSponsor.sponsorTransaction(logTx);
  const logResult = await deps.gasSponsor.executeTransaction(sponsored);

  if (logResult.error) {
    console.warn(`[spend] log_charge tx failed (digest: ${logResult.digest}): ${logResult.error}`);
  }
}

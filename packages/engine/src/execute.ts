import { SuiClient } from "@mysten/sui/client";
import { GasSponsor } from "./sponsor";
import { buildDeepBookSwapPTB, buildLogChargePTB } from "./ptb";
import { RefusalError, EngineError } from "./errors";
import { atomsToUsdc } from "./terms";
import { moveErrorToRefusal } from "./sui";
import {
  SUI_CLIENT,
  USDC_COIN_TYPE,
  DEEP_COIN_TYPE,
  DEEPBOOK_DEFAULT_POOL,
} from "./sui";
import type { Store } from "./store";
import { assertChainSpendable, cardState, validateSpend } from "./spend";
import type { SpendRequest, SpendDeps, Receipt } from "./spend";

export type ExecuteProtocol = "deepbook";

export type ExecuteRequest = {
  protocol: ExecuteProtocol;
  action: string;
  sellCoinType: string;
  buyCoinType: string;
  amountAtoms: bigint;
  minOutAtoms?: bigint;
  poolId?: string;
  memo?: string;
  idempotencyKey?: string;
};

export type ExecuteDeps = {
  store: Store;
  suiClient: SuiClient;
  gasSponsor: GasSponsor;
  packageId: string;
  now?: () => number;
};

async function getSponsorCoin(
  client: SuiClient,
  sponsorAddress: string,
  coinType: string,
  minBalance?: bigint,
): Promise<string | null> {
  const coins = await client.getCoins({ owner: sponsorAddress, coinType, limit: 10 });
  for (const c of coins.data) {
    if (minBalance === undefined || BigInt(c.balance) >= minBalance) {
      return c.coinObjectId;
    }
  }
  return null;
}

export async function executeOperation(
  deps: ExecuteDeps,
  cardId: string,
  req: ExecuteRequest,
): Promise<Receipt> {
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  const store = deps.store;
  const client = deps.suiClient ?? SUI_CLIENT;

  const chain = store.ancestorChain(cardId);
  if (!chain.length) throw new RefusalError("card_not_found", "no such card");
  const card = chain[0]!;
  assertChainSpendable(chain, now);

  const sd: SpendDeps = {
    store: deps.store,
    suiClient: deps.suiClient,
    gasSponsor: deps.gasSponsor,
    packageId: deps.packageId,
    now: deps.now,
  };

  const spendReq: SpendRequest = {
    kind: "execute",
    mode: "contract",
    to: req.protocol,
    amountAtoms: req.amountAtoms,
    memo: req.memo,
    idempotencyKey: req.idempotencyKey,
  };
  validateSpend(sd, chain, spendReq, req.amountAtoms, now);

  const sponsorAddress = deps.gasSponsor.sponsorAddress;

  const usdcCoinId = await getSponsorCoin(client, sponsorAddress, USDC_COIN_TYPE, req.amountAtoms);
  if (!usdcCoinId) {
    throw new RefusalError("invalid_terms", "sponsor has insufficient USDC for this swap");
  }

  const deepCoinId = await getSponsorCoin(client, sponsorAddress, DEEP_COIN_TYPE, 10_000_000n);
  if (!deepCoinId) {
    throw new RefusalError("invalid_terms", "sponsor has no DEEP tokens for swap fee");
  }

  const poolId = req.poolId ?? DEEPBOOK_DEFAULT_POOL;
  const minBaseOut = req.minOutAtoms ?? 0n;

  const tx = buildDeepBookSwapPTB({
    poolId,
    quoteCoinId: usdcCoinId,
    deepCoinId,
    minBaseOut,
    quoteCoinType: req.sellCoinType,
    baseCoinType: req.buyCoinType,
    recipient: card.owner,
  });

  const sponsored = await deps.gasSponsor.sponsorTransaction(tx);

  const chargeId = crypto.randomUUID();
  store.insertCharge({
    id: chargeId,
    card_id: cardId,
    idempotency_key: req.idempotencyKey ?? null,
    kind: "execute",
    to_addr: poolId,
    amount_atoms: req.amountAtoms,
    fee_atoms: 0n,
    request_id: null,
    tx_hash: null,
    status: "pending",
    memo: req.memo ?? null,
    created_at: now,
  });

  const result = await deps.gasSponsor.executeTransaction(sponsored);

  if (result.error) {
    store.updateCharge(chargeId, { status: "failed" });
    const abortMatch = result.error.match(/aborted with error code (\d+)/);
    if (abortMatch) {
      const code = parseInt(abortMatch[1]!);
      throw new RefusalError(moveErrorToRefusal(code), `on-chain swap failed: ${result.error}`);
    }
    throw new EngineError("execute", `swap execution failed: ${result.error}`);
  }

  store.updateCharge(chargeId, {
    status: "confirmed",
    tx_hash: result.digest,
    request_id: result.digest,
  });

  // Fire-and-forget on-chain ChargeLog
  const logTx = buildLogChargePTB({
    cardId: card.id,
    capId: card.cap_id,
    amount: req.amountAtoms,
    fee: 0n,
    recipient: poolId,
    memo: req.memo ?? "",
    txDigest: result.digest,
  });
  const logSponsored = await deps.gasSponsor.sponsorTransaction(logTx);
  deps.gasSponsor.executeTransaction(logSponsored).catch(
    (e) => console.warn(`[execute] log_charge failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`),
  );

  store.insertEventLog({
    id: crypto.randomUUID(),
    card_id: cardId,
    charge_id: chargeId,
    type: "execute",
    data: JSON.stringify({
      protocol: req.protocol,
      action: req.action,
      amount: atomsToUsdc(req.amountAtoms),
      tx_digest: result.digest,
    }),
    created_at: now,
  });

  const charge = store.getCharge(chargeId)!;
  const state = cardState(store, cardId, now);
  return {
    status: charge.status === "confirmed" ? "confirmed" : "failed" as const,
    tx: charge.tx_hash,
    to: poolId,
    amount: atomsToUsdc(charge.amount_atoms),
    fee: atomsToUsdc(charge.fee_atoms),
    remaining_this_period: state?.remaining_this_period ?? null,
    memo: charge.memo ?? undefined,
  };
}

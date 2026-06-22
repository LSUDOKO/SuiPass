import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";
import { GasSponsor } from "./sponsor";
import { buildDeepBookSwapPTB, buildLogChargePTB, type SwapDirection } from "./ptb";
import { RefusalError, EngineError } from "./errors";
import { atomsToUsdc } from "./terms";
import { findSponsorCoin, moveErrorToRefusal } from "./sui";
import {
  SUI_CLIENT,
  USDC_COIN_TYPE,
  DEEP_COIN_TYPE,
  DEEPBOOK_DEFAULT_POOL,
} from "./sui";
import type { Store } from "./store";
import { assertChainSpendable, cardState, validateSpend } from "./spend";
import type { SpendRequest, SpendDeps, Receipt } from "./spend";

export type ExecuteProtocol = "deepbook" | "cetus";

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
  suiClient: SuiJsonRpcClient;
  gasSponsor: GasSponsor;
  packageId: string;
  now?: () => number;
};

// ─── DeepBook swap ───

async function handleDeepBookSwap(
  deps: ExecuteDeps,
  cardId: string,
  card: { id: string; cap_id: string; card_obj_id: string; user_id: string },
  req: ExecuteRequest,
  usdcCoinId: string,
  recipient: string,
  now: number,
): Promise<Receipt> {
  const store = deps.store;
  const client = deps.suiClient ?? SUI_CLIENT;

  const deepCoinId = await findSponsorCoin(client, deps.gasSponsor.sponsorAddress, DEEP_COIN_TYPE, 10_000_000n);

  const poolId = req.poolId ?? DEEPBOOK_DEFAULT_POOL;
  const minOut = req.minOutAtoms ?? 0n;
  const direction = req.action as SwapDirection;

  const tx = buildDeepBookSwapPTB({
    poolId,
    direction,
    coinIn: usdcCoinId,
    coinInType: req.sellCoinType,
    coinOutType: req.buyCoinType,
    deepCoinId: deepCoinId ?? null,
    minOut,
    recipient,
  });

  return executeAndLog(deps, cardId, card, req, tx, poolId, now);
}

// ─── Cetus swap (via AggregatorClient SDK) ───

async function handleCetusSwap(
  deps: ExecuteDeps,
  cardId: string,
  card: { id: string; cap_id: string; card_obj_id: string; user_id: string },
  req: ExecuteRequest,
  usdcCoinId: string,
  recipient: string,
  now: number,
): Promise<Receipt> {
  // Use the Cetus AggregatorClient to find routes and build the swap PTB
  // The SDK auto-creates a SuiGrpcClient when none is provided
  const cetusClient = new AggregatorClient({
    env: Env.Testnet,
    signer: deps.gasSponsor.sponsorAddress,
  });

  const amountStr = req.amountAtoms.toString();
  const routers = await cetusClient.findRouters({
    from: req.sellCoinType,
    target: req.buyCoinType,
    amount: amountStr,
    byAmountIn: true,
  });

  if (!routers || !routers.paths || routers.paths.length === 0) {
    throw new RefusalError("invalid_terms", "Cetus: no swap routes found for this pair on testnet — Circle USDC may not be listed in Cetus testnet pools");
  }
  if (routers.insufficientLiquidity) {
    throw new RefusalError("invalid_terms", "Cetus: insufficient liquidity for this pair");
  }
  if (!routers.paths[0]?.from) {
    throw new RefusalError("invalid_terms", "Cetus: invalid route data — the aggregator returned incomplete paths");
  }

  const txb = new Transaction();
  await cetusClient.fastRouterSwap({
    router: routers,
    slippage: 0.01,
    txb,
    sponsored: true,
  });

  const poolId = routers.paths[0].id ?? "cetus";
  return executeAndLog(deps, cardId, card, req, txb, poolId, now);
}

// ─── Shared execution + logging ───

async function executeAndLog(
  deps: ExecuteDeps,
  cardId: string,
  card: { id: string; cap_id: string; card_obj_id: string; user_id: string },
  req: ExecuteRequest,
  tx: Transaction,
  target: string,
  now: number,
): Promise<Receipt> {
  const store = deps.store;

  const sponsored = await deps.gasSponsor.sponsorTransaction(tx);

  const chargeId = crypto.randomUUID();
  store.insertCharge({
    id: chargeId,
    card_id: cardId,
    idempotency_key: req.idempotencyKey ?? null,
    kind: "execute",
    to_addr: target,
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
      throw new RefusalError(moveErrorToRefusal(code), `on-chain ${req.protocol} swap failed: ${result.error}`);
    }
    throw new EngineError("execute", `${req.protocol} swap execution failed: ${result.error}`);
  }

  store.updateCharge(chargeId, {
    status: "confirmed",
    tx_hash: result.digest,
    request_id: result.digest,
  });

  // Fire-and-forget on-chain ChargeLog — use on-chain Card object ID, not UUID
  const logTx = buildLogChargePTB({
    cardId: card.card_obj_id,
    capId: card.cap_id,
    amount: req.amountAtoms,
    fee: 0n,
    recipient: target,
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
    to: target,
    amount: atomsToUsdc(charge.amount_atoms),
    fee: atomsToUsdc(charge.fee_atoms),
    remaining_this_period: state?.remaining_this_period ?? null,
    memo: charge.memo ?? undefined,
  };
}

// ─── Main execute dispatcher ───

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

  const usdcCoinId = await findSponsorCoin(client, sponsorAddress, USDC_COIN_TYPE, req.amountAtoms);
  if (!usdcCoinId) {
    throw new RefusalError("invalid_terms", "sponsor has insufficient USDC for this swap");
  }

  const user = store.getUser(card.user_id);
  const recipient = user?.address ?? sponsorAddress;

  if (req.protocol === "cetus") {
    return handleCetusSwap(deps, cardId, card, req, usdcCoinId, recipient, now);
  }

  return handleDeepBookSwap(deps, cardId, card, req, usdcCoinId, recipient, now);
}

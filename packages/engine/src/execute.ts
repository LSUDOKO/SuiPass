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
  DBUSDC_COIN_TYPE,
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
};const SUI_COIN_TYPE = "0x2::sui::SUI";

// ─── DeepBook swap ───

/** Find a DBUSDC coin owned by the sponsor. If none exists, try to convert
 *  Circle USDC to DBUSDC via Cetus first, then find the resulting coin. */
export async function findOrAcquireDBUSDC(
  deps: ExecuteDeps,
  minBalance: bigint,
): Promise<string | null> {
  const client = deps.suiClient ?? SUI_CLIENT;
  const owner = deps.gasSponsor.sponsorAddress;

  // 1) Check if sponsor already has DBUSDC
  const existing = await findSponsorCoin(client, owner, DBUSDC_COIN_TYPE, minBalance);
  if (existing) return existing;

  // 2) Check if sponsor has Circle USDC to convert
  const usdcCoin = await findSponsorCoin(client, owner, USDC_COIN_TYPE, minBalance);
  if (!usdcCoin) return null;

  // 3) Try to swap Circle USDC → DBUSDC via Cetus
  console.log(`[execute] acquiring DBUSDC: swapping ${minBalance} Circle USDC for DBUSDC via Cetus`);
  try {
    const cetusClient = new AggregatorClient({
      env: Env.Testnet,
      signer: owner,
    });

    const routers = await cetusClient.findRouters({
      from: USDC_COIN_TYPE,
      target: DBUSDC_COIN_TYPE,
      amount: minBalance.toString(),
      byAmountIn: true,
    });

    if (!routers?.paths?.length) {
      console.warn("[execute] Cetus: no route from USDC to DBUSDC — sponsor needs DBUSDC directly");
      return null;
    }

    const txb = new Transaction();
    await cetusClient.fastRouterSwap({
      router: routers,
      slippage: 0.05,
      txb,
      sponsored: true,
    });

    const sponsored = await deps.gasSponsor.sponsorTransaction(txb);
    const result = await deps.gasSponsor.executeTransaction(sponsored);

    if (result.error) {
      console.warn(`[execute] Cetus USDC→DBUSDC swap failed: ${result.error}`);
      return null;
    }

    console.log(`[execute] USDC→DBUSDC swap succeeded: ${result.digest}`);

    // 4) Find the newly created DBUSDC coin
    const dbusdc = await findSponsorCoin(client, owner, DBUSDC_COIN_TYPE, minBalance);
    return dbusdc;
  } catch (e) {
    console.warn(`[execute] failed to acquire DBUSDC: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function handleDeepBookSwap(
  deps: ExecuteDeps,
  cardId: string,
  card: { id: string; cap_id: string; card_obj_id: string; user_id: string },
  req: ExecuteRequest,
  recipient: string,
  now: number,
): Promise<Receipt> {
  const client = deps.suiClient ?? SUI_CLIENT;
  const owner = deps.gasSponsor.sponsorAddress;
  const direction = req.action as SwapDirection;

  // Determine which coin we need to find based on the swap direction:
  // - swap_exact_quote_for_base: selling the quote coin (DBUSDC), buying the base
  // - swap_exact_base_for_quote: selling the base coin (SUI/etc), buying the quote (DBUSDC)
  const sellingQuote = direction === "swap_exact_quote_for_base";

  let coinInId: string | null;
  let coinInType: string;

  if (sellingQuote) {
    // Selling DBUSDC → need DBUSDC coin (acquire from Circle USDC if needed)
    coinInType = DBUSDC_COIN_TYPE;
    coinInId = await findOrAcquireDBUSDC(deps, req.amountAtoms);
    if (!coinInId) {
      throw new RefusalError(
        "invalid_terms",
        "DeepBook: no DBUSDC available for swap. Sponsor needs DBUSDC (or Circle USDC to auto-convert) on testnet. Try: acquire_dbusdc first, or use Cetus instead.",
      );
    }
  } else {
    // Selling the base coin (e.g. SUI) → find the base coin
    coinInType = req.sellCoinType;
    coinInId = await findSponsorCoin(client, owner, req.sellCoinType, req.amountAtoms);
    if (!coinInId) {
      throw new RefusalError(
        "invalid_terms",
        `DeepBook: no ${req.sellCoinType} coins available for swap. Sponsor does not hold enough of the sell coin.`,
      );
    }
  }

  // DEEP fee coin: try to find an existing one, or create a zero-balance one
  const deepCoinId = await findSponsorCoin(client, owner, DEEP_COIN_TYPE, 10_000_000n);

  const poolId = req.poolId ?? DEEPBOOK_DEFAULT_POOL;
  const minOut = req.minOutAtoms ?? 0n;

  const tx = buildDeepBookSwapPTB({
    poolId,
    direction,
    coinIn: coinInId,
    coinInType,
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
    throw new RefusalError(
      "invalid_terms",
      `Cetus: no swap routes found for ${req.sellCoinType} → ${req.buyCoinType} on testnet`,
    );
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

  // Fire-and-forget on-chain ChargeLog
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
  const user = store.getUser(card.user_id);
  const recipient = user?.address ?? sponsorAddress;

  if (req.protocol === "cetus") {
    // Cetus: find Circle USDC coin for the card budget deduction
    const usdcCoinId = await findSponsorCoin(client, sponsorAddress, USDC_COIN_TYPE, req.amountAtoms);
    if (!usdcCoinId) {
      throw new RefusalError("invalid_terms", "sponsor has insufficient Circle USDC for this Cetus swap");
    }
    return handleCetusSwap(deps, cardId, card, req, usdcCoinId, recipient, now);
  }

  // DeepBook: coin discovery is handled inside handleDeepBookSwap (DBUSDC or base coin)
  return handleDeepBookSwap(deps, cardId, card, req, recipient, now);
}

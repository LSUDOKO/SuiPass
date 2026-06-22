// SuiPass: Programmable Transaction Block builders
// These replace the ERC-7710 delegation + 1Shot relayer pattern

import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import type { CardTerms } from "./terms";
import { SUIPASS_PACKAGE_ID, CLOCK_OBJECT_ID, CARD_MODULE, USDC_COIN_TYPE, DEEPBOOK_PACKAGE_ID, DEEPBOOK_POOL_MODULE, DEEP_COIN_TYPE } from "./sui";

// ─── Card Issuance ───

export function buildIssueRootCardPTB(args: {
  name: string;
  budgetPeriodAmount: bigint;
  budgetPeriodSeconds: bigint;
  budgetLifetimeAmount: bigint;
  perTxMax: bigint;
  maxUses: bigint;
  expiry: bigint;
  merchantAllowlist: string[];
  recipient: string;
}): Transaction {
  const tx = new Transaction();

  const clockArg = tx.object(CLOCK_OBJECT_ID);

  const merchantVec = args.merchantAllowlist.map((addr) => tx.pure.address(addr));

  const [card, cap] = tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::issue_root_card`,
    arguments: [
      tx.pure.string(args.name),
      tx.pure.u64(args.budgetPeriodAmount),
      tx.pure.u64(args.budgetPeriodSeconds),
      tx.pure.u64(args.budgetLifetimeAmount),
      tx.pure.u64(args.perTxMax),
      tx.pure.u64(args.maxUses),
      tx.pure.u64(args.expiry),
      tx.makeMoveVec({ elements: merchantVec, type: "address" }),
      clockArg,
    ],
  });

  tx.transferObjects([card!, cap!], tx.pure.address(args.recipient));

  return tx;
}

export function buildIssueSubcardPTB(args: {
  parentCardId: string;
  parentCapId: string;
  name: string;
  budgetPeriodAmount: bigint;
  budgetPeriodSeconds: bigint;
  budgetLifetimeAmount: bigint;
  perTxMax: bigint;
  maxUses: bigint;
  expiry: bigint;
  merchantAllowlist: string[];
  recipient: string;
}): Transaction {
  const tx = new Transaction();

  const clockArg = tx.object(CLOCK_OBJECT_ID);
  const merchantVec = args.merchantAllowlist.map((addr) => tx.pure.address(addr));

  const [card, cap] = tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::issue_subcard`,
    arguments: [
      tx.object(args.parentCardId),
      tx.object(args.parentCapId),
      tx.pure.string(args.name),
      tx.pure.u64(args.budgetPeriodAmount),
      tx.pure.u64(args.budgetPeriodSeconds),
      tx.pure.u64(args.budgetLifetimeAmount),
      tx.pure.u64(args.perTxMax),
      tx.pure.u64(args.maxUses),
      tx.pure.u64(args.expiry),
      tx.makeMoveVec({ elements: merchantVec, type: "address" }),
      clockArg,
    ],
  });

  tx.transferObjects([card!, cap!], tx.pure.address(args.recipient));

  return tx;
}

// ─── Spend ───
// spend<T> is generic — the coin type T must be passed as a type argument.

export function buildSpendPTB(args: {
  cardId: string;
  capId: string;
  amount: bigint;
  recipient: string;
  merchant: string;
  memo: string;
  usdcCoinId: string;
  coinType?: string;      // default: USDC_COIN_TYPE
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::spend`,
    typeArguments: [args.coinType ?? USDC_COIN_TYPE],
    arguments: [
      tx.object(args.cardId),
      tx.object(args.capId),
      tx.pure.u64(args.amount),
      tx.pure.address(args.recipient),
      tx.pure.address(args.merchant),
      tx.pure.string(args.memo),
      tx.object(args.usdcCoinId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

// ─── On-chain Activity Log ───

// ─── On-chain Activity Log ───

export function buildLogChargePTB(args: {
  cardId: string;
  capId: string;
  amount: bigint;
  fee: bigint;
  recipient: string;
  memo: string;
  txDigest: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::log_charge`,
    arguments: [
      tx.object(args.cardId),
      tx.object(args.capId),
      tx.pure.u64(args.amount),
      tx.pure.u64(args.fee),
      tx.pure.address(args.recipient),
      tx.pure.string(args.memo),
      tx.pure.string(args.txDigest),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

// ─── DeepBook Swap ───
//
// DeepBook V3 is a CLOB (Central Limit Order Book). The pool module exposes
// two swap-entry functions:
//   swap_exact_quote_for_base — sell the quote coin, buy the base coin
//   swap_exact_base_for_quote — sell the base coin, buy the quote coin
//
// Both accept an optional Coin<DEEP> for the protocol fee. When the sponsor
// has no DEEP tokens, a zero-balance DEEP coin is created on-chain via
// coinWithBalance (the pool accepts 0-DEEP fees).
//
// Each function returns up to three coin results:
//   [coinOut, leftoverIn, leftoverDEEP]

export type SwapDirection = "swap_exact_quote_for_base" | "swap_exact_base_for_quote";

export function buildDeepBookSwapPTB(args: {
  poolId: string;
  direction: SwapDirection;
  coinIn: string;               // the coin object ID to sell (Coin<SellType>)
  coinInType: string;           // the type of the coin being sold
  coinOutType: string;          // the type of the coin being bought
  deepCoinId: string | null;    // DEEP coin object ID (null = no DEEP fee)
  minOut: bigint;               // minimum receive amount (slippage)
  recipient: string;            // address that receives the output coins
}): Transaction {
  const tx = new Transaction();

  const target = `${DEEPBOOK_PACKAGE_ID}::${DEEPBOOK_POOL_MODULE}::${args.direction}`;
  const typeArgs = args.direction === "swap_exact_quote_for_base"
    ? [args.coinOutType, args.coinInType]   // base, quote
    : [args.coinInType, args.coinOutType];  // base, quote

  const deepCoin = args.deepCoinId
    ? tx.object(args.deepCoinId)
    : coinWithBalance({ type: DEEP_COIN_TYPE, balance: 0n });

  const [coinOut, leftoverCoin, leftoverDEEP] = tx.moveCall({
    target: target as `${string}::${string}::${string}`,
    typeArguments: typeArgs,
    arguments: [
      tx.object(args.poolId),
      tx.object(args.coinIn),
      deepCoin,
      tx.pure.u64(args.minOut),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  tx.transferObjects([coinOut!, leftoverCoin!, leftoverDEEP!], tx.pure.address(args.recipient));

  return tx;
}

// ─── Controls ───

export function buildRevokeCardPTB(args: {
  cardId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::revoke_card`,
    arguments: [tx.object(args.cardId)],
  });
  return tx;
}

export function buildFreezeCardPTB(args: {
  cardId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::freeze_card`,
    arguments: [tx.object(args.cardId)],
  });
  return tx;
}

export function buildUnfreezeCardPTB(args: {
  freezeMarkerId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::unfreeze_card`,
    arguments: [tx.object(args.freezeMarkerId)],
  });
  return tx;
}

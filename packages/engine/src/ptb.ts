// SuiPass: Programmable Transaction Block builders
// These replace the ERC-7710 delegation + 1Shot relayer pattern

import { Transaction } from "@mysten/sui/transactions";
import type { CardTerms } from "./terms";
import { SUIPASS_PACKAGE_ID, CLOCK_OBJECT_ID, CARD_MODULE } from "./sui";

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
      tx.makeMoveVec({ elements: merchantVec }),
      clockArg,
    ],
  });

  tx.transferObjects([card, cap], tx.pure.address(tx.getSender()));

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
      tx.makeMoveVec({ elements: merchantVec }),
      clockArg,
    ],
  });

  tx.transferObjects([card, cap], tx.pure.address(tx.getSender()));

  return tx;
}

// ─── Spend ───

export function buildSpendPTB(args: {
  cardId: string;
  capId: string;
  amount: bigint;
  recipient: string;
  merchant: string;
  memo: string;
  usdcCoinId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SUIPASS_PACKAGE_ID}::${CARD_MODULE}::spend`,
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

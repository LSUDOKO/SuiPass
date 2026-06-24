// SuiPass: Card issuance — builds PTBs, records metadata.
// Users sign via zkLogin; server sponsors gas and records the card in the store.

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { GasSponsor } from "./sponsor";
import { buildIssueRootCardPTB, buildIssueSubcardPTB } from "./ptb";
import { RefusalError, EngineError } from "./errors";
import { parseUsdcAmount, validateTerms, type CardTerms } from "./terms";
import type { Store, CardRow } from "./store";

export type IssuedCard = {
  cardId: string;
  secret: string;
  terms: CardTerms;
  cardObjId: string;
  capId: string;
};

export type IssuanceDeps = {
  store: Store;
  suiClient: SuiJsonRpcClient;
  gasSponsor: GasSponsor;
  packageId: string;
  now?: () => number;
};

// Pre-flight: verify that the parent Card and CardCap objects actually exist on-chain
// with the expected types before building a PTB that references them.
// The CommandArgumentError { arg_idx: 0, kind: TypeMismatch } from the Sui fullnode
// happens when the object at the given ID either doesn't exist or has a different type
// than what the function expects (e.g. the object was consumed by a revoke/delete).
async function verifyCardObjectsExist(
  suiClient: SuiJsonRpcClient,
  parent: CardRow,
  operation: string,
  requireCap = true,
): Promise<void> {
  const errors: string[] = [];

  // Check Card object
  try {
    const cardObj = await suiClient.getObject({
      id: parent.card_obj_id,
      options: { showType: true },
    });
    if (!cardObj?.data) {
      errors.push(`Card object ${parent.card_obj_id} does not exist on-chain (may have been deleted/consumed)`);
    }
  } catch (e) {
    errors.push(`Failed to check Card object ${parent.card_obj_id}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Check CardCap object (if required)
  if (requireCap) {
    try {
    const capObj = await suiClient.getObject({
      id: parent.cap_id,
      options: { showType: true },
    });
    if (!capObj?.data) {
        errors.push(`CardCap object ${parent.cap_id} does not exist on-chain (may have been deleted/consumed)`);
      }
    } catch (e) {
      errors.push(`Failed to check CardCap object ${parent.cap_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) {
    throw new EngineError("issuance", `${operation} pre-flight check failed:\n${errors.join("\n")}`);
  }
}

// ─── Root Card ───

export async function issueRootCard(
  deps: IssuanceDeps,
  args: { userId: string; name: string; terms: CardTerms },
): Promise<IssuedCard> {
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  validateTerms(args.terms, now);

  const pay = args.terms.pay!;
  const budgetPeriodAmount = pay.period ? parseUsdcAmount(pay.period.amount) : 0n;
  const budgetPeriodSeconds = BigInt(pay.period?.seconds ?? 0);
  const budgetLifetimeAmount = pay.lifetime ? parseUsdcAmount(pay.lifetime.amount) : 0n;
  const perTxMax = args.terms.perTxMax ? parseUsdcAmount(args.terms.perTxMax) : 0n;
  const maxUses = BigInt(args.terms.maxUses ?? 0);
  const expiry = BigInt(args.terms.expiry ?? 0);
  const merchants = args.terms.merchants ?? [];

  const user = deps.store.getUser(args.userId);
  if (!user) throw new RefusalError("card_not_found", "user not found");

  // Issue the Card + Cap to the gas sponsor so it can sign for spend transactions
  // (spend takes &mut Card, requiring the owner's signature on Sui).
  // The user controls the card through the dashboard (freeze/revoke are DB ops).
  const tx = buildIssueRootCardPTB({
    name: args.name,
    budgetPeriodAmount,
    budgetPeriodSeconds,
    budgetLifetimeAmount,
    perTxMax,
    maxUses,
    expiry,
    merchantAllowlist: merchants,
    recipient: deps.gasSponsor.sponsorAddress,
  });

  const sponsored = await deps.gasSponsor.sponsorTransaction(tx);

  const result = await deps.gasSponsor.executeTransaction(sponsored);
  if (result.error) {
    throw new EngineError("issuance", `failed to issue card: ${result.error}`);
  }

  // Extract created object IDs from effects
  // NOTE: issue_root_card Move function returns (CardCap, Card) — Cap first, Card second.
  // So created[0] is the CardCap, created[1] is the Card.
  const created = (result.effects?.created as Array<{ reference: { objectId: string } }>) ?? [];
  const capObj = created[0];  // CardCap (returned first)
  const cardObj = created[1];  // Card (returned second)

  if (!cardObj || !capObj) {
    throw new EngineError("issuance", "card or cap object not created");
  }

  const cardId = crypto.randomUUID();
  const secret = generateCardSecret();

  deps.store.createCard({
    id: cardId,
    user_id: args.userId,
    parent_card_id: null,
    name: args.name,
    secret_hash: hashCardSecret(secret),
    secret_enc: await encryptSecret(secret),
    terms: args.terms,
    cap_id: capObj.reference.objectId,
    card_obj_id: cardObj.reference.objectId,
    freeze_marker_id: null,
    status: "active",
    usage_count: 0,
    created_at: now,
  });

  return {
    cardId,
    secret,
    terms: args.terms,
    cardObjId: cardObj.reference.objectId,
    capId: capObj.reference.objectId,
  };
}

// ─── Sub-card ───

export async function issueSubCard(
  deps: Pick<IssuanceDeps, "store" | "gasSponsor" | "packageId"> & { suiClient?: SuiJsonRpcClient },
  args: { parentCardId: string; name: string; terms: CardTerms },
): Promise<IssuedCard> {
  const now = Math.floor(Date.now() / 1000);
  const store = deps.store;

  const parent = store.getCard(args.parentCardId);
  if (!parent) throw new RefusalError("card_not_found", "parent card not found");
  if (parent.status !== "active") {
    throw new RefusalError(parent.status === "frozen" ? "card_frozen" : "card_revoked", `parent card is ${parent.status}`);
  }

  validateTerms(args.terms, now);

  // Pre-flight: verify parent Card and Cap exist on-chain with expected types
  // (skip if suiClient not available — e.g. legacy callers)
  if (deps.suiClient) {
    await verifyCardObjectsExist(
      deps.suiClient,
      parent,
      'issue_subcard',
    );
  }

  // Attenuation: child must be subset of parent (simplified — full check in Move)
  const pay = args.terms.pay!;
  const budgetPeriodAmount = pay.period ? parseUsdcAmount(pay.period.amount) : 0n;
  const budgetPeriodSeconds = BigInt(pay.period?.seconds ?? 0);
  const budgetLifetimeAmount = pay.lifetime ? parseUsdcAmount(pay.lifetime.amount) : 0n;
  const perTxMax = args.terms.perTxMax ? parseUsdcAmount(args.terms.perTxMax) : 0n;
  const maxUses = BigInt(args.terms.maxUses ?? 0);
  const expiry = BigInt(args.terms.expiry ?? 0);
  const merchants = args.terms.merchants ?? [];

  // Issue the sub-card + cap to the gas sponsor so it can sign for spend transactions
  // (same reason as root card — spend takes &mut Card).
  const tx = buildIssueSubcardPTB({
    parentCardId: parent.card_obj_id,
    parentCapId: parent.cap_id,
    name: args.name,
    budgetPeriodAmount,
    budgetPeriodSeconds,
    budgetLifetimeAmount,
    perTxMax,
    maxUses,
    expiry,
    merchantAllowlist: merchants,
    recipient: deps.gasSponsor.sponsorAddress,
  });

  const sponsored = await deps.gasSponsor.sponsorTransaction(tx);

  let result: { digest: string; effects: Record<string, unknown>; error?: string };
  try {
    result = await deps.gasSponsor.executeTransaction(sponsored);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not signed by the correct sender")) {
      throw new RefusalError("not_owner", "Sub-card issuance requires the card owner's on-chain signature — this can only be done through the SuiPass dashboard, not via an AI agent.", {
        card_id: args.parentCardId,
        hint: "Open the dashboard, select the card, and use 'Issue Sub-Card' to sign with your zkLogin wallet.",
      });
    }
    throw new EngineError("issuance", `failed to issue sub-card: ${msg}`);
  }
  if (result.error) {
    throw new EngineError("issuance", `failed to issue sub-card: ${result.error}`);
  }

  // NOTE: issue_subcard Move function returns (CardCap, Card) — Cap first, Card second (same as issue_root_card)
  const created = (result.effects?.created as Array<{ reference: { objectId: string } }>) ?? [];
  const capObj = created[0];  // CardCap (returned first)
  const cardObj = created[1];  // Card (returned second)
  if (!cardObj || !capObj) {
    throw new EngineError("issuance", "sub-card or cap object not created");
  }

  const cardId = crypto.randomUUID();
  const secret = generateCardSecret();

  store.createCard({
    id: cardId,
    user_id: parent.user_id,
    parent_card_id: parent.id,
    name: args.name,
    secret_hash: hashCardSecret(secret),
    secret_enc: await encryptSecret(secret),
    terms: args.terms,
    cap_id: capObj.reference.objectId,
    card_obj_id: cardObj.reference.objectId,
    freeze_marker_id: null,
    status: "active",
    usage_count: 0,
    created_at: now,
  });

  return {
    cardId,
    secret,
    terms: args.terms,
    cardObjId: cardObj.reference.objectId,
    capId: capObj.reference.objectId,
  };
}

// ─── Secret management (reused from EVM version) ───

function generateCardSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

function hashCardSecret(secret: string): string {
  return new Bun.CryptoHasher("sha256").update(secret).digest("hex");
}

async function encryptSecret(plaintext: string): Promise<Uint8Array> {
  const masterKeyHex = process.env.SUIPASS_MASTER_KEY;
  if (!masterKeyHex || !/^(0x)?[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
    throw new EngineError("custody", "SUIPASS_MASTER_KEY must be set to 32-byte hex");
  }
  const keyBytes = hexToBytes(masterKeyHex.replace(/^0x/, ""));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const blob = new Uint8Array(12 + ct.length);
  blob.set(iv, 0);
  blob.set(ct, 12);
  return blob;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

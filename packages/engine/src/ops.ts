// SuiPass: Control operations — freeze/unfreeze/revoke/nuke
// Simplified from EVM: no DelegationManager, no NonceEnforcer.
// Freeze = create FreezeMarker object on Sui.
// Revoke = set is_revoked flag on Card object.
// Nuke = revoke all user's cards server-side.

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { GasSponsor } from "./sponsor";
import { buildRevokeCardPTB, buildFreezeCardPTB, buildUnfreezeCardPTB } from "./ptb";
import { RefusalError, EngineError } from "./errors";
import type { Store } from "./store";

export type OpsDeps = {
  store: Store;
  suiClient: SuiJsonRpcClient;
  gasSponsor: GasSponsor;
  packageId: string;
};

export type AdminOpResult = { txHash: string | null; digest?: string };

// ─── Freeze (server-side + on-chain FreezeMarker) ───

export async function freezeCard(deps: OpsDeps, cardId: string): Promise<AdminOpResult> {
  const card = deps.store.getCard(cardId);
  if (!card) throw new RefusalError("card_not_found", "no such card");
  if (card.status !== "active") throw new RefusalError("card_revoked", `card is ${card.status}, cannot freeze`);

  const tx = buildFreezeCardPTB({ cardId: card.card_obj_id });
  const sponsored = await deps.gasSponsor.sponsorTransaction(tx);
  const result = await deps.gasSponsor.executeTransaction(sponsored);

  if (result.error) {
    throw new EngineError("ops", `freeze failed: ${result.error}`);
  }

  // Extract FreezeMarker object ID from created objects
  const created = result.effects?.created as Array<{ reference: { objectId: string } }> | undefined;
  const markerId = created?.[0]?.reference?.objectId;

  if (markerId) {
    deps.store.setFreezeMarker(cardId, markerId);
  } else {
    deps.store.setCardStatus(cardId, "frozen");
  }

  return { txHash: result.digest, digest: result.digest };
}

export async function unfreezeCard(deps: OpsDeps, cardId: string): Promise<AdminOpResult> {
  const card = deps.store.getCard(cardId);
  if (!card) throw new RefusalError("card_not_found", "no such card");
  if (card.status !== "frozen") throw new RefusalError("invalid_terms", `card is ${card.status}, not frozen`);

  if (card.freeze_marker_id) {
    const tx = buildUnfreezeCardPTB({ freezeMarkerId: card.freeze_marker_id });
    const sponsored = await deps.gasSponsor.sponsorTransaction(tx);
    const result = await deps.gasSponsor.executeTransaction(sponsored);

    if (result.error) {
      throw new EngineError("ops", `unfreeze on-chain failed: ${result.error}`);
    }

    deps.store.clearFreezeMarker(cardId);
    return { txHash: result.digest, digest: result.digest };
  }

  // No on-chain marker found — just update server-side status
  deps.store.setCardStatus(cardId, "active");
  return { txHash: null };
}

// ─── Revoke (on-chain flag set) ───

export async function revokeCard(deps: OpsDeps, cardId: string): Promise<AdminOpResult> {
  const card = deps.store.getCard(cardId);
  if (!card) throw new RefusalError("card_not_found", "no such card");

  if (card.parent_card_id !== null) {
    // Sub-card: server-side only (parent revoke cascades on-chain via root)
    deps.store.setSubtreeStatus(cardId, "revoked");
    return { txHash: null };
  }

  const tx = buildRevokeCardPTB({ cardId: card.card_obj_id });
  const sponsored = await deps.gasSponsor.sponsorTransaction(tx);
  const result = await deps.gasSponsor.executeTransaction(sponsored);

  if (result.error) {
    throw new EngineError("ops", `revoke failed: ${result.error}`);
  }

  deps.store.setSubtreeStatus(cardId, "revoked");
  return { txHash: result.digest, digest: result.digest };
}

// ─── Nuke (revoke all user's cards) ───

export async function nukeAll(deps: OpsDeps, userId: string): Promise<AdminOpResult> {
  const cards = deps.store.listCards(userId);
  let lastResult: AdminOpResult = { txHash: null };

  for (const card of cards) {
    if (card.status === "active" || card.status === "frozen") {
      try {
        lastResult = await revokeCard(deps, card.id);
      } catch {
        // Best-effort: some may already be revoked on-chain
      }
    }
  }

  deps.store.setAllUserCardsStatus(userId, "nuked");
  return lastResult;
}

// SuiPass: Control operations — freeze/unfreeze/revoke/nuke
// Simplified from EVM: no DelegationManager, no NonceEnforcer.
// Freeze = create FreezeMarker object on Sui.
// Revoke = set is_revoked flag on Card object.
// Nuke = revoke all user's cards server-side.

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { GasSponsor } from "./sponsor";
import { RefusalError } from "./errors";
import type { Store } from "./store";

export type OpsDeps = {
  store: Store;
  suiClient: SuiJsonRpcClient;
  gasSponsor: GasSponsor;
  packageId: string;
};

export type AdminOpResult = { txHash: string | null; digest?: string };

// ─── Freeze / Unfreeze / Revoke (server-side only) ───
// On-chain freeze/revoke requires the card owner's signature (zkLogin user),
// but the gas sponsor signs all server-submitted transactions. For the
// hackathon, these ops update the database status — the server refuses
// spends on frozen/revoked cards without an on-chain flag.

export async function freezeCard(deps: OpsDeps, cardId: string): Promise<AdminOpResult> {
  const card = deps.store.getCard(cardId);
  if (!card) throw new RefusalError("card_not_found", "no such card");
  if (card.status !== "active") throw new RefusalError("card_revoked", `card is ${card.status}, cannot freeze`);
  deps.store.setCardStatus(cardId, "frozen");
  return { txHash: null };
}

export async function unfreezeCard(deps: OpsDeps, cardId: string): Promise<AdminOpResult> {
  const card = deps.store.getCard(cardId);
  if (!card) throw new RefusalError("card_not_found", "no such card");
  if (card.status !== "frozen") throw new RefusalError("invalid_terms", `card is ${card.status}, not frozen`);
  deps.store.setCardStatus(cardId, "active");
  return { txHash: null };
}

export async function revokeCard(deps: OpsDeps, cardId: string): Promise<AdminOpResult> {
  const card = deps.store.getCard(cardId);
  if (!card) throw new RefusalError("card_not_found", "no such card");
  deps.store.setSubtreeStatus(cardId, "revoked");
  return { txHash: null };
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

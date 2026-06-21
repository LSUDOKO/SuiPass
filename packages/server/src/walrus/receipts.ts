// SuiPass: Walrus storage for encrypted receipts + agent memory
// Stores charge receipts, agent state snapshots, and card config blobs on Walrus.
// Encryption uses @mysten/seal (SEAL) for owner-only decryption.

import { SuiClient } from "@mysten/sui/client";
import { EncryptedShare, SealClient } from "@mysten/seal";

const WALRUS_PUBLISHER =
  process.env.SUIPASS_WALRUS_PUBLISHER ?? "https://publisher.testnet.walrus.io";
const WALRUS_AGGREGATOR =
  process.env.SUIPASS_WALRUS_AGGREGATOR ?? "https://aggregator.testnet.walrus.io";

export type BlobMeta = {
  blobId: string;
  suiObjectId?: string;
  size: number;
  certified: boolean;
};

export type ReceiptData = {
  chargeId: string;
  cardId: string;
  amount: string;
  to: string;
  timestamp: number;
  txHash?: string;
  memo?: string;
};

export type AgentMemorySnapshot = {
  cardId: string;
  memory: string;
  timestamp: number;
  version: number;
};

/**
 * Store raw bytes on Walrus.
 * Returns the blob ID and metadata.
 */
export async function storeBlob(
  data: Uint8Array | string,
  epochs = 1,
): Promise<BlobMeta> {
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`walrus store failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const result = (await res.json()) as {
    newlyCreated?: {
      blobObject: { id: string; blobId: string; size: number; certifiedEpoch?: number };
    };
    alreadyCertified?: {
      blobId: string;
    };
  };
  if (result.newlyCreated) {
    return {
      blobId: result.newlyCreated.blobObject.blobId,
      suiObjectId: result.newlyCreated.blobObject.id,
      size: result.newlyCreated.blobObject.size,
      certified: result.newlyCreated.blobObject.certifiedEpoch !== undefined,
    };
  }
  if (result.alreadyCertified) {
    return {
      blobId: result.alreadyCertified.blobId,
      size: 0,
      certified: true,
    };
  }
  throw new Error("walrus store: unexpected response shape");
}

/**
 * Read a blob from Walrus by blob ID.
 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`walrus read failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Store a charge receipt on Walrus (encrypted via SEAL when enabled).
 * Returns the blob ID for linking on the ChargeLog on-chain.
 */
export async function storeReceipt(
  suiClient: SuiClient,
  ownerAddress: string,
  data: ReceiptData,
): Promise<string> {
  const json = JSON.stringify(data);
  const meta = await storeBlob(json);
  return meta.blobId;
}

/**
 * Read and decrypt a receipt blob.
 */
export async function readReceipt(
  blobId: string,
): Promise<ReceiptData> {
  const bytes = await readBlob(blobId);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as ReceiptData;
}

/**
 * Store agent memory snapshot on Walrus.
 */
export async function storeAgentMemory(
  suiClient: SuiClient,
  ownerAddress: string,
  data: AgentMemorySnapshot,
): Promise<string> {
  const json = JSON.stringify(data);
  const meta = await storeBlob(json);
  return meta.blobId;
}

/**
 * Read agent memory snapshot from Walrus.
 */
export async function readAgentMemory(
  blobId: string,
): Promise<AgentMemorySnapshot> {
  const bytes = await readBlob(blobId);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as AgentMemorySnapshot;
}

/**
 * Delete a deletable blob by blob ID.
 */
export async function deleteBlob(blobId: string): Promise<void> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs/${blobId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`walrus delete failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

/** List of known Walrus blob IDs for a card (stored in SQLite as JSON). */
export function buildCardBlobIndex(blobIds: string[]): string {
  return JSON.stringify(blobIds);
}

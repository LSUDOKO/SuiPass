// SuiPass: Walrus blob storage for payment receipts
// Uses the Walrus HTTP API (testnet) to store and retrieve charge receipts
// as permanent blobs for on-chain audit trails.
//
// Testnet endpoints:
//   Publisher:  https://publisher.testnet.walrus.app/v1/blobs
//   Aggregator: https://aggregator.testnet.walrus.app/v1/blobs/<blobId>

const DEFAULT_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

function publisherUrl(): string {
  return process.env.WALRUS_PUBLISHER ?? DEFAULT_PUBLISHER;
}

export function aggregatorUrl(): string {
  return process.env.WALRUS_AGGREGATOR ?? DEFAULT_AGGREGATOR;
}

/** Store a JSON-serializable receipt as a permanent Walrus blob.
 *  Returns the blob ID (base64-encoded) or null if storage fails. */
export async function storeReceipt(receipt: Record<string, unknown>): Promise<string | null> {
  try {
    const body = JSON.stringify(receipt);
    const res = await fetch(`${publisherUrl()}/v1/blobs?epochs=5&permanent=true`, {
      method: "PUT",
      body,
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    const newly = data.newlyCreated as Record<string, unknown> | undefined;
    if (newly) {
      const blobObj = newly.blobObject as Record<string, unknown> | undefined;
      return (blobObj?.blobId as string) ?? null;
    }
    const already = data.alreadyCertified as Record<string, unknown> | undefined;
    if (already) {
      return (already.blobId as string) ?? null;
    }
    return null;
  } catch (e) {
    console.warn(`[walrus] store failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Read a receipt blob from Walrus by blob ID.
 *  Returns the parsed JSON or null if not found. */
export async function readReceipt(blobId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${aggregatorUrl()}/v1/blobs/${encodeURIComponent(blobId)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    console.warn(`[walrus] read failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Build a receipt payload from charge + card data for Walrus storage. */
export function buildReceiptPayload(args: {
  chargeId: string;
  cardId: string;
  cardName: string;
  amount: string;
  fee: string;
  recipient: string;
  txDigest: string;
  memo: string | null;
  kind: string;
  timestamp: number;
}): Record<string, unknown> {
  return {
    version: "1.0",
    type: "suipass_charge_receipt",
    charge_id: args.chargeId,
    card_id: args.cardId,
    card_name: args.cardName,
    network: "sui-testnet",
    amount_usdc: args.amount,
    fee_usdc: args.fee,
    recipient: args.recipient,
    transaction_digest: args.txDigest,
    memo: args.memo ?? "",
    kind: args.kind,
    timestamp: args.timestamp,
    iso_timestamp: new Date(args.timestamp * 1000).toISOString(),
    verified: true,
  };
}

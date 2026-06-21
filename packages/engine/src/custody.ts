// SuiPass: No per-card K_agent keys.
// On Sui, authorization is via CardCap objects, not ECDSA delegation signing.
// The server holds a single GasSponsor keypair for sponsored transactions.
// User keys are ephemeral zkLogin-derived addresses (handled in the frontend).

import { EngineError } from "./errors";

// Master key for encrypting card bearer secrets (same pattern as EVM version).
// SuiPass_MASTER_KEY env var, 32-byte hex.
const IV_BYTES = 12;

let cachedKey: CryptoKey | null = null;
let cachedKeyHex: string | null = null;

async function masterKey(): Promise<CryptoKey> {
  const raw = process.env.SUIPASS_MASTER_KEY;
  if (!raw || !/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    throw new EngineError(
      "custody",
      "SUIPASS_MASTER_KEY must be set to 32-byte hex (generate: openssl rand -hex 32)",
    );
  }
  if (cachedKey && cachedKeyHex === raw) return cachedKey;
  const bytes = hexToBytes(raw.replace(/^0x/, ""));
  cachedKey = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  cachedKeyHex = raw;
  return cachedKey;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function encryptSecret(plaintext: string): Promise<Uint8Array> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const blob = new Uint8Array(IV_BYTES + ct.length);
  blob.set(iv, 0);
  blob.set(ct, IV_BYTES);
  return blob;
}

export async function decryptSecret(blob: Uint8Array): Promise<string> {
  if (blob.length <= IV_BYTES) throw new EngineError("custody", "ciphertext blob too short");
  const key = await masterKey();
  const iv = blob.slice(0, IV_BYTES);
  const ct = blob.slice(IV_BYTES);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch (e) {
    throw new EngineError("custody", "decrypt failed (wrong master key or corrupted blob)", e);
  }
}

export function generateCardSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export function hashCardSecret(secret: string): string {
  return new Bun.CryptoHasher("sha256").update(secret).digest("hex");
}

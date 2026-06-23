// SuiPass: Server dependency wiring (Sui edition)
// Replaces: relayer + Privy + 1Shot with SuiJsonRpcClient + zkLogin + GasSponsor

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { GasSponsor, KeyedMutex, Store } from "@suipass/engine";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { SpendDeps } from "@suipass/engine";
import { makeZkLoginVerifier, type ZkLoginVerifier } from "./api/zklogin";
import { veniceChat, type ChatFn } from "./venice/client";
import { storeReceipt as walrusStoreReceipt } from "./walrus";

export type AppDeps = {
  store: Store;
  suiClient: SuiJsonRpcClient;
  gasSponsor: GasSponsor;
  packageId: string;
  verifyZkLoginToken: ZkLoginVerifier | null;
  spendMutex: KeyedMutex;
  spendOverrides?: Partial<SpendDeps>;
  veniceChat?: ChatFn | null;
};

export function envInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

export function realDeps(): AppDeps {
  const store = new Store();
  const suiClient = new SuiJsonRpcClient({
    url: process.env.SUIPASS_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
    network: (process.env.SUIPASS_SUI_NETWORK as "mainnet" | "testnet" | "devnet" | "localnet") ?? "testnet",
  });

  // Gas sponsor keypair from env (or generate for dev)
  const sponsorSecretKey = process.env.SUIPASS_GAS_SPONSOR_KEY;
  const gasSponsor = sponsorSecretKey
    ? new GasSponsor(new Uint8Array(Buffer.from(sponsorSecretKey, "hex")))
    : new GasSponsor();

  const googleClientId = process.env.SUIPASS_GOOGLE_CLIENT_ID;

  const deps: AppDeps = {
    store,
    suiClient,
    gasSponsor,
    packageId: process.env.SUIPASS_PACKAGE_ID!,
    verifyZkLoginToken: googleClientId ? makeZkLoginVerifier(googleClientId) : null,
    spendMutex: new KeyedMutex(),
    veniceChat: process.env.VENICE_API_KEY ? veniceChat() : null,
  };

  console.log(`[deps] SuiPass v1.0.0`);
  console.log(`[deps] Network: ${process.env.SUIPASS_SUI_NETWORK ?? "testnet"}`);
  console.log(`[deps] Package ID: ${deps.packageId}`);
  console.log(`[deps] Gas Sponsor: ${gasSponsor.sponsorAddress}`);
  console.log(`[deps] zkLogin: ${googleClientId ? "enabled" : "disabled"}`);
  console.log(`[deps] Venice AI: ${process.env.VENICE_API_KEY ? "enabled" : "disabled"}`);
  console.log(`[deps] Walrus: ${process.env.WALRUS_PUBLISHER ? "enabled" : "disabled (using testnet defaults)"}`);

  return deps;
}

export function spendKey(store: Store, cardId: string): string {
  const chain = store.ancestorChain(cardId);
  return chain.length ? chain[chain.length - 1]!.id : cardId;
}

export function spendDeps(deps: AppDeps): SpendDeps {
  return {
    store: deps.store,
    suiClient: deps.suiClient,
    gasSponsor: deps.gasSponsor,
    packageId: deps.packageId,
    ...deps.spendOverrides,
    // Fire-and-forget Walrus receipt storage after each successful spend
    storeReceipt: walrusStoreReceipt,
  };
}

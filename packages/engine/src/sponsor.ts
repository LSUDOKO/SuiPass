// SuiPass: Gas sponsorship for agent transactions
// Replaces the 1Shot relayer with Sui's native sponsored transactions.
// The server holds a gas sponsor keypair and pays gas for every agent spend.

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLIENT } from "./sui";
import { EngineError } from "./errors";

export class GasSponsor {
  private keypair: Ed25519Keypair;
  private client: SuiJsonRpcClient;

  constructor(secretKey?: Uint8Array) {
    if (secretKey) {
      this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
    } else {
      this.keypair = Ed25519Keypair.generate();
    }
    this.client = SUI_CLIENT;
  }

  get sponsorAddress(): string {
    return this.keypair.toSuiAddress();
  }

  async sponsorTransaction(tx: Transaction): Promise<Transaction> {
    tx.setGasOwner(this.sponsorAddress);
    tx.setGasBudget(50_000_000); // 0.05 SUI max gas
    return tx;
  }

  async executeTransaction(tx: Transaction): Promise<{
    digest: string;
    effects: Record<string, unknown>;
    error?: string;
  }> {
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
      requestType: "WaitForLocalExecution",
    });

    const effects = result.effects as Record<string, unknown> | undefined;
    const status = effects?.status as Record<string, unknown> | undefined;
    const statusType = status?.status as string | undefined;

    if (statusType === "failure") {
      const err = (status?.error as string) ?? "unknown";
      return {
        digest: result.digest,
        effects: effects ?? {},
        error: err,
      };
    }

    return {
      digest: result.digest,
      effects: effects ?? {},
    };
  }

  async estimateGas(tx: Transaction): Promise<bigint> {
    const result = await this.client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client: this.client }),
    });
    return BigInt(result.effects.gasUsed?.computationCost ?? 0) +
      BigInt(result.effects.gasUsed?.storageCost ?? 0);
  }

  async getBalance(): Promise<bigint> {
    const coins = await this.client.getCoins({
      owner: this.sponsorAddress,
      coinType: "0x2::sui::SUI",
    });
    return coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
  }
}

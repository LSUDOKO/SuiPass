// SuiPass: bun:sqlite store — users, cards, charges, event logs
// Simplified from the EVM version (no delegation/caveat columns)

import { Database } from "bun:sqlite";
import type { CardTerms } from "./terms";

export type CardStatus = "active" | "frozen" | "revoked" | "nuked";
export type ChargeStatus = "pending" | "confirmed" | "failed" | "settlement_unconfirmed";
export type ChargeKind = "pay" | "x402" | "execute" | "admin" | "fiat";

export type UserRow = {
  id: string;
  address: string;
  auth_json: string | null;
  created_at: number;
};

export type CardRow = {
  id: string;
  user_id: string;
  parent_card_id: string | null;
  name: string;
  secret_hash: string;
  secret_enc: Uint8Array | null;
  terms: CardTerms;
  cap_id: string;          // CardCap object ID on Sui
  card_obj_id: string;     // Card object ID on Sui
  status: CardStatus;
  usage_count: number;
  created_at: number;
};

export type ChargeRow = {
  id: string;
  card_id: string;
  idempotency_key: string | null;
  kind: ChargeKind;
  to_addr: string | null;
  amount_atoms: bigint;
  fee_atoms: bigint;
  request_id: string | null;
  tx_hash: string | null;
  status: ChargeStatus;
  memo: string | null;
  created_at: number;
};

export type EventLogRow = {
  id: string;
  card_id: string;
  charge_id: string;
  type: string;
  data: string;
  created_at: number;
};

export type PeriodWindow = { start: number; resetsAt: number };

export function periodWindow(periodSeconds: number, now: number): PeriodWindow {
  const startDate = 0; // SuiPass doesn't use the EVM backdated startDate
  if (now < startDate) return { start: startDate, resetsAt: startDate + periodSeconds };
  const k = Math.floor((now - startDate) / periodSeconds);
  const start = startDate + k * periodSeconds;
  return { start, resetsAt: start + periodSeconds };
}

export class Store {
  readonly db: Database;

  constructor(path: string = process.env.SUIPASS_DB_PATH ?? ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        auth_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        parent_card_id TEXT REFERENCES cards(id),
        name TEXT NOT NULL,
        secret_hash TEXT NOT NULL UNIQUE,
        secret_enc BLOB,
        terms_json TEXT NOT NULL,
        cap_id TEXT NOT NULL,
        card_obj_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_cards_parent ON cards(parent_card_id);
      CREATE TABLE IF NOT EXISTS charges (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id),
        idempotency_key TEXT,
        kind TEXT NOT NULL,
        to_addr TEXT,
        amount_atoms TEXT NOT NULL,
        fee_atoms TEXT NOT NULL,
        request_id TEXT,
        tx_hash TEXT,
        status TEXT NOT NULL,
        memo TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_charges_card ON charges(card_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_charges_idem
        ON charges(card_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS event_logs (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id),
        charge_id TEXT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_event_logs_card ON event_logs(card_id);
    `);
  }

  // ─── Users ───

  upsertUser(u: { id: string; address: string; authJson?: string | null }): void {
    this.db
      .query(
        `INSERT INTO users (id, address, auth_json, created_at)
         VALUES ($id, $address, $auth, unixepoch())
         ON CONFLICT(id) DO UPDATE SET
           auth_json = COALESCE($auth, auth_json)`,
      )
      .run({ $id: u.id, $address: u.address, $auth: u.authJson ?? null });
  }

  getUser(id: string): UserRow | null {
    const r = this.db.query(`SELECT * FROM users WHERE id = $id`).get({ $id: id }) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      id: r.id as string,
      address: r.address as string,
      auth_json: (r.auth_json as string) ?? null,
      created_at: r.created_at as number,
    };
  }

  getUserByAddress(address: string): UserRow | null {
    const r = this.db
      .query(`SELECT * FROM users WHERE address = $a COLLATE NOCASE`)
      .get({ $a: address }) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      id: r.id as string,
      address: r.address as string,
      auth_json: (r.auth_json as string) ?? null,
      created_at: r.created_at as number,
    };
  }

  // ─── Cards ───

  createCard(c: Omit<CardRow, "terms"> & { terms: CardTerms }): void {
    this.db
      .query(
        `INSERT INTO cards (id, user_id, parent_card_id, name, secret_hash, secret_enc, terms_json,
                            cap_id, card_obj_id, status, usage_count, created_at)
         VALUES ($id, $user, $parent, $name, $hash, $senc, $terms, $cap, $obj, $status, $usage, $created)`,
      )
      .run({
        $id: c.id,
        $user: c.user_id,
        $parent: c.parent_card_id,
        $name: c.name,
        $hash: c.secret_hash,
        $senc: c.secret_enc,
        $terms: JSON.stringify(c.terms),
        $cap: c.cap_id,
        $obj: c.card_obj_id,
        $status: c.status,
        $usage: c.usage_count,
        $created: c.created_at,
      });
  }

  private rowToCard(r: Record<string, unknown> | null): CardRow | null {
    if (!r) return null;
    return {
      id: r.id as string,
      user_id: r.user_id as string,
      parent_card_id: (r.parent_card_id as string) ?? null,
      name: r.name as string,
      secret_hash: r.secret_hash as string,
      secret_enc: r.secret_enc ? new Uint8Array(r.secret_enc as Uint8Array) : null,
      terms: JSON.parse(r.terms_json as string),
      cap_id: r.cap_id as string,
      card_obj_id: r.card_obj_id as string,
      status: r.status as CardStatus,
      usage_count: (r.usage_count as number) ?? 0,
      created_at: r.created_at as number,
    };
  }

  getCard(id: string): CardRow | null {
    return this.rowToCard(this.db.query(`SELECT * FROM cards WHERE id = $id`).get({ $id: id }) as Record<string, unknown> | null);
  }

  getCardBySecretHash(hash: string): CardRow | null {
    return this.rowToCard(
      this.db.query(`SELECT * FROM cards WHERE secret_hash = $h`).get({ $h: hash }) as Record<string, unknown> | null,
    );
  }

  listCards(userId: string): CardRow[] {
    const rows = this.db.query(`SELECT * FROM cards WHERE user_id = $u ORDER BY created_at`).all({ $u: userId }) as Record<string, unknown>[];
    return rows.map((r) => this.rowToCard(r)!);
  }

  listChildren(parentCardId: string): CardRow[] {
    const rows = this.db
      .query(`SELECT * FROM cards WHERE parent_card_id = $p ORDER BY created_at`)
      .all({ $p: parentCardId }) as Record<string, unknown>[];
    return rows.map((r) => this.rowToCard(r)!);
  }

  subtreeIds(cardId: string): string[] {
    const rows = this.db
      .query(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM cards WHERE id = $id
           UNION ALL
           SELECT c.id FROM cards c JOIN sub s ON c.parent_card_id = s.id
         ) SELECT id FROM sub`,
      )
      .all({ $id: cardId }) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  ancestorChain(cardId: string): CardRow[] {
    const chain: CardRow[] = [];
    let cur = this.getCard(cardId);
    while (cur) {
      chain.push(cur);
      cur = cur.parent_card_id ? this.getCard(cur.parent_card_id) : null;
    }
    return chain;
  }

  setCardStatus(cardId: string, status: CardStatus): void {
    this.db.query(`UPDATE cards SET status = $s WHERE id = $id`).run({ $s: status, $id: cardId });
  }

  setSubtreeStatus(cardId: string, status: CardStatus): void {
    const ids = this.subtreeIds(cardId);
    const q = this.db.query(`UPDATE cards SET status = $s WHERE id = $id`);
    const tx = this.db.transaction((items: string[]) => {
      for (const id of items) q.run({ $s: status, $id: id });
    });
    tx(ids);
  }

  setAllUserCardsStatus(userId: string, status: CardStatus): void {
    this.db.query(`UPDATE cards SET status = $s WHERE user_id = $u`).run({ $s: status, $u: userId });
  }

  deleteCardTree(cardId: string): number {
    const ids = this.subtreeIds(cardId);
    if (ids.length === 0) return 0;
    const delCharges = this.db.query(`DELETE FROM charges WHERE card_id = $id`);
    const delCard = this.db.query(`DELETE FROM cards WHERE id = $id`);
    const tx = this.db.transaction((items: string[]) => {
      for (const id of items) delCharges.run({ $id: id });
      for (const id of [...items].reverse()) delCard.run({ $id: id });
    });
    tx(ids);
    return ids.length;
  }

  rotateSecret(cardId: string, newHash: string, newSecretEnc: Uint8Array | null = null): void {
    this.db
      .query(`UPDATE cards SET secret_hash = $h, secret_enc = $e WHERE id = $id`)
      .run({ $h: newHash, $e: newSecretEnc, $id: cardId });
  }

  // ─── Charges ───

  insertCharge(ch: ChargeRow): void {
    this.db
      .query(
        `INSERT INTO charges (id, card_id, idempotency_key, kind, to_addr, amount_atoms, fee_atoms,
                              request_id, tx_hash, status, memo, created_at)
         VALUES ($id, $card, $idem, $kind, $to, $amount, $fee, $req, $tx, $status, $memo, $created)`,
      )
      .run({
        $id: ch.id,
        $card: ch.card_id,
        $idem: ch.idempotency_key,
        $kind: ch.kind,
        $to: ch.to_addr,
        $amount: ch.amount_atoms.toString(),
        $fee: ch.fee_atoms.toString(),
        $req: ch.request_id,
        $tx: ch.tx_hash,
        $status: ch.status,
        $memo: ch.memo,
        $created: ch.created_at,
      });
  }

  updateCharge(id: string, fields: { status?: ChargeStatus; tx_hash?: string; request_id?: string; fee_atoms?: bigint }): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { $id: id };
    if (fields.status !== undefined) { sets.push("status = $status"); params.$status = fields.status; }
    if (fields.tx_hash !== undefined) { sets.push("tx_hash = $tx"); params.$tx = fields.tx_hash; }
    if (fields.request_id !== undefined) { sets.push("request_id = $req"); params.$req = fields.request_id; }
    if (fields.fee_atoms !== undefined) { sets.push("fee_atoms = $fee"); params.$fee = fields.fee_atoms.toString(); }
    if (!sets.length) return;
    this.db.query(`UPDATE charges SET ${sets.join(", ")} WHERE id = $id`).run(params as never);
  }

  getCharge(id: string): ChargeRow | null {
    const r = this.db.query(`SELECT * FROM charges WHERE id = $id`).get({ $id: id }) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      id: r.id as string,
      card_id: r.card_id as string,
      idempotency_key: (r.idempotency_key as string) ?? null,
      kind: r.kind as ChargeKind,
      to_addr: (r.to_addr as string) ?? null,
      amount_atoms: BigInt(r.amount_atoms as string),
      fee_atoms: BigInt(r.fee_atoms as string),
      request_id: (r.request_id as string) ?? null,
      tx_hash: (r.tx_hash as string) ?? null,
      status: r.status as ChargeStatus,
      memo: (r.memo as string) ?? null,
      created_at: r.created_at as number,
    };
  }

  deleteCharge(id: string): void {
    this.db.query(`DELETE FROM charges WHERE id = $id`).run({ $id: id });
  }

  chargeByIdempotency(cardId: string, key: string): ChargeRow | null {
    const r = this.db
      .query(`SELECT * FROM charges WHERE card_id = $c AND idempotency_key = $k`)
      .get({ $c: cardId, $k: key }) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      id: r.id as string,
      card_id: r.card_id as string,
      idempotency_key: (r.idempotency_key as string) ?? null,
      kind: r.kind as ChargeKind,
      to_addr: (r.to_addr as string) ?? null,
      amount_atoms: BigInt(r.amount_atoms as string),
      fee_atoms: BigInt(r.fee_atoms as string),
      request_id: (r.request_id as string) ?? null,
      tx_hash: (r.tx_hash as string) ?? null,
      status: r.status as ChargeStatus,
      memo: (r.memo as string) ?? null,
      created_at: r.created_at as number,
    };
  }

  listCharges(cardId: string, limit = 20): ChargeRow[] {
    const rows = this.db
      .query(`SELECT * FROM charges WHERE card_id = $c ORDER BY created_at DESC LIMIT $l`)
      .all({ $c: cardId, $l: limit }) as Record<string, unknown>[];
    return rows.map((r) => {
      return {
        id: r.id as string,
        card_id: r.card_id as string,
        idempotency_key: (r.idempotency_key as string) ?? null,
        kind: r.kind as ChargeKind,
        to_addr: (r.to_addr as string) ?? null,
        amount_atoms: BigInt(r.amount_atoms as string),
        fee_atoms: BigInt(r.fee_atoms as string),
        request_id: (r.request_id as string) ?? null,
        tx_hash: (r.tx_hash as string) ?? null,
        status: r.status as ChargeStatus,
        memo: (r.memo as string) ?? null,
        created_at: r.created_at as number,
      };
    });
  }

  // ─── Accounting ───

  subtreeSpentSince(cardId: string, windowStart: number): bigint {
    const ids = this.subtreeIds(cardId);
    const placeholders = ids.map((_, i) => `$c${i}`).join(",");
    const params: Record<string, unknown> = { $start: windowStart };
    ids.forEach((id, i) => (params[`$c${i}`] = id));
    const rows = this.db
      .query(
        `SELECT amount_atoms, fee_atoms FROM charges
         WHERE card_id IN (${placeholders}) AND status != 'failed' AND created_at >= $start`,
      )
      .all(params as never) as Array<{ amount_atoms: string; fee_atoms: string }>;
    return rows.reduce((acc, r) => acc + BigInt(r.amount_atoms) + BigInt(r.fee_atoms), 0n);
  }

  subtreeSpentLifetime(cardId: string): bigint {
    return this.subtreeSpentSince(cardId, 0);
  }

  subtreeUsesCount(cardId: string): number {
    const ids = this.subtreeIds(cardId);
    const placeholders = ids.map((_, i) => `$c${i}`).join(",");
    const params: Record<string, unknown> = {};
    ids.forEach((id, i) => (params[`$c${i}`] = id));
    const r = this.db
      .query(`SELECT COUNT(*) AS n FROM charges WHERE card_id IN (${placeholders}) AND status != 'failed'`)
      .get(params as never) as { n: number };
    return r.n;
  }

  // ─── Event Logs ───

  insertEventLog(e: EventLogRow): void {
    this.db
      .query(
        `INSERT INTO event_logs (id, card_id, charge_id, type, data, created_at)
         VALUES ($id, $card, $charge, $type, $data, $created)`,
      )
      .run({
        $id: e.id,
        $card: e.card_id,
        $charge: e.charge_id,
        $type: e.type,
        $data: e.data,
        $created: e.created_at,
      });
  }

  listEventLogs(cardId: string, limit = 20): EventLogRow[] {
    const rows = this.db
      .query(`SELECT * FROM event_logs WHERE card_id = $c ORDER BY created_at DESC LIMIT $l`)
      .all({ $c: cardId, $l: limit }) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      card_id: r.card_id as string,
      charge_id: (r.charge_id as string) ?? "",
      type: r.type as string,
      data: r.data as string,
      created_at: r.created_at as number,
    }));
  }

  close(): void {
    this.db.close();
  }
}

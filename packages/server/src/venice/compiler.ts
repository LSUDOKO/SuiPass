// SuiPass: NL -> CardTerms compiler (Sui edition)
// Replaces viem address validation with Sui 0x-prefixed hex address format.
// Protocols: DeepBook, Cetus, Walrus (NOT Uniswap/Aave).

import { RefusalError, validateTerms } from "@suipass/engine";
import type { CardTerms } from "@suipass/engine";
import type { ChatFn } from "./client";
import { extractJson } from "./client";
import type { ResolvedEntity, Resolvers } from "./resolvers";

const USD_AMOUNT_RE = /^\d+(?:\.\d{1,6})?$/;
const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{40,64}$/;

type PlanPeriod = { amount: string; unit: "day" | "week" | "month" };
type Plan = {
  pay?: { period?: PlanPeriod | null; lifetime?: { amount: string } | null; perTx?: string | null } | null;
  expiryDays?: number | null;
  maxUses?: number | null;
  merchants?: string[] | null;
  swaps?: Array<{ protocol: string; sell?: string | null; buy?: string | null; perTradeMax?: string | null }> | null;
  subcards?: boolean | null;
  unsupported?: string[] | null;
};

const UNIT_SECONDS: Record<PlanPeriod["unit"], number> = { day: 86400, week: 604800, month: 2592000 };

export type CompileResult = {
  draft: CardTerms | null;
  labels: ResolvedEntity[];
  warnings: string[];
};

const SYSTEM_PROMPT = `You translate a natural-language spending-card request into a STRICT JSON plan on Sui.
You do NOT output blockchain addresses unless the user typed one verbatim. You name tokens
and protocols by NAME; the server resolves names to verified addresses itself.

Output ONLY a JSON object with this shape (omit fields that don't apply):
{
  "pay": { "period": {"amount":"10","unit":"week"} , "lifetime": {"amount":"100"}, "perTx": "5" },
  "expiryDays": 30,
  "maxUses": 5,
  "merchants": ["0x...", "merchant name"],
  "swaps": [
    {"protocol":"DeepBook","sell":"USDC","buy":"SUI","perTradeMax":"50"},
    {"protocol":"Cetus","sell":"USDC","buy":"SUI"}
  ],
  "subcards": true,
  "unsupported": ["a clause you truly cannot express"]
}
Rules:
- Amounts are decimal strings in the token's units (USDC dollars, SUI in SUI).
- "period.unit" is one of day | week | month.
- "swaps" scopes interactions with DeepBook or Cetus. The known protocols are: DeepBook (limit orders, swaps), Cetus (AMM swaps). Put EVERY known-protocol action here, one entry each.
- For DeepBook swaps: {"protocol":"DeepBook","sell":"USDC","buy":"SUI"}
- For Cetus swaps: {"protocol":"Cetus","sell":"USDC","buy":"SUI"}
- Use the protocol's real name. Known protocols are NEVER unsupported.
- If the user restricts payments to a named payee, list it in "merchants" with a note the server cannot resolve names to Sui addresses.
- Put a clause in "unsupported" only for things like native SUI staking, NFT minting, or cross-chain bridging.
- Capture EVERY limit the user states. Never add limits they didn't ask for.
- Return RAW JSON only — no prose, no markdown code fences.`;

function isSuiAddress(s: string): boolean {
  return SUI_ADDRESS_RE.test(s);
}

function userTypedAddresses(intent: string): Set<string> {
  const out = new Set<string>();
  for (const m of intent.matchAll(/0x[0-9a-fA-F]{40,64}/g)) out.add(m[0]!.toLowerCase());
  return out;
}

export async function compileIntent(
  intent: string,
  deps: { chat: ChatFn; resolvers: Resolvers; now?: () => number },
): Promise<CompileResult> {
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);

  const attempt = async (): Promise<CompileResult> => {
    const raw = await deps.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: intent },
    ]);
    const plan = extractJson(raw) as Plan;
    return assemble(plan, intent, deps.resolvers, now);
  };

  const garbled = (r: CompileResult) => r.warnings.some((w) => w.includes("couldn't resolve"));
  let first: CompileResult | null = null;
  try {
    first = await attempt();
    if (!garbled(first)) return first;
  } catch (e) {
    if (e instanceof Error && /no response within/.test(e.message)) {
      throw new RefusalError("invalid_terms", `the compiler is busy right now (model did not respond): ${e.message}`);
    }
  }
  try {
    const second = await attempt();
    if (!first) return second;
    if (second.draft && !first.draft) return second;
    if (!second.draft && first.draft) return first;
    return second.warnings.length <= first.warnings.length ? second : first;
  } catch {
    if (first) return first;
    throw new RefusalError("invalid_terms", `could not parse a plan from the model`);
  }
}

export async function assemble(
  plan: Plan,
  intent: string,
  resolvers: Resolvers,
  now: number,
): Promise<CompileResult> {
  const warnings: string[] = [];
  const labels: ResolvedEntity[] = [];
  const typed = userTypedAddresses(intent);
  const draft: CardTerms = {};

  if (plan.pay) {
    const pay: NonNullable<CardTerms["pay"]> = {};
    if (plan.pay.period && plan.pay.period.amount) {
      const seconds = UNIT_SECONDS[plan.pay.period.unit];
      if (seconds) pay.period = { amount: String(plan.pay.period.amount), seconds };
      else warnings.push(`unrecognized period unit "${plan.pay.period.unit}"`);
    }
    if (plan.pay.lifetime?.amount) pay.lifetime = { amount: String(plan.pay.lifetime.amount) };
    if (pay.period || pay.lifetime) draft.pay = pay;
    if (plan.pay.perTx) draft.perTxMax = String(plan.pay.perTx);
  }

  if (typeof plan.expiryDays === "number" && plan.expiryDays > 0) {
    draft.expiry = now + Math.floor(plan.expiryDays * 86400);
  }
  if (typeof plan.maxUses === "number" && plan.maxUses >= 1) draft.maxUses = Math.floor(plan.maxUses);
  if (typeof plan.subcards === "boolean") draft.subcards = plan.subcards;

  if (plan.merchants?.length) {
    const merchants: string[] = [];
    for (const m of plan.merchants) {
      if (isSuiAddress(m)) {
        if (!typed.has(m.toLowerCase())) {
          warnings.push(`ignored a merchant address the request didn't contain (${m.slice(0, 10)}...)`);
          continue;
        }
        merchants.push(m.toLowerCase());
        labels.push({ query: m, address: m.toLowerCase(), label: "merchant", kind: "raw_address", source: "user_input" });
      } else {
        warnings.push(`couldn't resolve merchant "${m}" to a Sui address — add their address to lock payments to them`);
      }
    }
    if (merchants.length) draft.merchants = merchants;
  }

  // Map swaps to contract scope
  const targets = new Set<string>();
  const selectors = new Set<string>();
  const tokens = new Set<string>();
  let perTradeMax: string | undefined;
  let haveContract = false;

  for (const swap of plan.swaps ?? []) {
    const proto = resolvers.protocol(swap.protocol);
    if (!proto) {
      warnings.push(`couldn't resolve protocol "${swap.protocol}" — only known Sui protocols can be scoped`);
      continue;
    }
    haveContract = true;
    targets.add(proto.address.toLowerCase());
    labels.push(proto);
    for (const s of proto.selectors ?? []) selectors.add(s);

    // Resolve sell token
    if (swap.sell) {
      const tok = resolvers.token(swap.sell);
      if (tok) {
        targets.add(tok.address.toLowerCase());
        tokens.add(tok.address.toLowerCase());
        labels.push(tok);
      } else {
        warnings.push(`couldn't resolve token "${swap.sell}"`);
      }
    }
    // Resolve buy token for labels
    if (swap.buy) {
      const tok = resolvers.token(swap.buy);
      if (tok) {
        targets.add(tok.address.toLowerCase());
        labels.push(tok);
      } else {
        warnings.push(`couldn't resolve token "${swap.buy}"`);
      }
    }

    if (swap.perTradeMax) {
      const cap = String(swap.perTradeMax).trim();
      if (!USD_AMOUNT_RE.test(cap)) {
        warnings.push(`ignored unparseable per-trade max "${swap.perTradeMax}"`);
      } else if (perTradeMax === undefined) {
        perTradeMax = cap;
      }
    }
  }

  if (haveContract && targets.size && selectors.size) {
    // Contract scope is tracked locally for warnings/labels; CardTerms doesn't have a contract field
    if (perTradeMax !== undefined) draft.perTxMax = perTradeMax;
  }

  for (const u of plan.unsupported ?? []) {
    warnings.push(`not expressible: "${u}"`);
  }

  if (!draft.pay) {
    return { draft: null, labels, warnings: warnings.length ? warnings : ["couldn't turn this request into any card terms"] };
  }

  try {
    validateTerms(draft, now);
  } catch (e) {
    return { draft: null, labels, warnings: [...warnings, `the drafted terms didn't validate: ${e instanceof RefusalError ? e.message : String(e)}`] };
  }

  const seen = new Set<string>();
  const dedupedLabels = labels.filter((l) => {
    const k = l.address.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { draft, labels: dedupedLabels, warnings };
}

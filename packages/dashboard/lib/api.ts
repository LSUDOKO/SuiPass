// SuiPass: Dashboard API client (zkLogin JWT auth)
// Replaces Privy access token with zkLogin JWT from Google OAuth.

import { API_BASE } from "./chain";

const TOKEN_KEY = "suipass_zk_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

const REQUEST_TIMEOUT_MS = 20_000;
const COMPILE_TIMEOUT_MS = 65_000;

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  try {
    return await Promise.race([p, gate]);
  } finally {
    clearTimeout(t);
  }
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const signal = init?.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal,
      headers: {
        authorization: token ? `Bearer ${token}` : "",
        "content-type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error("request timed out");
    }
    throw e;
  }
  let body: { message?: string; error?: string } | null = null;
  try {
    body = (await res.json()) as { message?: string; error?: string } | null;
  } catch {
    if (res.ok) throw new Error("malformed response body");
  }
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? `http ${res.status}`);
  return body as T;
}

export type CardTermsInput = {
  pay?: { period?: { amount: string; seconds: number }; lifetime?: { amount: string } };
  contract?: { targets: string[]; selectors: string[]; tokens?: string[]; perTradeMax?: string };
  expiry?: number;
  maxUses?: number;
  perTxMax?: string;
  merchants?: string[];
  subcards?: boolean;
};

export type CompileLabel = {
  query: string;
  address: string;
  label: string;
  kind: "token" | "protocol" | "verified_contract" | "raw_address";
  source: "registry" | "user_input";
  decimals?: number;
};

export type CompileResult = {
  draft: CardTermsInput | null;
  labels: CompileLabel[];
  warnings: string[];
};

export type CardState = {
  id: string;
  name: string;
  status: string;
  terms: CardTermsInput;
  card_obj_id: string;
  cap_id: string;
  created_at: number;
  parent_card_id?: string;
  remaining_this_period?: string | null;
  remaining_lifetime?: string | null;
  period_resets_at?: number | null;
  expires_at?: number | null;
  uses_remaining?: number | null;
  subcards?: string[];
};

export type Charge = {
  id: string;
  kind: string;
  to: string | null;
  amount: string;
  fee: string;
  status: string;
  tx: string | null;
  memo: string | null;
  at: number;
};

// Re-export types expected by UI components
export type TreeNode = {
  card: CardState;
  children: TreeNode[];
};

export type CardWithCharges = CardState & {
  charges: Charge[];
};

export const api = {
  authStatus: () => call<{ authed: boolean; userId?: string; address?: string; name?: string; email?: string; picture?: string }>("/auth/status"),

  onboard: () =>
    call<{ onboarded: boolean; userId: string; address: string }>("/onboard", {
      method: "POST",
    }),

  oauthRequest: (requestId: string) =>
    call<{ request_id: string; client_name: string | null; redirect_host: string; scope: string | null; expires_at: number }>(
      "/oauth/request/" + encodeURIComponent(requestId),
    ),

  oauthApprove: (requestId: string, cardId: string) =>
    call<{ redirect_to: string }>("/oauth/approve", {
      method: "POST",
      body: JSON.stringify({ request_id: requestId, card_id: cardId }),
    }),

  oauthDeny: (requestId: string) =>
    call<{ redirect_to: string }>("/oauth/deny", {
      method: "POST",
      body: JSON.stringify({ request_id: requestId }),
    }),

  compile: (prompt: string) =>
    call<CompileResult>("/compile", {
      method: "POST",
      body: JSON.stringify({ prompt }),
      signal: timeoutSignal(COMPILE_TIMEOUT_MS),
    }),

  cards: () => call<{ cards: CardState[] }>("/cards"),

  card: (id: string) => call<CardState>("/cards/" + encodeURIComponent(id)),

  cardCharges: (id: string) => call<{ charges: Charge[] }>("/cards/" + encodeURIComponent(id) + "/charges"),

  cardActivity: (id: string) => call<{ activity: { id: string; type: string; data: string; created_at: number }[] }>(
    "/cards/" + encodeURIComponent(id) + "/activity",
  ),

  createCard: (name: string, terms: CardTermsInput) =>
    call<{ card_id: string; secret: string; terms: CardTermsInput; card_obj_id: string }>("/cards", {
      method: "POST",
      body: JSON.stringify({ name, terms }),
    }),

  freeze: (id: string) =>
    call<{ frozen: boolean }>("/cards/" + encodeURIComponent(id) + "/freeze", { method: "POST" }),

  unfreeze: (id: string) =>
    call<{ unfrozen: boolean }>("/cards/" + encodeURIComponent(id) + "/unfreeze", { method: "POST" }),

  revoke: (id: string) =>
    call<{ revoked: boolean }>("/cards/" + encodeURIComponent(id) + "/revoke", { method: "POST" }),

  prepareRevoke: (cardId: string) =>
    call<{ prepare_id: string; delegation: string } | Record<string, never>>("/cards/" + encodeURIComponent(cardId) + "/prepare-revoke"),

  finalizeRevoke: (cardId: string, prepareId: string, signature: string) =>
    call<{ tx: string }>("/cards/" + encodeURIComponent(cardId) + "/finalize-revoke", {
      method: "POST",
      body: JSON.stringify({ prepare_id: prepareId, signature }),
    }),

  deleteCard: (cardId: string) =>
    call<{ deleted: boolean }>("/cards/" + encodeURIComponent(cardId), { method: "DELETE" }),

  nuke: () =>
    call<{ nuked: boolean }>("/nuke", { method: "POST" }),

  balances: () =>
    call<{ sponsor: { address: string; usdc: string; sui: string }; user: { address: string; usdc: string; sui: string } }>("/balances"),

  exportKey: () => {
    const key = prompt("Export your zkLogin key to use elsewhere? This will be available until you sign out.");
    if (key) alert("Key export is a placeholder in this build. Use the dashboard to manage your cards.");
    return Promise.resolve();
  },
};

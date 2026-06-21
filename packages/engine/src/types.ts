// SuiPass: Core domain types (simplified from EVM — no delegation/caveat types)

export type CardState = {
  card_id: string;
  name: string;
  status: "issued" | "active" | "frozen" | "revoked" | "nuked" | "expired";
  terms: import("./terms").CardTerms;
  remaining_this_period: string | null;
  remaining_lifetime: string | null;
  period_resets_at: number | null;
  expires_at: number | null;
  uses_remaining: number | null;
  subcards: string[];
  account: string | null; // the root wallet address
};

export type Receipt = {
  status: "confirmed" | "pending" | "failed" | "settlement_unconfirmed";
  tx: string | null;
  to: string;
  amount: string;
  fee: string;
  remaining_this_period: string | null;
  memo?: string;
};

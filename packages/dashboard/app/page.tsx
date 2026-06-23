"use client";

// SuiPass: zkLogin dashboard — Google OAuth -> card management.
// Replaces the Privy/EIP-7702 flow with zkLogin (simple JWT auth).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api, type CardState, type CardTermsInput, type CompileLabel, type CompileResult, type TreeNode } from "@/lib/api";
import { useRemit } from "./useRemit";
import { Boot } from "./components/Boot";
import { FirstRun } from "./components/FirstRun";
import { Login } from "./components/Login";
import { Tour, type TourStep } from "./components/Tour";
import { Cockpit } from "./components/Shell";
import { Dossier } from "./components/Dossier";
import { ConnectChips, UrlBox } from "./components/Authority";
import { ChipDots, Guilloche, IconClose, isDead, periodLabel, shortHex } from "./components/ui";
import type { FeedRow } from "./components/Activity";

export default function Home() {
  const remit = useRemit();
  const { ready, authenticated, user, address, login, logout } = remit;

  const [onboarded, setOnboarded] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

  // Boot watchdog
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(t);
  }, [ready, authenticated, address, onboarded]);

  // Auto-onboard: if authed, ensure the server knows us
  useEffect(() => {
    if (!authenticated || !address || onboarded || onboarding) return;
    let live = true;
    (async () => {
      try {
        await api.onboard();
        if (live) setOnboarded(true);
      } catch {
        // retry on next render
      }
    })();
    return () => { live = false; };
  }, [authenticated, address, onboarded, onboarding]);

  const gate = !ready
    ? { p: 0.15, note: "Loading" }
    : !authenticated
      ? null
      : !address
        ? { p: 0.45, note: "Verifying session" }
        : !onboarded
          ? { p: 0.75, note: "Finding your cards" }
          : null;
  const gateOpen = gate !== null;
  const [bootDone, setBootDone] = useState(false);
  useEffect(() => {
    if (gateOpen) { setBootDone(false); return; }
    const t = setTimeout(() => setBootDone(true), 600);
    return () => clearTimeout(t);
  }, [gateOpen]);

  const reset = useCallback(async () => {
    try { await logout(); } catch { /* ok */ }
    window.location.reload();
  }, [logout]);

  const screen = !ready ? null : !authenticated ? (
    <Login onLogin={login} />
  ) : (
    <Dashboard remit={remit} address={address ?? ""} onLogout={logout} />
  );

  return (
    <>
      {screen}
      <AnimatePresence>
        {(gate || !bootDone) && (
          <Boot
            key="boot"
            progress={gate ? gate.p : 1}
            note={gate ? gate.note : "Ready"}
            slow={slow && gateOpen}
            onReset={reset}
          />
        )}
      </AnimatePresence>
    </>
  );
}

const TOUR_STEPS: TourStep[] = [
  {
    key: "deck",
    target: "[data-tour=deck]",
    title: "The Deck",
    body: "Each card is a scoped spending authority on Sui. Swipe through the stack.",
  },
  {
    key: "readings",
    target: "[data-tour=readings]",
    title: "The Budget",
    body: "What the card may still spend this period. Enforced on-chain.",
  },
  {
    key: "verbs",
    target: "[data-tour=verbs]",
    title: "The Verbs",
    body: "Connect hands the card to an agent over MCP. Freeze pauses it. Revoke kills it.",
  },
  {
    key: "panes",
    target: "[data-tour=panes]",
    title: "The Ledger",
    body: "Activity is the attributed feed. Sub-Cards is the tree your agents grow.",
  },
  {
    key: "wallet",
    target: "[data-tour=wallet]",
    title: "Your Wallet",
    body: "Your Sui address, USDC balance, and sign out.",
  },
];

function Dashboard({
  remit,
  address,
  onLogout,
}: {
  remit: ReturnType<typeof useRemit>;
  address: string;
  onLogout: () => void;
}) {
  const [cards, setCards] = useState<CardState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [selId, setSelId] = useState<string | null>(null);

  // Auto-select first active card when cards load
  useEffect(() => {
    if (!selId && cards.length > 0) {
      const first = cards.find((c) => !isDead(c.status)) ?? cards[0];
      if (first) setSelId(first.id);
    }
  }, [cards, selId]);

  // Fetch charges for the selected card to populate the activity feed
  useEffect(() => {
    if (!selId) return;
    let live = true;
    (async () => {
      try {
        const { charges } = await api.cardCharges(selId);
        if (!live) return;
        const card = cards.find((c) => c.id === selId);
        const cardName = card?.name ?? "Card";
        setFeed(charges.map((ch) => ({ ch: ch as import("@/lib/api").Charge, cardName })));
      } catch {
        // charges not available yet
      }
    })();
    return () => { live = false; };
  }, [selId, cards]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [touring, setTouring] = useState(false);

  const specimen = useMemo<TreeNode>(
    () => ({
      card: {
        id: "specimen",
        name: "specimen",
        status: "active",
        terms: { pay: { period: { amount: "25", seconds: 604800 } }, subcards: true },
        card_obj_id: "",
        cap_id: "",
        created_at: 0,
        remaining_this_period: "18.40",
        remaining_lifetime: null,
        period_resets_at: Math.floor(Date.now() / 1000) + 4 * 86400 + 7 * 3600,
        expires_at: null,
        uses_remaining: null,
        subcards: [],
      },
      children: [],
    }),
    [],
  );
  const showCards: TreeNode[] = touring && cards.length === 0 ? [specimen] : cards.map((c) => ({ card: c, children: [] }));

  const endTour = useCallback(() => setTouring(false), []);
  const tourIssue = useCallback(() => { setTouring(false); setIssueOpen(true); }, []);

  const heroCard = (selId ? showCards.find((c) => c.card.id === selId) : undefined) ?? showCards.find((c) => !isDead(c.card.status)) ?? showCards[0] ?? null;

  const refresh = useCallback(async () => {
    try {
      const { cards: data } = await api.cards();
      setCards(data);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const frKey = `suipass-firstrun-${address?.toLowerCase()}`;
  const [tourDone, setTourDone] = useState(true);
  useEffect(() => { setTourDone(localStorage.getItem(frKey) === "1"); }, [frKey]);
  const dismissTour = useCallback(() => {
    localStorage.setItem(frKey, "1");
    setTourDone(true);
  }, [frKey]);
  const firstRunOpen = loaded && cards.length === 0 && !tourDone;

  useEffect(() => {
    if (loaded && new URLSearchParams(window.location.search).get("tour") === "1") {
      dismissTour();
      setTouring(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [loaded, dismissTour]);

  return (
    <Cockpit
      remit={remit}
      refresh={refresh}
      onLogout={onLogout}
      address={address}
      nukeable={cards.some((c) => c.status === "active" || c.status === "frozen")}
      aggregate={
        loaded
          ? (() => {
              const active = cards.filter((c) => c.status === "active");
              const totalBudget = active.reduce((sum, c) => sum + (parseFloat(c.terms.pay?.period?.amount ?? c.terms.pay?.lifetime?.amount ?? "0") || 0), 0);
              return totalBudget > 0
                ? `${active.length} card${active.length === 1 ? "" : "s"} · $${totalBudget.toFixed(2)} / wk delegated`
                : `${active.length} card${active.length === 1 ? "" : "s"}`;
            })()
          : undefined
      }
    >
      {error && (
        <p className="err" style={{ margin: "0 8px 10px" }}>API error: {error}</p>
      )}

      <Dossier
        node={heroCard}
        feed={feed}
        remit={remit}
        refresh={refresh}
        roots={showCards}
        currentId={heroCard?.card.id ?? null}
        onSelect={setSelId}
        onIssue={() => setIssueOpen(true)}
        onDeleted={() => { setSelId(null); return refresh(); }}
      />

      {touring && <Tour steps={TOUR_STEPS} onDone={endTour} onIssue={tourIssue} />}

      <AnimatePresence>
        {firstRunOpen && (
          <FirstRun
            address={address}
            onIssue={() => { dismissTour(); setIssueOpen(true); }}
            onExplore={dismissTour}
            onTour={() => { dismissTour(); setTouring(true); }}
          />
        )}
        {issueOpen && (
          <IssueModal
            remit={remit}
            address={address}
            firstCard={cards.length === 0}
            onIssued={refresh}
            onClose={() => setIssueOpen(false)}
          />
        )}
      </AnimatePresence>
    </Cockpit>
  );
}

const PERIODS = [86400, 604800, 2592000];
const periodWord = (s: number) => s <= 86400 ? "a day" : s <= 604800 ? "a week" : "per 30 days";
const closestPeriod = (s: number) => PERIODS.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));

function IssueModal({
  remit,
  address,
  firstCard,
  onIssued,
  onClose,
}: {
  remit: ReturnType<typeof useRemit>;
  address: string;
  firstCard: boolean;
  onIssued: () => void;
  onClose?: () => void;
}) {
  const [name, setName] = useState("Agent Card");
  const [expiryDays, setExpiryDays] = useState(30);
  const [maxUses, setMaxUses] = useState("");
  const [subcards, setSubcards] = useState(true);
  const [amount, setAmount] = useState("25");
  const [period, setPeriod] = useState(604800);
  const [lifetime, setLifetime] = useState("");
  const [perTx, setPerTx] = useState("");
  const [merchants, setMerchants] = useState("");
  const [intent, setIntent] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [compileErr, setCompileErr] = useState<string | null>(null);
  const [labels, setLabels] = useState<CompileLabel[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [draftN, setDraftN] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && onClose) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  function buildTerms(): CardTermsInput {
    const pay = amount.trim() && parseFloat(amount) > 0
      ? { period: { amount: amount.trim(), seconds: period }, ...(lifetime.trim() ? { lifetime: { amount: lifetime.trim() } } : {}) }
      : undefined;
    const uses = parseInt(maxUses, 10);
    return {
      ...(pay ? { pay } : {}),
      expiry: Math.floor(Date.now() / 1000) + expiryDays * 86400,
      subcards,
      ...(Number.isFinite(uses) && uses >= 1 ? { maxUses: uses } : {}),
      ...(perTx.trim() ? { perTxMax: perTx.trim() } : {}),
      ...(merchants.trim() ? { merchants: merchants.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
    };
  }

  function applyDraft(r: CompileResult) {
    const d = r.draft;
    if (!d) return;
    if (d.pay?.period) { setAmount(d.pay.period.amount); setPeriod(closestPeriod(d.pay.period.seconds)); }
    setLifetime(d.pay?.lifetime?.amount ?? "");
    setPerTx(d.perTxMax ?? "");
    setMerchants((d.merchants ?? []).join(", "));
    if (d.expiry) setExpiryDays(Math.max(1, Math.round((d.expiry - Date.now() / 1000) / 86400)));
    setMaxUses(d.maxUses ? String(d.maxUses) : "");
    if (d.subcards !== undefined) setSubcards(d.subcards);
    setDraftN((n) => n + 1);
  }

  async function compile() {
    if (!intent.trim() || compiling) return;
    setCompiling(true); setCompileErr(null); setLabels([]); setWarnings([]);
    try {
      const r = await api.compile(intent.trim());
      setLabels(r.labels); setWarnings(r.warnings);
      if (r.draft) applyDraft(r);
    } catch (e) {
      setCompileErr(e instanceof Error ? e.message : String(e));
    } finally { setCompiling(false); }
  }

  async function issue() {
    setErr(null); setIssuedUrl(null);
    const terms = buildTerms();
    if (!terms.pay && !terms.contract) { setErr("Give the card a budget or scope"); return; }
    setBusy(true);
    try {
      const res = await api.createCard(name, terms);
      setIssuedUrl(remit.getCardUrl(res.secret));
      onIssued();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const drafted = draftN > 0;
  const filled = drafted || editOpen;
  const capLine = [
    amount.trim() && parseFloat(amount) > 0 ? `$${amount.trim()} / ${periodLabel(period)}` : lifetime.trim() ? `$${lifetime.trim()} lifetime` : "",
    merchants.trim() ? `${merchants.split(",").length} merchants` : "Any merchant",
  ].filter(Boolean).join(" · ");

  const chips: string[] = [];
  if (amount.trim() && parseFloat(amount) > 0) chips.push(`$${amount.trim()} ${periodWord(period)}`);
  if (lifetime.trim()) chips.push(`$${lifetime.trim()} lifetime`);
  if (perTx.trim()) chips.push(`≤ $${perTx.trim()} per charge`);
  chips.push(merchants.trim() ? `${merchants.split(",").length} merchants` : "Any merchant");
  chips.push(`Expires ${new Date(Date.now() + expiryDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  chips.push(subcards ? "Sub-cards allowed" : "No sub-cards");

  const field = (label: string, el: React.ReactNode) => (
    <div className="field"><label>{label}</label>{el}</div>
  );

  return (
    <motion.div className="mscrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.18 } }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <motion.div className="modal" role="dialog" aria-modal="true" aria-label="Issue a New Card"
        initial={{ opacity: 0, y: 26, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 360, damping: 30 } }}
        exit={{ opacity: 0, y: 14, scale: 0.98, transition: { duration: 0.16 } }}>
        <div className="mhead">
          <div>
            <div className="mtitle">{firstCard ? "Issue Your First Card" : "Issue a New Card"}</div>
            <div className="msub">Plain language, compiled to card terms · issued on Sui</div>
          </div>
          {onClose && (<button className="closex" onClick={onClose} aria-label="Close"><IconClose /></button>)}
        </div>

        {issuedUrl ? (
          <div style={{ marginTop: 18 }}>
            <div className="ok" style={{ marginBottom: 8 }}>Card issued · hand this URL to your agent:</div>
            <UrlBox url={issuedUrl} testid="issued-url" />
            <ConnectChips url={issuedUrl} cardName={name} />
            <div className="mfoot"><button className="dbtn" onClick={() => onClose?.()}>Done</button></div>
          </div>
        ) : (
          <>
            <textarea className="dtext" value={intent} maxLength={2000} autoFocus disabled={compiling}
              placeholder='Describe the card · "$5 a week for research APIs, expires in 30 days"'
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) compile(); }}
              data-testid="compile-intent" />
            {compiling && <div className="draftbar" role="progressbar"><i /></div>}
            <div className="drow">
              <span className="mhint">{compiling ? "Venice is reading your intent…" : "Venice drafts · you review before issuing"}</span>
              <button className={`dbtn${drafted && !compiling ? " quiet" : ""}`} onClick={compile} disabled={compiling || !intent.trim()} data-testid="compile-go">
                {compiling && <span className="bspin" aria-hidden />}{compiling ? "Drafting…" : "Draft Terms"}
              </button>
            </div>
            {compileErr && <p className="err" style={{ marginTop: 10 }}>{compileErr}</p>}

            <div className="born">
              <div className={`minicard${filled ? " fill" : ""}`}>
                <div className="mc-mark">SuiPass</div>
                <div className="mc-chip"><ChipDots /></div>
                <div className="mc-pan">0x••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••</div>
                <div className="mc-name">{name || "Agent Card"}</div>
                <div className="mc-cap num">{capLine}</div>
                <div className="mc-band"><Guilloche width={520} height={64} strands={9} amp={14} animate={filled || compiling} /></div>
              </div>
              {filled && <TermChips key={`${draftN}-${editOpen}`} items={chips} />}
              {labels.length > 0 && (
                <div className="lblchips" data-testid="compile-labels">
                  {labels.map((l) => (
                    <span key={`${l.address}-${l.label}`} className="lblchip" title={`${l.address} · ${l.source}`}>
                      <i className={`lk ${l.kind}`} />{l.label}<span className="data">{shortHex(l.address)}</span>
                    </span>
                  ))}
                </div>
              )}
              {warnings.length > 0 && (
                <div className="vnotes" data-testid="compile-warnings">
                  <div className="vh">
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                      <path d="M6 1.2 11 10H1z" strokeLinejoin="round" /><path d="M6 4.6v2.6M6 8.9v.1" />
                    </svg>
                    Venice adjusted the draft · review before issuing
                  </div>
                  <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
            </div>

            <button className="ordiv" onClick={() => setEditOpen((v) => !v)}>
              <span>{editOpen ? "Hide the Term Sheet" : "Edit Terms Yourself"}</span>
            </button>

            <AnimatePresence initial={false}>
              {editOpen && (
                <motion.div key="termsheet" initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1, transition: { height: { duration: 0.36, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.28, delay: 0.08 } } }}
                  exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.14 } } }}
                  style={{ overflow: "hidden" }}>
                  <div className={`composer2${draftN ? " flash" : ""}`} key={draftN}>
                    <div className="csec">
                      <div className="cseclbl">Card</div>
                      <div className="csecrow">
                        {field("Name", <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 150 }} data-testid="composer-name" />)}
                        {field("Expires · Days", <input type="number" value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} style={{ width: 72 }} />)}
                        {field("Max Uses", <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" style={{ width: 72 }} data-testid="composer-maxuses" />)}
                        {field("Sub-Cards", <select value={subcards ? "yes" : "no"} onChange={(e) => setSubcards(e.target.value === "yes")} style={{ width: 104 }}>
                          <option value="yes">Allowed</option><option value="no">No</option>
                        </select>)}
                      </div>
                    </div>
                    <div className="csec">
                      <div className="cseclbl">Pay · USDC</div>
                      <div className="csecrow">
                        {field("Budget", <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="None" style={{ width: 92 }} data-testid="composer-amount" />)}
                        {field("Per", <select value={String(period)} onChange={(e) => setPeriod(Number(e.target.value))} style={{ width: 104 }}>
                          <option value="86400">Day</option><option value="604800">Week</option><option value="2592000">30 Days</option>
                        </select>)}
                        {field("Lifetime Cap", <input value={lifetime} onChange={(e) => setLifetime(e.target.value)} placeholder="None" style={{ width: 92 }} />)}
                        {field("Per-Charge Max", <input value={perTx} onChange={(e) => setPerTx(e.target.value)} placeholder="None" style={{ width: 92 }} />)}
                        {field("Merchant Lock", <input value={merchants} onChange={(e) => setMerchants(e.target.value)} placeholder="0x…, 0x…" style={{ width: 170 }} />)}
                      </div>
                    </div>
                    <p className="chint">Leave pay empty for a card that only issues sub-cards</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}

            <div className="mfoot">
              {onClose && <button className="mghost" onClick={onClose}>Cancel</button>}
              <button className="dbtn" onClick={issue} disabled={busy} data-testid="composer-issue">
                {busy ? "Issuing…" : "Issue Card"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function TermChips({ items }: { items: string[] }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { const raf = requestAnimationFrame(() => setArmed(true)); return () => cancelAnimationFrame(raf); }, []);
  return (
    <div className="tchips num">
      {items.map((s, i) => (
        <span key={`${s}-${i}`} className={armed ? "in" : ""} style={{ transitionDelay: armed ? `${120 + i * 110}ms` : "0ms" }}>{s}</span>
      ))}
    </div>
  );
}

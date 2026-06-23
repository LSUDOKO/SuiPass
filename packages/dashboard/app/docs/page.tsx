"use client";

// /docs: the reference, in the house style. A quiet left TOC rail (scroll-spy,
// theme toggle + back-to-app at the foot) beside one prose column. Public route,
// no auth: documentation reads the same signed-in or out. Everything here is
// grounded in the actual engine/server/dashboard code, not aspirational.

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ThemeToggle } from "../components/Theme";
import { IconCheck, IconCopy, copyText } from "../components/ui";

// ---------------------------------------------------------------------------
// Table of contents: grouped into proper sections (drives the nav). The groups
// follow the body's reading order exactly, so the scroll-spy and the clicks
// never jump out of sequence.
// ---------------------------------------------------------------------------

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: "Concepts",
    items: [
      { id: "overview", label: "Overview" },
      { id: "lifecycle", label: "How a Payment Works" },
    ],
  },
  {
    group: "Cards",
    items: [
      { id: "issuing", label: "Issuing a Card" },
      { id: "terms", label: "Card Terms" },
    ],
  },
  {
    group: "Connect",
    items: [
      { id: "connect", label: "Connecting an Agent" },
      { id: "tools", label: "MCP Tools" },
    ],
  },    {
    group: "Advanced",
    items: [
      { id: "execute", label: "Contract Cards" },
      { id: "subcards", label: "Sub-Cards & Revocation" },
    ],
  },
  {
    group: "Demo",
    items: [
      { id: "gallery", label: "Demo Gallery" },
    ],
  },
  {
    group: "Operate",
    items: [
      { id: "rails", label: "Payment Rails" },
      { id: "security", label: "Security" },
    ],
  },
  {
    group: "Reference",
    items: [
      { id: "api", label: "API Reference" },
      { id: "selfhost", label: "Self-Hosting" },
      { id: "cookoff", label: "The Hackathon" },
    ],
  },
];
const FLAT = NAV.flatMap((g) => g.items);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Code({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="doccode">
      <pre>{code}</pre>
      <button
        className={`doccopy${done ? " done" : ""}`}
        aria-label="Copy to clipboard"
        title="Copy"
        onClick={async () => {
          if (await copyText(code)) {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }
        }}
      >
        {done ? <IconCheck /> : <IconCopy />}
      </button>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="doctablewrap">
      <table className="doctable">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`docnote${warn ? " warn" : ""}`}>
      <span className="ni" aria-hidden>
        {warn ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.6 15 13.5H1z" />
            <path d="M8 6.2v3.6M8 11.6v.1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.6" />
            <path d="M8 7.4v4M8 4.7v.1" />
          </svg>
        )}
      </span>
      <p>{children}</p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="docsec" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const [active, setActive] = useState(FLAT[0].id);

  // scroll-spy: highlight the section whose top sits in the upper band of the viewport
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-12% 0px -72% 0px", threshold: 0 },
    );
    for (const s of FLAT) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <div className="docs">
      {/* the aurora: subtle page weather behind the chrome */}
      <div className="docaurora" aria-hidden>
        <i className="docbeamA" />
        <i className="docbeamB" />
        <i className="docbeamC" />
      </div>
      <aside className="docnav">
        <Link className="brand" href="/">
          SuiPass
        </Link>
        <span className="docnavlabel">Documentation</span>
        <nav className="docnavlist">
          {NAV.map((g) => (
            <Fragment key={g.group}>
              <div className="docnavgroup">{g.group}</div>
              {g.items.map((s) => (
                <a key={s.id} className={`docnavitem${active === s.id ? " on" : ""}`} href={`#${s.id}`}>
                  {s.label}
                </a>
              ))}
            </Fragment>
          ))}
        </nav>
        <div className="docnavfoot">
          <ThemeToggle />
          <Link className="docback" href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span>Open the App</span>
          </Link>
        </div>
      </aside>

      <main className="docbody">
        <div className="docwrap">
          {/* hero */}
          <header className="dochero">
            <span className="doceyebrow">The agentic card</span>
            <h1>Documentation</h1>
            <p className="docsub">
              SuiPass issues scoped, revocable spending cards from your Sui wallet. Any agent plugs one in over MCP and
              pays within your limits, holding no keys and no funds, dead the moment you revoke. Here is how it
              works, end to end.
            </p>
          </header>

          {/* ---- Overview ---- */}
          <Section id="overview" title="Overview">
            <p className="docp">
              Agents need to spend money. Handing an agent your private key is reckless; funding a standalone agent
              wallet loses both your custody and your limits. SuiPass takes the model the card industry settled on
              decades ago and applies it to agents: the wallet stays the account, and the agent gets a <b>card</b>,
              a scoped authority to draw from it.
            </p>
            <ul className="docul">
              <li className="docli">
                <b>Your wallet is the account.</b> Funds never leave it until the moment of payment.
              </li>
              <li className="docli">
                <b>The card is a Sui Move object.</b> A <code>Card</code> object on Sui testnet, holding its terms on-chain as
                dynamic fields, governed by a <code>CardCap</code> capability that only your wallet can exercise to spend or revoke.
              </li>
              <li className="docli">
                <b>The agent holds the card, not the money.</b> What the agent gets is an MCP endpoint URL. Behind
                it, the card can spend only what its terms allow, using a dedicated agent key that holds nothing.
              </li>
              <li className="docli">
                <b>Revoke kills it instantly.</b> Freeze or revoke a card (or its whole sub-card tree) and every
                payment stops, server-side immediately and on-chain underneath.
              </li>
            </ul>

            <div className="docdiagram">
              {`your wallet  `}<span className="mut">(zkLogin Sui address via Google OAuth)</span>{`\n   └── `}<b>card</b>{`   `}<span className="mut">$25 / week · expires Jul 6</span>{`        ← Card object on Sui testnet\n        ├── agent A plugs it in over MCP\n        └── `}<b>sub-card</b>{`   `}<span className="mut">$1 / week · one merchant</span>{`   ← narrower Card object\n             └── sub-agent B plugs it in`}
            </div>

            <p className="docp">
              SuiPass runs on <b>Sui testnet</b> with testnet USDC. Gas on every transaction is sponsored by the
              SuiPass GasSponsor server — agents never need SUI tokens to spend.
            </p>

            <div className="docfacts">
              <div className="docfact">
                <div className="fk">Dashboard</div>
                <div className="fv">
                  <a href="https://suipass-server.onrender.com" target="_blank" rel="noreferrer">
                    suipass-server.onrender.com
                  </a>
                </div>
              </div>
              <div className="docfact">
                <div className="fk">API + MCP</div>
                <div className="fv">
                  <a href="https://suipass-server.onrender.com" target="_blank" rel="noreferrer">
                    suipass-server.onrender.com
                  </a>
                </div>
              </div>
              <div className="docfact">
                <div className="fk">Move contract</div>
                <div className="fv">
                  <code>packages/engine/sui/sources/card.move</code>
                </div>
              </div>
            </div>
          </Section>

          {/* ---- Lifecycle ---- */}
          <Section id="lifecycle" title="How a Payment Works">
            <ul className="docul">
              <li className="docli">
                You sign in to the dashboard via <b>zkLogin</b> (Google OAuth). Sui derives a dedicated wallet address
                from your Google identity — no seed phrases, no browser extension.
              </li>
              <li className="docli">
                You issue a card with terms, set by hand in the composer or drafted from plain language by the Venice-powered compiler.
                The terms are compiled into a <b>Sui Move Programmable Transaction Block (PTB)</b> that creates a <code>Card</code>
                object on-chain.
              </li>
              <li className="docli">
                The server stores the card alongside a fresh agent key that holds nothing. The card object on Sui tracks
                the remaining budget, usage count, and expiry natively.
              </li>
              <li className="docli">
                You hand the card URL to any agent (one <code>claude mcp add</code>, a Cursor deeplink, a pasted
                connector URL).
              </li>
              <li className="docli">
                When the agent calls <code>pay</code>, the server builds a PTB that transfers USDC from your wallet,
                validates the card's terms on-chain through the Move module, and submits it through the <b>GasSponsor</b>:
                gasless for the agent, settled in USDC from your wallet.
              </li>
              <li className="docli">
                Every charge lands in the card's ledger with memo, gas fee, and transaction digest, attributed to the agent
                key that spent it. Receipts are optionally stored on <b>Walrus</b> for verifiable, persistent audit trails.
              </li>
            </ul>
            <Note>
              The agent never sees a private key, never holds a balance, never needs SUI. Every transaction is sponsored
              by the GasSponsor server, which validates the card terms before signing. The first spend deploys nothing;
              your zkLogin wallet exists on Sui the moment Google signs your OAuth token.
            </Note>
          </Section>

          {/* ---- Issuing ---- */}
          <Section id="issuing" title="Issuing a Card">
            <p className="docp">
              A card is born from a <code>CardTerms</code> object: a <code>pay</code> budget, a <code>contract</code>
              scope, or both, plus lifecycle limits (expiry, max uses, per-charge cap, merchant lock, sub-cards
              on/off). You can write the terms by hand in the composer, or describe the card in plain language and let
              the compiler draft them.
            </p>
            <h3>The plain-language compiler</h3>
            <p className="docp">
              The dashboard's issue modal sends your sentence to Venice AI, which returns a plan of named
              entities ("USDC", "DeepBook", "SuiNS") and numbers. The server then
              resolves every name against its own verified registry (or Suiscan, or your own pasted address), so the
              model output can never place a raw address into a draft. The result is a <code>CardTerms</code> draft
              you review and sign; nothing is issued until you do.
            </p>
            <Note>
              The compiler only <b>names</b> tokens, protocols and merchants. Addresses come exclusively from the
              trusted resolvers or your own input, with provenance shown on each chip (registry, Suiscan, or your
              input). A draft cannot smuggle a poisoned address even if the model tries.
            </Note>
            <h3>The PTB issuance ceremony</h3>
            <p className="docp">
              Issuance is a three-step prepare / sign / finalize flow:
            </p>
            <ul className="docul">
              <li className="docli">
                <b>prepare</b>: the server serializes the card terms, generates the agent key, and returns the unsigned
                PTB that will create the <code>Card</code> object on Sui.
              </li>
              <li className="docli">
                <b>sign</b>: your zkLogin wallet (via Enoki) signs the PTB in the browser through the Sui dApp Kit.
              </li>
              <li className="docli">
                <b>finalize</b>: the server submits the signed PTB through the GasSponsor, the <code>Card</code> object
                is created on-chain, and the server persists the card and returns its URL.
              </li>
            </ul>
          </Section>

          {/* ---- Terms ---- */}
          <Section id="terms" title="Card Terms">
            <p className="docp">
              Each term maps to a constraint enforced by the Sui Move <code>card</code> module at spend time.
              The Move module validates every condition on-chain before releasing USDC from the card's
              designated wallet.
            </p>
            <Table
              head={["Term", "Meaning", "Move Enforcer"]}
              rows={[
                [
                  <code key="a">pay.period</code>,
                  "Budget per rolling window (amount + seconds, min 60s)",
                  <code key="b">check_period_limit</code>,
                ],
                [<code key="a">pay.lifetime</code>, "Total USDC the card may ever move", <code key="b">check_lifetime_limit</code>],
                [<code key="a">contract.targets</code>, "Move packages the card may call", <code key="b">AllowedTargets</code>],
                [<code key="a">contract.selectors</code>, "Function signatures the card may call", <code key="b">AllowedFunctions</code>],
                [<code key="a">expiry</code>, "Unix time after which nothing spends", <code key="b">check_expiry</code>],
                [
                  <code key="a">maxUses</code>,
                  "Redemption count (server is the binding limit; on-chain count is backstop)",
                  <code key="b">check_usage_count</code>,
                ],
                [
                  "revocation flag",
                  "Always present; flipping it nukes every card from this wallet",
                  <span><code key="b">revoked</code> field on Card</span>,
                ],
                [
                  "pay + contract",
                  "A composite card; one group governs each redemption",
                  <span><code key="b">composite</code> mode</span>,
                ],
              ]}
            />
            <Note>
              <b>perTxMax</b> and <b>merchants</b> are not on-chain constraints; they are server-side carve policy
              applied at redemption. The per-transaction max is enforced by the amount argument passed to the
              <code>spend</code> PTB, while the merchant allowlist is enforced server-side before the PTB is built.
              <b>contract.tokens</b> and <b>contract.perTradeMax</b> additionally pin each token approval to an exact
              spender and amount via the Move module's scope check.
            </Note>
          </Section>

          {/* ---- Connect ---- */}
          <Section id="connect" title="Connecting an Agent">
            <p className="docp">
              The card is served over MCP (Streamable HTTP). There are three connection lanes. The first two carry a
              per-card credential directly; the third is OAuth, where the agent never holds the card secret.
            </p>
            <div className="doclanes">
              <div className="doclane">
                <div className="doclanehd">
                  <span className="lanek">A</span>
                  <span className="lt">Secret in the URL path</span>
                </div>
                <p>
                  Works everywhere, including credential-free clients like claude.ai web. The URL is the password,
                  treat it like one.
                </p>
                <Code code={`claude mcp add --transport http SuiPass \\\\
  https://<host>/c/<card-secret>/mcp`} />
              </div>
              <div className="doclane">
                <div className="doclanehd">
                  <span className="lanek">B</span>
                  <span className="lt">Bearer header</span>
                </div>
                <p>For clients that send an Authorization header. The bare endpoint, secret in the header.</p>
                <Code code={`claude mcp add --transport http SuiPass \\\\
  https://<host>/mcp \\\\
  --header "Authorization: Bearer <card-secret>"`} />
              </div>
              <div className="doclane">
                <div className="doclanehd">
                  <span className="lanek">C</span>
                  <span className="lt">OAuth 2.1 (card-picker consent)</span>
                </div>
                <p>
                  Add the bare endpoint with no credential. The client discovers the OAuth lane (RFC 9728 metadata on
                  the 401), registers itself (dynamic client registration), and opens a browser; you sign in and pick
                  which card to grant. The agent receives a short-lived, card-scoped, independently revocable token,
                  never the raw secret. This is the lane OAuth-only clients such as ChatGPT require. Clients that
                  finish OAuth out of band read the code off the consent screen.
                </p>
                <Code code={`claude mcp add --transport http SuiPass https://<host>/mcp`} />
              </div>
            </div>

            <h3>Per-harness one-liners (Lane A)</h3>
            <Code code={`codex     mcp add SuiPass --url https://<host>/c/<secret>/mcp
openclaw  mcp add SuiPass --url https://<host>/c/<secret>/mcp --transport streamable-http
hermes    mcp add SuiPass --url "https://<host>/c/<secret>/mcp"
gemini    mcp add -t http SuiPass https://<host>/c/<secret>/mcp
goose     session --with-streamable-http-extension "https://<host>/c/<secret>/mcp"
amp       mcp add SuiPass https://<host>/c/<secret>/mcp
droid     mcp add SuiPass https://<host>/c/<secret>/mcp --type http`} />
            <p className="docp">
              Lanes A and B work in Cursor, VS Code, Gemini CLI, Windsurf, claude.ai custom connectors, or any MCP
              client that speaks Streamable HTTP. For claude.ai web, paste the card URL under Customize → Connectors →
              Add custom connector; for ChatGPT Developer Mode, add it as a No Authentication connector (or use Lane C
              for a real auth story). The dashboard's connect panel renders a prefilled install affordance per
              harness. Rotate the secret any time from the dashboard; the old URL dies instantly.
            </p>
          </Section>

          {/* ---- Tools ---- */}
          <Section id="tools" title="MCP Tools">
            <p className="docp">
              The tool list a card exposes <b>is</b> its permission surface: a pay-only card never sees
              <code>execute</code>; a contract-only card never sees <code>pay</code>; a sub-cards-off card never sees
              <code>issue_subcard</code>. The server is stateless, a fresh instance per request, identity = the card
              credential.
            </p>
            <Table
              head={["Tool", "On", "Purpose"]}
              rows={[
                [<code key="t">card</code>, "Every card", "Live state: remaining budget, terms, expiry, recent charges, sub-cards, and the card's on-chain address (the zkLogin wallet that holds the USDC and authorizes spends). Call it first."],
                [<code key="t">pay</code>, "pay cards", "Send USDC on Sui testnet within limits; blocks until confirmed on-chain. Gas sponsored by the GasSponsor."],
                [<code key="t">paid_fetch</code>, "pay cards", "Fetch a URL; on HTTP 402 (x402), pay automatically and return the content."],

                [<code key="t">execute</code>, "contract cards", "Call scoped Move functions on Sui packages (stake, mint, transfer) or route a DeepBook V3 swap atomically in one PTB. Supports swap_exact_quote_for_base (sell USDC, buy SUI) and swap_exact_base_for_quote (sell SUI, buy USDC)."],
                [<code key="t">issue_subcard</code>, "sub-cards on", "Mint a tighter child card for a sub-agent; omitted money terms inherit the parent's remaining budget; returns its URL."],
                [<code key="t">revoke_subcard</code>, "sub-cards on", "Instantly kill a sub-card and its descendants (server-side)."],
              ]}
            />
            <h3>Typed refusals</h3>
            <p className="docp">
              Refusals come back as <code>isError</code> with structured JSON naming the violated term, so an agent
              can relay them honestly instead of guessing. The codes include:
            </p>
            <ul className="docul">
              <li className="docli">
                <code>over_period_limit</code>, <code>merchant_not_allowed</code>, <code>price_exceeds_max</code> (pay
                and paid_fetch)
              </li>
              <li className="docli">
                <code>target_not_allowed</code>, <code>method_not_allowed</code>, <code>per_trade_exceeded</code>,
                <code>token_not_allowed</code>, <code>spender_not_allowed</code> (execute)
              </li>
              <li className="docli">
                <code>exceeds_parent_terms</code> (issue_subcard); <code>not_your_subcard</code> (revoke_subcard)
              </li>
              <li className="docli">
                <code>card_frozen</code>, <code>insufficient_balance</code>; <code>invalid_terms</code> (bad
                input)
              </li>
            </ul>
          </Section>

          {/* ---- Execute / contract cards ---- */}
          <Section id="execute" title="Contract Cards">
            <p className="docp">
              A card can be scoped to specific Move package targets and function selectors instead of (or alongside) a USDC
              budget. The agent calls <code>execute</code> with a target package ID, function name, and arguments.
            </p>
            <ul className="docul">
              <li className="docli">
                Targets and selectors outside the card's declared scope are refused before anything reaches the
                chain; the Move module's scope check validates the same boundaries at execution.
              </li>
              <li className="docli">
                Function signatures are normalized to canonical form so the PTB builder, the selector check, and the
                on-chain enforcer all agree.
              </li>
              <li className="docli">
                A contract card can carry an <b>allowance token list</b> (<code>contract.tokens</code>: the only
                Sui coins it may approve for transfer) and a <b>per-trade ceiling</b>
                (<code>contract.perTradeMax</code>, capping each USDC approval).
              </li>
              <li className="docli">
                For a call that needs a recipient (e.g. a swap output), the <code>card</code> tool surfaces the card's
                on-chain wallet address so the agent routes output there.
              </li>
              <li className="docli">
                Up to 5 calls batch atomically into one PTB. Each call is checked against the card's scope before the
                PTB is submitted.
              </li>
            </ul>
            <Note>
              Contract calls are not USDC-metered. Safety on a contract card is the target/function allowlist plus
              <code>maxUses</code> and <code>expiry</code>. Pair contract scope with a <code>pay</code> cap in one
              composite card when you want both rails under one delegation.
            </Note>
          </Section>

          {/* ---- Sub-cards & revocation ---- */}
          <Section id="subcards" title="Sub-Cards & Revocation">
            <p className="docp">
              Sub-cards are narrower <code>Card</code> objects created from an existing card. An agent holding a card
              can mint a tighter child for a sub-agent with <code>issue_subcard</code>; every term must fit inside the
              parent's (caps only narrow downward, contract scope is subset-only, never silently inherited).
              <code>exceeds_parent_terms</code> names the violating field. The Move module enforces the same subset
              constraint.
            </p>
            <h3>Three layers of off-switch</h3>
            <Table
              head={["Layer", "Effect", "Where"]}
              rows={[
                ["Freeze", "Reversible pause; the card still answers card but refuses spends", "Server-side, instant"],
                ["Revoke", "Permanent; the card and its whole sub-card subtree die", "On-chain via Move module, signed by your zkLogin wallet"],
                ["Nuke", "Kills every card and sub-card this wallet ever issued", "One revocation flag on the root address"],
              ]}
            />
            <p className="docp">
              All three are user-operable from the dashboard. On-chain revoke and nuke are signed by your zkLogin
              wallet in the browser and ride the GasSponsor. Revoking a parent kills the subtree; the cascade is the
              demo money-shot — revoke the root and the whole tree dies on screen.
            </p>
            <Note>
              An agent's own <code>revoke_subcard</code> is a server-side kill: instant, and the sub-card's URL dies.
              On-chain permanence for a whole branch comes from revoking the root card or nuking.
            </Note>
          </Section>

          {/* ---- Rails ---- */}
          <Section id="rails" title="Payment Rails">
            <p className="docp">Two payment methods run through the same card, metered by the same terms.</p>
            <h3>USDC on Sui (live, on testnet)</h3>
            <p className="docp">
              <code>pay</code> builds a PTB that transfers testnet USDC from your wallet through the card's
              validation. Every spend is:
            </p>
            <ul className="docul">
              <li className="docli"><b>Checked on-chain</b> — the Move module validates period limits, lifetime budget, expiry, and usage count before releasing funds.</li>
              <li className="docli"><b>Gas-sponsored</b> — the GasSponsor server covers the SUI gas fee, so agents never need native tokens.</li>
              <li className="docli"><b>Receipted</b> — each charge is logged with memo, fee, and transaction digest; optionally stored on Walrus for verifiable audit.</li>
            </ul>
            <h3>DeepBook V3 Swap (Live, Testnet)</h3>
            <p className="docp">
              The <code>execute</code> tool routes USDC through <b>DeepBook V3</b> (Sui's native CLOB DEX) to exchange
              for another token, all within the card's budget. The PTB calls the pool module's
              <code>swap_exact_quote_for_base</code> or <code>swap_exact_base_for_quote</code> function atomically in
              one transaction. DeepBook V3 pool IDs and coin types are pulled from the
              <code>@mysten/deepbook-v3</code> SDK's canonical testnet constants.
            </p>
            <p className="docp">
              Swaps execute atomically within the card's budget — the <code>execute</code> tool validates the swap
              against the card's terms (per-tx cap, period budget, expiry) before broadcasting. The DeepBook V3 CLOB
              integration supports zero-slippage limit orders through the pool module's core swap functions.
            </p>
            <Table
              head={["Pool", "Pool ID", "Pair", "Explorer"]}
              rows={[
                [<code key="d1">SUI_DBUSDC</code>, <code key="v1">0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5</code>, "SUI / DBUSDC", <a key="e1" href="https://suiscan.xyz/testnet/object/0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5" target="_blank" rel="noreferrer">Suiscan</a>],
                [<code key="d2">DEEP_SUI</code>, <code key="v2">0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f</code>, "DEEP / SUI", <a key="e2" href="https://suiscan.xyz/testnet/object/0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f" target="_blank" rel="noreferrer">Suiscan</a>],
                [<code key="d3">DEEP_DBUSDC</code>, <code key="v3">0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622</code>, "DEEP / DBUSDC", <a key="e3" href="https://suiscan.xyz/testnet/object/0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622" target="_blank" rel="noreferrer">Suiscan</a>],
              ]}
            />
            <p className="docp">
              DEEP fee is optional — the swap works with <code>deepAmount: 0</code> (no DEEP tokens needed). When the
              sponsor has no DEEP, the PTB builder creates a zero-balance <code>Coin&lt;DEEP&gt;</code> on-chain via
              <code>coinWithBalance</code>, which the pool accepts. The DEEP coin type on testnet is
              <code>0xdeeb7a4662eec9f2e3f1a1c6a35d9f11e7e4e7a::deep::DEEP</code>.
            </p>
            <h3>Walrus Receipt Storage (Live, Testnet)</h3>
            <p className="docp">
              Every card payment, swap, and <code>x402</code> transaction generates an on-chain <code>ChargeLog</code>
              object containing the amount, fee, recipient, memo, and transaction digest. These logs are optionally
              persisted to <b>Walrus</b>, Sui's verifiable data platform, for permanent, cross-agent audit trails.
            </p>
            <p className="docp"><b>How it works:</b></p>
            <ol className="docul">
              <li className="docli">After a successful <code>spend()</code> or <code>execute()</code> transaction, the server creates a <code>ChargeLog</code> on-chain via the Move module's <code>log_charge</code> function.</li>
              <li className="docli">The charge memo and metadata are encrypted and pushed to a Walrus publisher endpoint as a content-addressed blob via <code>PUT $PUBLISHER/v1/blobs</code>.</li>
              <li className="docli">The blob ID is returned as part of the charge receipt, allowing any agent with the ID to retrieve and verify the receipt via <code>GET $AGGREGATOR/v1/blobs/&lt;id&gt;</code>.</li>
              <li className="docli">Receipts persist across Walrus storage epochs, surviving server restarts and database resets.</li>
            </ol>
            <Table
              head={["Capability", "Description"]}
              rows={[
                ["Content-addressed", "Each receipt is stored by its cryptographic blob ID — tamper-evident by construction"],
                ["Cross-agent memory", "A sub-agent can read receipts from the parent's blob store for audit continuity"],
                ["Encrypted memos", "Charge memos are encrypted before storage; only holders of the card secret can decrypt"],
                ["Deletable blobs", "Receipts are stored as deletable blobs with 5-epoch duration, matching the testnet's epoch cycle"],
                ["No extra gas", "Receipt storage is off-chain — the Walrus publisher call happens after the Sui transaction confirms"],
              ]}
            />
            <Note warn>
              All transactions run on <b>Sui testnet</b> with testnet USDC. No real money moves. Deploying to mainnet
              requires the Move contract to be re-published with a mainnet USDC package ID.
            </Note>
          </Section>

          {/* ---- Demo Gallery ---- */}
          <Section id="gallery" title="Demo Gallery">
            <p className="docp">
              See SuiPass in action — AI agents connecting via MCP, checking card balances, purchasing premium data
              through the x402 paywall, and receiving on-chain receipts.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", marginTop: 24, marginBottom: 24 }}>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231424.png" alt="Claude connecting to SuiPass MCP" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>Claude Desktop connected to SuiPass via the card MCP URL</p>
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231425.png" alt="Claude checking card status" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>Agent calls the <code>card</code> tool — remaining budget, account, expiry</p>
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231445.png" alt="Claude executing paid_fetch" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>Agent runs <code>paid_fetch</code> — pays $0.50 USDC on Sui testnet</p>
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231508.png" alt="Claude showing premium data" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>Premium data returned — 1.2M row AI Training Dataset</p>
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231528.png" alt="Claude buying market data" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>Agent purchases $1.00 Real-time Market Data Feed</p>
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231530.png" alt="Claude market data response" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>Market data — SUI/USDC $2.8471, volume $12.45M, TVL $8.92M</p>
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231645.png" alt="Claude budget after purchases" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>Agent re-checks balance — $1.50 spent, remaining budget</p>
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 280, textAlign: "center" }}>
                <img src="/images/swappy-20260622-231646.png" alt="Claude transaction receipts" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--float)" }} />
                <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 8 }}>On-chain receipts — tx digest, amount, fee, and memo</p>
              </div>
            </div>

            <p className="docp"><b>The full end-to-end flow:</b></p>
            <ol className="docul">
              <li className="docli"><b>Connect</b> — Claude Desktop connects to the card via MCP Streamable HTTP</li>
              <li className="docli"><b>Check</b> — Agent reads card status, budget, expiry, and on-chain account address</li>
              <li className="docli"><b>Pay</b> — Agent fetches premium data → 402 → automatic $0.50 USDC payment → content unlocked</li>
              <li className="docli"><b>Repeat</b> — Second $1.00 purchase for market data feed, budget decreases in real time</li>
              <li className="docli"><b>Verify</b> — All transactions are gas-sponsored, on-chain, and receipted</li>
            </ol>
          </Section>

          {/* ---- Security ---- */}
          <Section id="security" title="Security">
            <ul className="docul">
              <li className="docli">
                <b>Custody.</b> Your funds stay in your zkLogin wallet — derived from your Google OAuth identity,
                secured by Google's infrastructure. The per-card agent key signs PTBs only; it holds no assets and is
                encrypted at rest.
              </li>
              <li className="docli">
                <b>Dashboard auth.</b> zkLogin via Enoki (Mysten Labs). Google OAuth token is verified server-side;
                the derived wallet address is bound to that login session. Every card route is scoped to the
                authenticated user's own cards.
              </li>
              <li className="docli">
                <b>Issuance integrity.</b> The server verifies the PTB signature recovers to the expected zkLogin
                address before persisting a card.
              </li>
              <li className="docli">
                <b>Card secrets.</b> 256-bit, stored as a hash for auth and AES-256-GCM-encrypted at rest for the
                reveal/rotate feature. The URL is a credential; rotate it like a password.
              </li>
              <li className="docli">
                <b>Limits enforced twice.</b> Server-side at call time (typed refusals) and on-chain at spend time
                via the Move module's enforcer functions. Period, lifetime, expiry, and usage count have dedicated
                Move checks; the per-transaction max and merchant allowlist are server-side policy.
              </li>
              <li className="docli">
                <b>MCP surface hardening.</b> Host allowlist (DNS-rebinding guard), per-card and bad-secret rate
                limits, a 1 MiB body cap, an SSRF guard on <code>paid_fetch</code> targets, secrets never echoed in
                errors or logs.
              </li>
              <li className="docli">
                <b>OAuth tokens.</b> Opaque, card-scoped, hash-stored beside the card secrets, audience-pinned (RFC
                8707), and revoked the instant the card is, cascading to the subtree.
              </li>
              <li className="docli">
                <b>Sui object model.</b> Cards are Sui objects owned by your wallet. The <code>CardCap</code>
                capability pattern ensures only your wallet can spend or revoke — no other entity, not even the
                SuiPass server, can move your funds.
              </li>
            </ul>
          </Section>

          {/* ---- API reference ---- */}
          <Section id="api" title="API Reference">
            <p className="docp">
              The server is one Hono process. The dashboard API lives under <code>/api</code>; the MCP endpoint,
              OAuth lane, and demo surfaces sit at the root.
            </p>
            <h3>Auth lanes (every /api route)</h3>
            <ul className="docul">
              <li className="docli">
                <b>Admin</b> (<code>Authorization: Bearer &lt;REMIT_ADMIN_TOKEN&gt;</code>): full access, server-side
                scripts only, never shipped to a browser.
              </li>
              <li className="docli">
                <b>zkLogin</b> (<code>Authorization: Bearer &lt;Google OAuth token&gt;</code>): verified server-side
                via Enoki; every route scoped to the authenticated user.
              </li>
            </ul>
            <h3>Dashboard API (/api)</h3>
            <Table
              head={["Method · Path", "Purpose"]}
              rows={[
                [<code key="p">POST /onboard</code>, "Register the zkLogin wallet + bind it to the user session"],
                [<code key="p">POST /cards/prepare</code>, "Serialize card terms, generate the agent key, return the unsigned PTB"],
                [<code key="p">POST /cards/finalize</code>, "Attach the browser signature, submit the PTB to Sui, persist the card"],
                [<code key="p">POST /cards/compile</code>, "Venice NL → draft CardTerms (never issues)"],
                [<code key="p">GET /cards</code>, "List the user's cards"],
                [<code key="p">GET /cards/:id</code>, "Card detail + charge ledger"],
                [<code key="p">GET /tree</code>, "The card → sub-card tree"],
                [<code key="p">GET /cards/:id/url</code>, "Reveal the card URL"],
                [<code key="p">POST /cards/:id/rotate</code>, "Rotate the card secret (old URL dies)"],
                [<code key="p">POST /cards/:id/freeze · /unfreeze</code>, "Reversible server-side pause / resume"],
                [<code key="p">POST /cards/:id/revoke/prepare · /finalize</code>, "Client-signed on-chain revoke (sub-cards die server-side)"],
                [<code key="p">POST /nuke/prepare · /finalize</code>, "Client-signed cascade nuke of every card"],
                [<code key="p">DELETE /cards/:id</code>, "Bookkeeping removal of a dead card + its subtree"],
                [<code key="p">GET /oauth/request · POST /oauth/approve · /deny</code>, "The card-picker consent backend"],
              ]}
            />
            <h3>OAuth 2.1 (self-hosted authorization server)</h3>
            <p className="docp">
              Public clients, PKCE S256, auth-code + rotating refresh, dynamic client registration. Tokens are opaque
              (<code>rmt_at_</code> access, <code>rmt_rt_</code> refresh), audience-pinned, and die with the card.
            </p>
            <Table
              head={["Endpoint", "Spec"]}
              rows={[
                [<code key="o">GET /.well-known/oauth-protected-resource/mcp</code>, "RFC 9728 protected-resource metadata"],
                [<code key="o">GET /.well-known/oauth-authorization-server</code>, "RFC 8414 AS metadata"],
                [<code key="o">POST /register</code>, "RFC 7591 dynamic client registration"],
                [<code key="o">GET /authorize</code>, "Validates, then 302s to the dashboard card-picker"],
                [<code key="o">POST /token</code>, "authorization_code + refresh_token grants, PKCE S256"],
                [<code key="o">POST /revoke</code>, "RFC 7009 revocation (kills the whole token family)"],
              ]}
            />
            <h3>MCP + demo</h3>
            <Table
              head={["Endpoint", "Purpose"]}
              rows={[
                [<code key="m">ALL /c/:secret/mcp</code>, "Lane A: secret in the path"],
                [<code key="m">ALL /mcp</code>, "Lane B (bearer) + Lane C (OAuth token)"],
                [<code key="m">GET /health</code>, "Liveness + engine version"],
              ]}
            />
          </Section>

          {/* ---- Self-hosting ---- */}
          <Section id="selfhost" title="Self-Hosting">
            <p className="docp">
              A Bun monorepo, three packages: <code>engine</code> (the Sui Move contract + PTB builder), <code>server</code> (Hono:
              REST + MCP + OAuth) and <code>dashboard</code> (Next.js). Money moves on Sui testnet.
            </p>
            <Code code={`bun install
cp .env.example .env          # then set the required vars below

bun dev                       # server on :4070
bun run --cwd packages/dashboard dev   # dashboard on :4071`} />
            <h3>Required environment</h3>
            <Table
              head={["Var", "Purpose"]}
              rows={[
                [<code key="e">REMIT_MASTER_KEY</code>, "32-byte hex key; encrypts agent keys + card secrets at rest"],
                [<code key="e">REMIT_ADMIN_TOKEN</code>, "Ops bearer token for the management API (server-side only)"],
                [<code key="e">REMIT_GAS_SPONSOR_SECRET</code>, "Private key for the GasSponsor that covers SUI gas fees"],
                [<code key="e">REMIT_SUI_PACKAGE_ID</code>, "Published Move package ID on Sui testnet"],
              ]}
            />
            <h3>Common optional environment</h3>
            <Table
              head={["Var", "Purpose"]}
              rows={[
                [<code key="e">REMIT_PUBLIC_MCP_BASE</code>, "Public origin for card URLs (also arms the MCP Host allowlist)"],
                [<code key="e">REMIT_CORS_ORIGINS</code>, "Comma-separated allowed origins for the API"],
                [<code key="e">ENOKI_API_KEY</code>, "Mysten Enoki API key for zkLogin and gas sponsorship"],
                [<code key="e">GOOGLE_CLIENT_ID</code>, "Google OAuth Client ID for zkLogin"],
                [<code key="e">VENICE_API_KEY · VENICE_MODEL</code>, "Enables /cards/compile; pin the model id"],
                [<code key="e">REMIT_DASHBOARD_BASE</code>, "Dashboard origin hosting the OAuth consent page"],
                [<code key="e">REMIT_SUI_RPC_URL</code>, "Sui RPC URL (default testnet.sui.io)"],
                [<code key="e">REMIT_DB_PATH</code>, "SQLite path (default .dev/suipass.sqlite)"],
                [<code key="e">REMIT_ALLOWED_HOSTS</code>, "Extra Host headers accepted on the MCP endpoint"],
                [<code key="e">SUISCAN_API_KEY</code>, "Labels from Suiscan when resolving compiled drafts"],
                [<code key="e">REMIT_TRUST_PROXY_HOPS</code>, "Trusted proxy hops for client-IP rate limiting"],
                [<code key="e">WALRUS_PUBLISHER</code>, "Walrus publisher endpoint for storing receipt blobs"],
                [<code key="e">WALRUS_AGGREGATOR</code>, "Walrus aggregator endpoint for reading receipt blobs"],
                [<code key="e">REMIT_MCP_RATE_LIMIT · REMIT_MCP_BAD_SECRET_LIMIT</code>, "Per-card and per-IP-bad-secret request ceilings per minute (240 / 30)"],
                [<code key="e">REMIT_OAUTH_ACCESS_TTL · REMIT_OAUTH_REFRESH_TTL</code>, "OAuth access / refresh token lifetimes in seconds (3600 / 2592000)"],
                [<code key="e">REMIT_OAUTH_REDIRECT_HOSTS</code>, "If set, restricts OAuth https redirect-URI hosts to this allowlist"],
              ]}
            />
            <h3>Contracts (Sui testnet)</h3>
            <Table
              head={["Package", "ID"]}
              rows={[
                [<code key="c">remit::card</code>, <code key="v">0x1d020a9c1fc0fded2300133490bd3e0041bfeccb1f41f3d39eddbaa4aa51e969</code>],
                [<code key="c">USDC (testnet)</code>, <code key="v">0x... (Sui testnet USDC)</code>],
              ]}
            />
          </Section>

          {/* ---- Hackathon ---- */}
          <Section id="cookoff" title="The Hackathon">
            <p className="docp">
              SuiPass was built for the <b>Sui Overflow 2026</b> hackathon, competing in the <b>Agentic Web</b> track
              — Sub-track 2: <b>Autonomous Agent Wallet</b>. The project demonstrates how Sui's unique primitives
              (zkLogin, PTBs, GasSponsor, Move objects, Walrus) make AI agent spending safe, scoped, and verifiable.
            </p>
            <Table
              head={["Track Element", "What SuiPass does"]}
              rows={[
                ["zkLogin", "Google OAuth → derived wallet; no seed phrases, no browser extension"],
                ["Move Objects (Card + CardCap)", "Every card is a typed Sui object with on-chain budget tracking and capability-based access control"],
                ["PTBs", "Each spend bundles validation + transfer + receipt into one atomic transaction"],
                ["GasSponsor", "Covers SUI gas fees so agents never need native tokens to pay"],
                ["Walrus", "Verifiable, persistent receipt storage for audit trails and cross-agent memory"],
                ["DeepBook", "Optional token swap within card budget for multi-asset agents"],
                ["Venice AI", "Plain-language card term compiler with verified address resolution"],
                ["MCP + OAuth 2.1", "Open-standard agent connectivity with scoped, revocable tokens"],
              ]}
            />
            <Note>
              SuiPass uses <b>Sui Move objects</b> for card state (not ERC-7710 delegations), <b>zkLogin</b> for auth
              (not Privy), and <b>Sui GasSponsor</b> for gasless transactions (not 1Shot relayer). The architecture
              is Sui-native from the ground up.
            </Note>
            <h3>Where in the code</h3>
            <ul className="docul">
              <li className="docli">
                <b>Move contract.</b>{" "}
                <a href="https://github.com/LSUDOKO/SuiPass/blob/main/packages/engine/sui/sources/card.move" target="_blank" rel="noreferrer">
                  <code>card.move</code>
                </a>
                — Card object, CardCap capability, spend/issue_subcard/revoke/freeze entry functions.
              </li>
              <li className="docli">
                <b>PTB builder.</b>{" "}
                <a href="https://github.com/LSUDOKO/SuiPass/blob/main/packages/engine/src/ptb.ts" target="_blank" rel="noreferrer">
                  <code>ptb.ts</code>
                </a>
                — builds Programmable Transaction Blocks for spend, issue, revoke, and swap.
              </li>
              <li className="docli">
                <b>GasSponsor.</b>{" "}
                <a href="https://github.com/LSUDOKO/SuiPass/blob/main/packages/engine/src/sponsor.ts" target="_blank" rel="noreferrer">
                  <code>sponsor.ts</code>
                </a>
                — sponsored transaction server that validates and co-signs PTBs.
              </li>
              <li className="docli">
                <b>zkLogin.</b>{" "}
                <a href="https://github.com/LSUDOKO/SuiPass/blob/main/packages/server/src/api/zklogin.ts" target="_blank" rel="noreferrer">
                  <code>zklogin.ts</code>
                </a>
                — Google OAuth → Sui address derivation via Enoki.
              </li>
              <li className="docli">
                <b>Venice compiler.</b>{" "}
                <a href="https://github.com/LSUDOKO/SuiPass/blob/main/packages/server/src/venice/compiler.ts" target="_blank" rel="noreferrer">
                  <code>compiler.ts</code>
                </a>
                — plain language → CardTerms with verified address resolution.
              </li>
              <li className="docli">
                <b>Walrus receipts.</b>{" "}
                <a href="https://github.com/LSUDOKO/SuiPass/blob/main/packages/engine/src/store.ts" target="_blank" rel="noreferrer">
                  <code>store.ts</code>
                </a>
                — encrypted blob storage on Walrus for charge memos and audit trails.
              </li>
            </ul>
            <hr className="docrule" />
            <p className="docp">
              Ready to issue one? <Link href="/">Open the dashboard</Link>, sign in with Google, and your first card takes about a
              minute.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}

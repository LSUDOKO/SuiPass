# SuiPass — Agentic Spending Cards on Sui

**SuiPass** gives AI agents scoped, revocable spending cards — without ever sharing your private keys. Agents get a card (a Sui `CardCap` object), not a key, and every spend is checked against on-chain limits (budget, expiry, merchant allowlist, per-tx cap).

Built for the **Sui Overflow 2026 Hackathon** — Agentic Web track.

## How It Works

```
User Wallet (zkLogin)
      │ issue_root_card()
      ▼
   Card Object ─── CardCap (agent's credential)
      │                          │
      │    ┌─────────────────────┤
      │    │ pay() within terms   │
      ▼    ▼                     ▼
   spend() PTB ──→ USDC transfer on Sui
      │
      ├── On-chain ChargeLog event
      ├── Walrus receipt storage
      └── Server-side charge ledger (SQLite + typed refusals)
```

1. **User connects** via Google OAuth (zkLogin) — no seed phrase needed
2. **User issues a card** with terms (budget, expiry, merchant allowlist) — on-chain `Card` + `CardCap` objects created
3. **Agent connects** via the card secret URL over MCP (Model Context Protocol)
4. **Agent calls `pay()`** → server validates → builds PTB → sponsors gas → executes on Sui
5. **Instant revocation** — owner deletes/wraps the Card object, all descendants cascade

## Architecture

```
packages/
  engine/         TypeScript engine + Sui Move contracts
    sui/          Move package: Card, CardCap, spend(), sub-cards, ChargeLog
    src/          PTB builders, GasSponsor, zkLogin verifier, SQLite store
  server/         Hono server: MCP tools, REST API, OAuth 2.1 AS, Venice compiler
  dashboard/      Next.js 16 app: zkLogin login, card deck, NL composer
```

## Features

| Feature | Status |
|---|---|
| **USDC payments on Sui** via scoped `Card` objects | ✅ Live on testnet |
| **zkLogin** (Google OAuth → Sui address, no seed phrases) | ✅ Enabled |
| **Gas sponsorship** (agent pays $0 in gas, server sponsors) | ✅ GasSponsor |
| **Per-card OAuth 2.1** (PKCE, DCR, rotating refresh tokens) | ✅ RFC-compliant |
| **NL Card Compiler** (Venice AI: "pay rent $1500/mo" → CardTerms) | ✅ Disabled (needs VENICE_API_KEY) |
| **Sub-cards** (delegate narrower authority to sub-agents) | ✅ On-chain |
| **DeepBook swap execution** (swap USDC → SUI via card) | ✅ Wired |
| **Walrus receipt logging** (encrypted on-chain audit trail) | ✅ Configured |
| **MCP tools** (card, pay, paid_fetch, execute, issue/revoke subcard) | ✅ Full set |
| **Instant freeze/revoke/nuke** | ✅ On-chain + server-side |

## Quick Start

### Prerequisites

- [Sui CLI](https://docs.sui.io/getting-started/onboarding/sui-install) (testnet)
- [Bun](https://bun.sh/) v1.2+
- Google OAuth Client ID (for zkLogin)
- [Venice AI API Key](https://venice.ai) (for NL compiler — optional)

### Setup

```bash
# Clone and install
git clone https://github.com/s0nderlabs/remit.git
cd remit
bun install

# Configure environment
cp .env.example .env
# Edit .env: fill in your keys
```

### Run

```bash
# Start the server
bun run dev
# → http://localhost:4070

# Start the dashboard (separate terminal)
cd packages/dashboard
bun run dev
# → http://localhost:4071
```

### Deploy Move Package

```bash
cd packages/engine/sui
sui client publish --gas-budget 100000000
# → Update SUIPASS_PACKAGE_ID in .env with the published ID
```

## Deployment (Testnet)

| Component | URL |
|---|---|
| **Move Package** | `0x1d020a948ce614e47c60d3fa36b90a90e74672878fc881f3091272735a14e969` |
| **Server** | http://localhost:4070 |
| **Dashboard** | http://localhost:4071 |
| **Network** | Sui Testnet |

## Track Fit: Agentic Web

SuiPass fits **Sub-track 2: Autonomous Agent Wallet** — an agent wallet using zkLogin and Move policy objects that grants AI agents capped budgets and protocol scopes. Every requirement is met:

- ✅ Real on-chain spend via `spend()` PTB
- ✅ Self-enforced budget ceiling (Card's `budget_remaining`/`spent_this_period`)
- ✅ On-chain activity log (ChargeLog objects + SpendEvent)
- ✅ Owner revocation demo (`revoke_card()` sets `is_revoked`)
- ✅ zkLogin for user auth

**Bonus:** Walrus integration for encrypted receipt storage (also eligible for Walrus track).

## Environment Variables

See `.env.example` for all config. Key vars:

| Variable | Purpose |
|---|---|
| `SUIPASS_MASTER_KEY` | 32-byte hex key for encrypting card secrets |
| `SUIPASS_PACKAGE_ID` | Published Move package ID |
| `SUIPASS_GAS_SPONSOR_KEY` | Ed25519 private key for gas sponsorship |
| `SUIPASS_GOOGLE_CLIENT_ID` | Google OAuth client ID for zkLogin |
| `SUIPASS_WALRUS_PUBLISHER` | Walrus publisher endpoint |
| `SUIPASS_WALRUS_AGGREGATOR` | Walrus aggregator endpoint |
| `VENICE_API_KEY` | Venice AI API key for NL compiler |

## License

MIT

# SuiPass

SuiPass gives AI agents scoped, revocable spending cards on Sui — without ever sharing your private keys. Agents get a card (a Sui Card + CardCap object), not a key. Every spend is checked against on-chain limits (budget window, per-tx cap, expiry, merchant allowlist, usage count).

Package manager: pnpm.

## Commands

- dev: `pnpm dev`
- typecheck: `pnpm typecheck`

## Layout

- `docs/`
- `images/`
- `packages/`
- `probes/`

## Rules

- Never commit secrets or `.env` files.

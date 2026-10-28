# Flipside

Long or short any Solana coin by its contract address, filled against an on-chain pool. Working name.

**Status: P0 (scaffold and design system).** Every screen of the approved prototype runs in Next.js on mock
data. Prices, trades and wallets are simulated; nothing moves real SOL yet.

| File | What it is |
|---|---|
| `CLAUDE.md` | Full build brief: stack, vault program, engine and ledger, indexer, risk engine, API, database, frontend rules, deployment, phases and definition of done. |
| `TASK.md` | The phase checklist. |
| `DECISIONS.md` | Every choice the brief does not cover. |
| `prototype.html` | Approved UI. Open it in a browser; it is the source of truth for layout, copy and behavior. |
| `.env.example` | Every environment variable, with the trading and risk defaults. Never commit a filled-in copy. |

## Layout

```
apps/web          Next.js 14 frontend (the prototype, ported)
apps/api          Fastify REST + WebSocket          (P0: /api/health, /api/rules, /ws hello)
apps/engine       order book, ledger, risk           (P0: boots, logs the rules hash, /health)
apps/indexer      prices, liquidity, chain events    (P0: /health)
apps/worker       scheduled jobs                     (P0: /health)
programs/vault    Anchor program flipside_vault      (P0: scaffold)
packages/core     money.ts (bigint lamports), rules.ts (every rule + env overrides), zod schemas
packages/db       Prisma schema (CLAUDE.md section 12) and client
packages/sdk      typed API client
```

## Run it

Needs Node 22 (`.nvmrc`) and pnpm 10 (`corepack enable`).

```bash
pnpm install
```

```bash
pnpm --filter @flipside/web dev
```

Open http://localhost:3000. The services run the same way (`pnpm --filter @flipside/api dev`, and so on), or
all at once with `pnpm dev`.

## Checks

```bash
pnpm turbo run lint typecheck test build
```

```bash
pnpm format:check
```

End-to-end flows at 1440 px and 390 px (starts its own server on port 3100 after a build):

```bash
pnpm --filter @flipside/web exec playwright install chromium
```

```bash
pnpm --filter @flipside/web e2e
```

Side-by-side screenshots of the prototype and the port, and Lighthouse accessibility on every route, both
against a running production build on port 3000:

```bash
pnpm --filter @flipside/web build && pnpm --filter @flipside/web start
```

```bash
pnpm compare
```

```bash
pnpm a11y
```

`pnpm compare` writes `artifacts/compare/<width>-<view>.png` (prototype left, port right). `pnpm a11y`
fails below 95.

The vault program:

```bash
cargo check -p flipside_vault
```

## Deploying

PM2 runs `web`, `api`, `engine` (exactly one instance, never clustered), `indexer` and `worker` from
`ecosystem.config.cjs`. Nginx, TLS, backups and alerts are set up in P6 (CLAUDE.md section 13). Keypairs live
only on the server at the paths in `.env`.

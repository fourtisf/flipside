# TASK.md: how to run this with Claude Code

## Step 1. Put the files in place

Create an empty folder for the project, copy these files into its root, then open Claude Code in that folder:

```
CLAUDE.md        build brief (Claude Code reads it automatically)
TASK.md          this file
prototype.html   approved UI, the source of truth for every screen
.env.example     environment template
```

## Step 2. Paste this as the first message

```
Read CLAUDE.md fully, then open prototype.html and study every view
(Markets, Trade, Portfolio, Pool, Leaderboard, Docs) and every interaction.

Build Coinside exactly as CLAUDE.md describes, phase by phase (P0 to P6).
Rules:
- Start with P0 only. Do not start the next phase until the current phase
  meets its definition of done in CLAUDE.md section 15.
- At the end of each phase, stop and give me: what you built, how to run
  it, the test results, and anything that needs my decision.
- The prototype is the source of truth for layout, copy, colors and
  behavior. Match it pixel for pixel at 1440px and 390px.
- All money is bigint lamports. No floats in balances, fees or P&L.
- Never commit keys or .env files. Never put the engine or root-poster
  keypair anywhere except the server path in .env.
- Keep a DECISIONS.md with every choice you make that CLAUDE.md does not
  cover, and ask me before anything listed in CLAUDE.md section 16.

Begin with P0: scaffold the monorepo from CLAUDE.md section 3 and port
prototype.html to Next.js with mock data.
```

## Step 3. Phase checklist

Tick these off as Claude Code reports each phase. Each later phase gets a short follow-up message, for example "P0 looks right. Start P1."

### P0. Scaffold and design system
- [ ] pnpm + Turborepo monorepo with `apps/web`, `apps/api`, `apps/engine`, `apps/indexer`, `apps/worker`, `programs/vault`, `packages/core`, `packages/db`, `packages/sdk`
- [ ] Lint, typecheck and test scripts; CI workflow
- [ ] Design tokens from the prototype (`--bg`, `--s1`… `--long`, `--short`, Inter + Geist Mono)
- [ ] Every route in CLAUDE.md section 11 renders with mock data and matches the prototype at 1440px and 390px
- [ ] Lighthouse accessibility ≥ 95

### P1. Prices and markets
- [ ] Pool decoders: pump.fun bonding curve, PumpSwap, Raydium AMM v4 / CPMM / CLMM, Meteora DAMM / DLMM
- [ ] Helius account streaming, 1 Hz sampling, Redis ring buffer, candles (5s, 15s, 30s, 1m)
- [ ] Liquidity-weighted median price, liquidity, market cap, holders, fees paid
- [ ] Jupiter deviation guard
- [ ] Markets REST + WebSocket; home page and trade chart on live data
- [ ] 20 mainnet coins within 1% of Jupiter, updating every second

### P2. Engine and Practice mode
- [ ] `packages/core/money.ts` with full unit tests
- [ ] Double-entry ledger, event log with hash chain, replay test
- [ ] Orders, fills (worse of live and 60s average), TP/SL, liquidation, max win, fees and fee split
- [ ] Paper pool, `POST /practice/claim`, feed, leaderboard, top wins
- [ ] Audit invariant at boot and every 5 seconds, halt policy from CLAUDE.md section 6
- [ ] 24-hour soak test balanced to the lamport

### P3. Vault program on devnet
- [ ] Anchor program: initialize, deposit, withdraw (ed25519 co-sign), post_root, emergency_withdraw, queue_change / execute_change
- [ ] bankrun tests for every path, property test, Trident fuzz
- [ ] Deposit and withdraw from the UI on devnet; deposits credited on finalized
- [ ] Worker posts Merkle roots every 5 minutes; `/emergency` page works with a stale root
- [ ] 1,000 devnet deposits and withdrawals reconcile with the ledger

### P4. Real mode with the full risk engine
- [ ] Eligibility, wallet age, rug guard, insider filter, self-trade detection, caps, crowded side fee, hourly and per-coin breakers
- [ ] Pool LP add and remove with epoch queue and reserve check
- [ ] Pool page live: exposure, safety switches, share price history
- [ ] Scripted devnet attacks all fail: three-wallet rug-and-short, insider short, pump-and-close inside 60s, coordinated crowded short

### P5. Growth features
- [ ] One-click trading (24-hour session keys, trade scope only)
- [ ] Copy trading with fixed amount per trade
- [ ] Referral links `/r/[code]`, referral earnings
- [ ] Weekly competition pot and payout
- [ ] Share cards for wins

### P6. Mainnet beta
- [ ] External audit of `programs/vault` (ALFA arranges)
- [ ] Squads multisig upgrade authority with 72-hour timelock
- [ ] Verified build hash and program ID on the Docs page
- [ ] Launch caps: pool max 250 SOL, single position max 1 SOL
- [ ] PM2, Nginx, TLS, backups, Telegram alerts live on the Hostinger VPS

## Step 4. Decisions only ALFA can make

Claude Code should stop and ask about these (CLAUDE.md section 16): ~~final name and domain~~ (decided: Coinside, coinside.fun), token or no token, who seeds the pool, fee split and max win tiers, legal review and geo-blocking, and the audit budget.

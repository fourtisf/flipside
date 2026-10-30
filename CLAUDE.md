# Coinside: build brief for Claude Code

> **Direction change, 30 Oct 2026.** ALFA chose to rebuild Coinside as a Hyperliquid builder: a trading app
> for Solana users on Hyperliquid's order book, with no pool or vault of its own. See `PLAN-HYPERLIQUID.md`.
> This brief stays the record of the original design until the decisions in that plan are made, and is then
> rewritten. Until then, don't build more of the pool, vault, engine or risk engine described below.

Read this whole file before writing code. `prototype.html` in this folder is the approved UI and the single source of truth for layout, copy, colors, typography, spacing and behavior. When this brief and the prototype disagree on anything visual, the prototype wins. When they disagree on rules or money logic, this brief wins.

---

## 1. What we are building

Coinside lets anyone go **long or short on any Solana coin by its contract address**, at 2x, 5x or 10x. Positions are filled instantly against a shared **pool** (the house), priced from the coin's own on-chain pool, and settled in SOL. It is a direct competitor to useinverse.xyz, built to fix the problems that product showed in its first day (section 2).

Core loop:

1. A user deposits SOL into an on-chain **vault program**.
2. They paste a contract address (or pick a market), choose long or short, size and leverage.
3. The **engine** fills the order immediately at a fair price, against the pool.
4. P&L moves live. The user closes any time after 10 seconds, or TP/SL, liquidation or max win closes it automatically.
5. SOL returns to their balance at once. They can withdraw to the wallet that deposited.

Also in scope: Practice mode (paper SOL), pool LP deposits, leaderboard and weekly competition, copy trading, referrals, one-click trading (24-hour session keys), and a live, provable reserves display.

## 2. Lessons from Inverse (researched 28 Oct 2026)

These are real observations from useinverse.xyz's public API and on-chain data during its first day. Every one of them maps to a requirement below.

| What happened at Inverse | What Coinside does instead |
|---|---|
| Three wallets shorted three coins within seconds of each other at $17K–$29K market cap. The coins went to roughly $0 (liquidity pulled) and each wallet hit max win (~1.35 SOL each). The LP share price fell from 1.00 to about 0.54 in under a day. | Rug guard, insider filter, self-trade detection, per-coin caps and a $30K market cap floor checked on every trade (section 8). |
| The engine refused to boot: "book holds 122.775 SOL, expected 122.825 SOL". Trading was halted with balances frozen. | All money is integer lamports in a double-entry ledger. In-flight deposits and withdrawals have their own ledger accounts. The audit runs on boot and every 5 seconds, and the halt policy keeps closes and withdrawals working (section 6). |
| The vault program was unverified and upgradeable by a single key. Their escape hatch only returned deposits, not profits. | Verified build, Squads multisig upgrade authority with a 72-hour timelock, and a Merkle balance proof posted every 5 minutes that lets users withdraw their full balance if the engine stops (section 5). |
| 82 program transactions in 7 days versus 1,298 trades in 24 hours: all trading was off-chain with no way to check the book. | Trading is off-chain too, for speed, but every balance is committed on-chain every 5 minutes and anyone can verify their own leaf. |

## 3. Stack

Use the team's standard production stack. Do not swap pieces without a written reason in `DECISIONS.md`.

- **Monorepo**: pnpm workspaces + Turborepo.
- **Web**: Next.js 14 (App Router), TypeScript, plain CSS modules or Tailwind configured with the exact tokens in section 11. Solana wallet adapter (`@solana/wallet-adapter-react`) with Phantom, Solflare and Backpack.
- **API**: Fastify (TypeScript), REST + WebSocket (`@fastify/websocket`).
- **Engine**: a separate Node.js process (TypeScript). Single writer for the order book and ledger.
- **Indexer**: a separate Node.js process for prices, liquidity, pools and chain events.
- **Worker**: a separate Node.js process for scheduled jobs (balance roots, skew fees, leaderboard, competition, holders refresh).
- **Database**: PostgreSQL via Prisma. Redis for hot state, pub/sub and rate limits.
- **On-chain**: Anchor (Rust) program for the vault. `@solana/web3.js` v1 and `@coral-xyz/anchor` on the TypeScript side.
- **Data**: Helius (RPC, LaserStream or Yellowstone gRPC account streams, DAS API, enhanced transactions). Jupiter Price API as a sanity check. Pyth SOL/USD for USD display.
- **Hosting**: Hostinger VPS, PM2 for every process, Nginx reverse proxy with TLS (Certbot), Cloudflare in front.

Repo layout:

```
apps/web          Next.js frontend (ports prototype.html)
apps/api          Fastify REST + WebSocket
apps/engine       order book, ledger, risk, settlement (single instance)
apps/indexer      price, liquidity, holders, chain events
apps/worker       cron jobs
programs/vault    Anchor program
packages/core     shared types, money math, rule config, zod schemas
packages/db       Prisma schema + client
packages/sdk      typed client for the API and the vault program
```

## 4. Money and math rules (non-negotiable)

- Every amount of SOL is a `bigint` in **lamports**. No floats anywhere in balances, fees, P&L or the ledger.
- Prices are stored as a fixed-point `bigint` of **lamports per 10^decimals base units** scaled by `PRICE_SCALE = 10^18`. Keep a single `packages/core/money.ts` with all conversions and rounding helpers, fully unit tested.
- Rounding always favors the pool: round user credits down, user debits up.
- Fees: **1% of stake on open**, **1% of the returned value on close**. No spread. No fee on profits, deposits or withdrawals.
- Fee split (config): 80% to the pool, 20% to protocol. Of the protocol's 20%, a referrer gets 50% for traders they referred. 50% of what the protocol keeps from trading fees each week funds the weekly competition pot.
- Definitions, per position:
  - `stake` = SOL the user puts in.
  - `openFee = ceil(stake * 1%)`; `margin = stake - openFee`.
  - `dir = +1` for long, `-1` for short.
  - `pnl = margin * lev * dir * (exit / entry - 1)`, clamped to `[-margin, margin * maxWinMultiple]`.
  - `value = margin + pnl`; `closeFee = ceil(value * 1%)`; `returned = value - closeFee`.
  - Liquidation happens when `pnl <= -margin`. Displayed liquidation price is `entry * (1 - 1/lev)` for longs and `entry * (1 + 1/lev)` for shorts.
- **Fair fills**: entry and exit use the worse, for the user, of the live price and the 60-second time-weighted average. Long entry `max(live, twap60)`, long exit `min(live, twap60)`; short entry `min(live, twap60)`, short exit `max(live, twap60)`.
- **Max win** is fixed at open from pool size: under 100 SOL +200%, from 100 SOL +400%, from 250 SOL +600%, from 500 SOL +1000%. A position closes itself when it reaches max win.
- **Leverage tiers** by coin liquidity (SOL side of the pool): below 150 SOL only 2x, from 150 SOL up to 5x, from 500 SOL up to 10x.
- **Minimum trade** 0.01 SOL. **Minimum hold** 10 seconds before a manual close (TP/SL, liquidation, max win and rug guard can close earlier).
- TP and SL are percentages of margin (`pnl / margin`). SL must be below 100%.

All numeric rules live in one config object in `packages/core/rules.ts` with the defaults above and can be overridden by env (section 14). The engine logs the full rules hash at boot.

## 5. Vault program (Anchor)

Program name `coinside_vault`. Holds all user and pool SOL. It never knows about positions. It knows deposits, authorized withdrawals and balance roots.

### Accounts

- `Config` PDA `["config"]`: `admin` (Squads multisig), `engine_signer` (ed25519 pubkey that co-signs withdrawals), `root_poster`, `paused: bool`, `pending_change: Option<PendingChange>` (timelocked), `bump`.
- `Vault` PDA `["vault"]`: system-owned PDA that holds the lamports. Only this program can move them via `invoke_signed`.
- `UserState` PDA `["user", wallet]`: `wallet`, `deposited_total: u64`, `withdrawn_total: u64`, `next_nonce: u64`, `emergency_claimed_epoch: u64`.
- `BalanceRoot` PDA `["root"]`: `epoch: u64`, `root: [u8; 32]`, `total_liabilities: u64`, `posted_at: i64`.

### Instructions

1. `initialize(admin, engine_signer, root_poster)`.
2. `deposit(amount)`: user signs; transfers lamports user → vault; updates `deposited_total`; emits `Deposited { wallet, amount, slot }`. Rejects when `paused`.
3. `withdraw(amount, nonce, expiry, engine_sig)`: user signs. The transaction must include an ed25519 program instruction verifying `engine_sig` over the message `"coinside:withdraw" || program_id || wallet || amount || nonce || expiry`. The program reads it through the instructions sysvar, checks `nonce == next_nonce`, `now <= expiry`, then transfers vault → wallet (only ever to the signer's own wallet), increments `next_nonce` and `withdrawn_total`, emits `Withdrawn`. Works even when `paused` (pausing only blocks deposits).
4. `post_root(epoch, root, total_liabilities)`: `root_poster` signs; `epoch` must increase by exactly 1; stores and emits.
5. `emergency_withdraw(amount, proof: Vec<[u8;32]>)`: allowed only when `now - root.posted_at > 72 hours`. Leaf = `sha256("coinside:leaf" || wallet || amount || epoch)`. Verifies the proof against `root.root`, requires `emergency_claimed_epoch < epoch`, pays `amount` (the user's full claimable balance: free cash + margin of open positions valued at last mark + pool LP value) and records the epoch.
6. `queue_change(change)` / `execute_change()`: admin-only changes to `engine_signer`, `root_poster` or `paused` go through a 72-hour queue. `pause` alone can be immediate; `unpause` and key rotations are timelocked.

### Requirements

- Upgrade authority is a Squads v4 multisig behind a 72-hour timelock. Publish the program ID and verified build hash (`solana-verify`) on the Docs page.
- Tests: Anchor + bankrun for every instruction and every rejection path; a property test that the vault balance always equals deposits minus withdrawals; a fuzz harness (Trident) for withdraw and emergency_withdraw.
- An external audit is required before mainnet with real users. Flag this to ALFA when Phase 3 is done.

## 6. Engine, book and ledger

One engine process owns all state changes. Everything it does is an event appended to `engine_events` (sequence number, type, payload, hash of previous event). State can be rebuilt by replaying events from zero; a test must prove replay produces identical balances.

### Ledger (double-entry, lamports)

Accounts (one row per account in `ledger_accounts`, entries in `ledger_entries`, every transaction sums to zero):

- `user:{wallet}:free` cash the user can trade or withdraw
- `user:{wallet}:margin` margin locked in open positions
- `user:{wallet}:withdrawing` amounts with a signed, not yet executed withdrawal
- `pool:cash`
- `protocol:fees`, `referral:{wallet}`, `competition:pot`
- `chain:inflight_deposits` deposits seen on-chain at `confirmed` but not yet `finalized`
- Practice mode uses the same code with a `paper:` prefix and its own isolated paper pool. Paper never touches real accounts.

### Audit invariant

`vault lamports on-chain - rent_exempt_minimum == sum of all real liability accounts`.

- Checked at boot and every 5 seconds, plus after every deposit and withdrawal event.
- On mismatch: stop **new opens** immediately, keep closes, TP/SL, liquidations and withdrawals working, alert Telegram with the diff and the last 50 events, and show the "trading paused while the book is checked" banner. Never freeze withdrawals for a mismatch smaller than the protocol's own `protocol:fees` balance; cover it from there and record a `reconciliation` entry.

### Order flow

`POST /api/orders` → validate request signature (wallet or session key) → engine checks, in order: coin eligible and not paused, wallet age, insider filter (shorts), side cap, pool exposure cap, hourly breaker, balance → compute fill → write ledger (`free → margin`, `free → fees`) → create position → publish `position.opened` and `feed` events. Target p95 under 150 ms from request to fill.

The engine re-marks every open position on each price tick (1 second) and closes on liquidation, max win, TP, SL or rug guard. Manual closes use `POST /api/positions/:id/close`.

### Pool accounting

- The pool is the counterparty. On close it pays `pnl` if positive and receives `-pnl` if negative, plus its 80% fee share.
- Pool NAV = `pool:cash - sum of open positions' unrealized pnl` (marked at fair exit price).
- LP shares: deposit at current NAV per share; withdrawals are queued to the next 5-minute epoch, priced at that epoch's NAV, and cannot take pool cash below `reserve = sum over coins of max(0, worst-case payout on that coin)` (bounded by the caps in section 8).
- Launch with share price 1.0000.

## 7. Price indexer

- **Market discovery**: a mint becomes a market when someone pastes it or it shows up in trending sources. Resolve its pools on pump.fun (bonding curve), PumpSwap, Raydium (AMM v4, CPMM, CLMM), Meteora (DAMM, DLMM) and StonkFun/LaunchLab. v1 supports SOL-quoted pools only; coins quoted in other assets (for example StonkFun stock pairs) are not tradable until a conversion path is added.
- **Streaming**: subscribe to pool account changes via Helius LaserStream (or Yellowstone gRPC). Decode reserves per pool type. Price in SOL: constant-product pools `quote / base` adjusted for decimals; CLMM from `sqrt_price_x64`; DLMM from the active bin.
- **Sampling**: one sample per second per market into a Redis ring buffer (at least 15 minutes). Build 1-second, 5-second, 15-second, 30-second and 1-minute candles. Persist 1-minute candles to Postgres.
- **Multi-pool coins**: use the liquidity-weighted median across the coin's pools with at least 25 SOL of liquidity, not just the deepest pool.
- **Liquidity** = SOL reserve of the coin's pools (sum across eligible pools). This drives leverage tiers, caps and the rug guard.
- **Deviation guard**: every 10 seconds compare against the Jupiter Price API. If the difference is over 5% for 30 seconds, pause new opens on that coin.
- **Holders and fees**: refresh holder count (Helius DAS) every 5 minutes; track cumulative trading fees paid from indexed swaps.
- **Market cap** = price × circulating supply × SOL/USD (Pyth).

## 8. Risk engine (what keeps the pool from being drained)

All thresholds are config with these defaults.

1. **Eligibility**: at least $30,000 market cap (checked on every open), 100 holders, 7 SOL of trading fees paid, and 24 hours of trading history. Coins that drop below the market cap floor stop accepting opens; open positions keep running.
2. **Wallet age**: a wallet first funded less than 24 hours ago cannot trade (first inbound SOL transfer via Helius enhanced history, cached).
3. **Rug guard**: if a coin's liquidity falls 30% or more within any 5-minute window, settle every open position on it at its 60-second average price from before the drop (`twap60` at the last sample before the window started), pause the coin, and post a feed event. This is the fix for the Inverse rug-and-short exploit.
4. **Insider filter**: block shorts from the coin's deployer, wallets the deployer funded (two hops, within 7 days before launch) and the top 20 holders at the moment of the order.
5. **Self-trade detection**: watch on-chain swaps and liquidity removals in a coin by wallets that hold an open position on it, and by wallets linked to them (funding graph). If a holder of a short sells or pulls liquidity in that coin (or a long holder buys) during the position, freeze that position's payout for manual review and flag the wallet cluster.
6. **Caps**: open stake per side per coin at most `min(1% of coin liquidity, 30 SOL)`; pool net exposure per coin at most 2% of pool NAV; a single position at most 5% of pool NAV.
7. **Crowded side fee**: once an hour, on coins where one side's open stake is more than twice the other's, the crowded side pays `SKEW_FEE_BPS_PER_HOUR` (default 10 bps) of its stake to the other side, pro rata.
8. **Hourly loss breaker**: if pool NAV falls 3% within an hour, pause new opens for 15 minutes. Closes keep working.
9. **Coin loss breaker**: if the pool loses more than 1% of NAV on one coin within an hour, pause opens on that coin for 1 hour.

Every trigger writes a `RiskEvent` row and a Telegram alert, and shows up in the Pool page's "Safety switches" list exactly like the prototype.

## 9. Balance proofs (every 5 minutes)

The worker builds a Merkle tree of every wallet's claimable balance (free + withdrawing + margin valued at fair exit + LP value), posts the root with `post_root`, and stores the tree. `GET /api/proof/:wallet` returns the leaf and proof. The Pool page shows "Balance proof posted Ns ago". The frontend has an emergency withdraw page that only becomes active after 72 hours without a root.

## 10. API

REST under `/api`, JSON, all amounts as lamport strings.

- Public: `GET /markets?sort=&venue=&q=`, `GET /markets/:mint`, `GET /markets/:mint/candles?tf=5s|15s|30s|1m&limit=`, `GET /markets/map` (treemap data), `GET /feed`, `GET /stats` (pool, vault, owed, volume24h, trades24h, paid24h), `GET /pool`, `GET /pool/history`, `GET /leaderboard?range=day|week`, `GET /wins?range=day`, `GET /reserves`, `GET /proof/:wallet`, `GET /rules`.
- Auth: Sign-In With Solana. `POST /auth/nonce`, `POST /auth/verify` → JWT (15 minutes) + refresh cookie.
- One-click trading: `POST /sessions` with a wallet-signed message authorizing a browser-generated ed25519 public key for 24 hours, scope `trade` only (never withdraw). Order requests are signed by the session key.
- User: `GET /me`, `GET /me/positions`, `GET /me/history`, `POST /orders`, `POST /positions/:id/close`, `PATCH /positions/:id` (TP/SL), `POST /withdrawals` → `{ amount, nonce, expiry, engineSig, tx }` (unsigned transaction for the wallet), `POST /pool/deposit`, `POST /pool/withdraw`, `POST /practice/claim` (10 paper SOL, once per wallet per 24 hours), `GET/POST /me/referral`, `POST /copy` (`leader`, `amountPerTrade`), `DELETE /copy/:leader`.
- WebSocket `/ws`: channels `prices:{mint}` (1 Hz), `markets` (summary, 1 Hz), `feed`, `stats`, `me` (positions, balance, toasts). Messages are `{ ch, t, data }`.
- Rate limits in Redis: 10 orders per second per wallet, 60 requests per second per IP.

Zod schemas for every request and response live in `packages/core` and are shared with the web app.

## 11. Frontend: port the prototype exactly

Open `prototype.html` in a browser and click through every view before starting. It simulates prices, trades and wallets; replace the simulation with real API and WebSocket data, keep everything else.

Routes:

| Route | Prototype view |
|---|---|
| `/` | Markets: tape, hero with Quick trade ticket, stats strip, market map, Hot / Most shorted / Big caps, All markets table, Live trades, Top wins today |
| `/trade/[mint]` | Terminal: coin header, watchlist, candle chart with 60s average line, Short view flip, order panel, positions and history tabs |
| `/portfolio` | Metrics, referral link, open positions, history, deposit and withdraw dialogs |
| `/pool` | Metrics, share price chart, add/remove form, exposure table, safety switches |
| `/leaderboard` | Today / This week, podium, table, Copy buttons |
| `/docs` | Getting started, rules, pool protection, risks (keep the copy) |
| `/r/[code]` | Sets the referrer cookie and redirects to `/` |
| `/emergency` | Emergency withdraw via Merkle proof (new, follow the same design system) |

Design tokens (copy from the prototype's `:root`):

```
--bg #000   --s1 #0A0A0A   --s2 #111   --s3 #1A1A1A
--line #1C1C1C   --line2 #2A2A2A   --line3 #3A3A3A
--t1 #EDEDED   --t2 #A1A1A1   --t3 #6E6E6E
--long #3DD68C   --short #FF5F5F   (10% alpha backgrounds for chips)
Fonts: Inter (UI) with font-feature-settings "cv11","ss01","ss03"; Geist Mono for every number, price, address and percentage.
Radii: 7–8px buttons, 9–10px inputs, 12px panels, 16px the Quick trade card.
```

Rules for the port:

- No glows, gradients (except the map legend and the faint chart fill), glass or drop shadows other than the ones already in the prototype. Primary buttons are light (#EDEDED on black); green and red are only for long, short and P&L.
- Candles: use TradingView `lightweight-charts` styled to match the prototype (colors, grid #151515, mono axis labels, dashed 60s average line, dashed entry lines with "Your long 2x" labels, last-price chip, crosshair with OHLC readout, and the Short view that inverts the price axis).
- Market map: `d3-hierarchy` treemap with the squarify tiling; tile color from the 1-hour move clamped to ±30%, interpolating `#5A1A1E → #161616 → #0F4A30`.
- Prices under $0.001 use the subscript-zero format (`$0.0₄5612`) exactly like the prototype's `price()` helper.
- Live price changes flash green or red on the number for 0.9 s; respect `prefers-reduced-motion`.
- Mobile: bottom tab bar, horizontally scrolling venue chips, the table collapses to token / price / 1h, the trade view stacks chart, order panel, positions. Test at 390 px and 1440 px.
- Accessibility: keep the prototype's labels, `aria-pressed`, `role="switch"`, focus rings and keyboard shortcuts (⌘K / Ctrl K focuses search; arrow keys and Enter in the search dropdown).
- Copy: keep the prototype's wording. Sentence case, plain verbs, errors that say what happened and how to fix it.

## 12. Database (Prisma, starting point)

```prisma
model User {
  wallet        String   @id
  createdAt     DateTime @default(now())
  firstFundedAt DateTime?
  refCode       String?  @unique
  referredBy    String?
  flagged       Boolean  @default(false)
}

model Session {
  id         String   @id @default(cuid())
  wallet     String
  publicKey  String   @unique
  scope      String   // "trade"
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  @@index([wallet])
}

model Coin {
  mint          String   @id
  symbol        String
  name          String
  decimals      Int
  supply        BigInt
  deployer      String?
  venue         String   // pumpfun | pumpswap | raydium | meteora | stonkfun
  pools         Json     // [{ address, type, quote }]
  status        String   @default("watching") // watching | open | paused | guard
  pausedReason  String?
  holders       Int      @default(0)
  feesPaidLamports BigInt @default(0)
  firstTradeAt  DateTime?
  updatedAt     DateTime @updatedAt
}

model Candle1m {
  mint      String
  ts        DateTime
  open      Decimal  @db.Decimal(38, 18)
  high      Decimal  @db.Decimal(38, 18)
  low       Decimal  @db.Decimal(38, 18)
  close     Decimal  @db.Decimal(38, 18)
  volumeLamports    BigInt
  liquidityLamports BigInt
  @@id([mint, ts])
}

model Position {
  id            String   @id @default(cuid())
  wallet        String
  mode          String   // real | paper
  mint          String
  side          String   // long | short
  leverage      Int
  stakeLamports BigInt
  marginLamports BigInt
  openFeeLamports BigInt
  entryPrice    Decimal  @db.Decimal(38, 18)
  maxWinBps     Int
  tpBps         Int?
  slBps         Int?
  openedAt      DateTime @default(now())
  closedAt      DateTime?
  exitPrice     Decimal? @db.Decimal(38, 18)
  pnlLamports   BigInt?
  closeFeeLamports BigInt?
  closeReason   String?  // manual | liq | max | tp | sl | guard
  frozenForReview Boolean @default(false)
  copiedFrom    String?
  @@index([wallet, mode, closedAt])
  @@index([mint, closedAt])
}

model LedgerAccount {
  id       String  @id          // e.g. "user:<wallet>:free"
  balance  BigInt  @default(0)
}

model LedgerEntry {
  id        BigInt   @id @default(autoincrement())
  txId      String
  accountId String
  amount    BigInt   // signed; every txId sums to zero
  kind      String   // deposit | withdraw | open | close | fee | lp | skew | referral | reconciliation
  refId     String?
  createdAt DateTime @default(now())
  @@index([txId])
  @@index([accountId, createdAt])
}

model EngineEvent {
  seq       BigInt   @id
  type      String
  payload   Json
  prevHash  String
  hash      String
  createdAt DateTime @default(now())
}

model Deposit {
  signature String   @id
  wallet    String
  lamports  BigInt
  slot      BigInt
  status    String   // confirmed | finalized | credited
  createdAt DateTime @default(now())
}

model Withdrawal {
  id        String   @id @default(cuid())
  wallet    String
  lamports  BigInt
  nonce     BigInt
  expiry    DateTime
  engineSig String
  status    String   // signed | executed | expired
  txSig     String?
  createdAt DateTime @default(now())
}

model LpPosition {
  wallet String @id
  shares Decimal @db.Decimal(38, 18)
}

model PoolSnapshot {
  ts         DateTime @id
  navLamports BigInt
  shares     Decimal @db.Decimal(38, 18)
}

model BalanceRoot {
  epoch      BigInt   @id
  root       String
  totalLamports BigInt
  txSig      String?
  postedAt   DateTime
  tree       Bytes
}

model RiskEvent {
  id        String   @id @default(cuid())
  kind      String   // rug_guard | insider_block | self_trade | breaker_hour | breaker_coin | deviation | audit_mismatch
  mint      String?
  wallet    String?
  detail    Json
  createdAt DateTime @default(now())
}

model CopyFollow {
  follower     String
  leader       String
  amountLamports BigInt
  active       Boolean @default(true)
  @@id([follower, leader])
}

model Competition {
  weekStart DateTime @id
  potLamports BigInt @default(0)
  winners   Json?
  paidAt    DateTime?
}
```

## 13. Deployment

- PM2 processes: `web`, `api`, `engine` (exactly one instance, never clustered), `indexer`, `worker`. Ecosystem file in the repo root.
- Nginx: `coinside.fun` → web, `/api` and `/ws` → api (WebSocket upgrade headers). TLS via Certbot. Cloudflare in front with WebSocket enabled.
- Postgres and Redis on the VPS with daily encrypted backups to object storage; point-in-time recovery for Postgres.
- Keys: `engine_signer` and `root_poster` keypairs live only on the server, readable only by the engine and worker users, never in the repo or env files committed to git. Admin is the Squads multisig.
- Monitoring: health endpoints for every process, Telegram alerts for audit mismatch, breaker triggers, indexer lag over 5 seconds, engine restarts, and balance root failures.

## 14. Config and environment

See `.env.example`. Every rule in section 4 and section 8 has an env override with the default from this brief. The API exposes them read-only at `GET /api/rules` so the Docs page renders the live values.

## 15. Phases and definition of done

Work in this order. Do not start a phase until the previous one passes its checks.

**P0. Scaffold and design system**
Monorepo, lint, typecheck, CI. Port `prototype.html` to Next.js with mock data from a local fixtures file. Done when every view matches the prototype side by side at 1440 px and 390 px, and Lighthouse accessibility is 95 or higher.

**P1. Prices and markets**
Indexer for pump.fun, PumpSwap, Raydium (v4, CPMM, CLMM), Meteora (DAMM, DLMM); candles; liquidity; eligibility; markets API and WebSocket. Done when 20 live mainnet coins show prices within 1% of Jupiter, update every second, and the market map, lists and table render from real data.

**P2. Engine and Practice mode**
Ledger, engine, positions, fills, TP/SL, liquidation, max win, fees, paper pool, practice claim, feed, leaderboard. Done when a 24-hour soak test with simulated traders keeps the paper ledger balanced to the lamport, and replaying the event log reproduces every balance.

**P3. Vault program on devnet**
Program, tests, fuzzing, deposit and withdraw from the UI, balance roots, emergency withdraw page. Done when all program tests pass, a devnet run of 1,000 deposits and withdrawals matches the ledger, and an emergency withdraw succeeds after forcing the root to be stale.

**P4. Real mode on devnet with full risk engine**
All of section 8, pool LP deposits and withdrawals, Pool page live. Done when scripted attacks fail on devnet: rug-and-short with three wallets, insider short, pump-and-close inside 60 seconds, and coordinated crowded short. Each must leave the pool's NAV unharmed beyond fees.

**P5. Growth features**
One-click trading sessions, copy trading, referrals, weekly competition payout, share cards for wins. Done when each works end to end on devnet.

**P6. Mainnet beta**
External audit of the vault program, Squads multisig and timelock in place, verified build published. Launch with conservative caps (pool max 250 SOL, single position max 1 SOL) and raise them only after 7 days without incidents.

## 16. Open decisions for ALFA (do not guess these, ask)

1. ~~Final name and domain~~ Decided 29 Oct 2026: **Coinside**, at **coinside.fun** (Flipside was the working name; its domains were taken).
2. Whether to launch a token. If yes, how its creator fees flow into the pool.
3. Who seeds the pool at launch and how much.
4. Fee split and max win tiers if they should differ from this brief.
5. Legal review and geo-blocking: this is a leveraged derivatives product on memecoins.
6. Budget and timing for the external program audit.

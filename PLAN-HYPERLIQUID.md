# Coinside on Hyperliquid: the new plan

**Status:** proposed 30 Oct 2026. ALFA chose this direction ("buatkan ke arah hyperliquid trading di sol").
`CLAUDE.md` becomes this design once the decisions at the end are made; until then it stays as the record of
the original design (Coinside as the house, with its own pool and vault).

## What changes

|                          | Original design (CLAUDE.md)                        | Hyperliquid builder                                                 |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------- |
| Who takes the other side | Coinside's own pool (the house)                    | Hyperliquid's order book and its market makers                      |
| Seed capital             | ALFA funds the pool                                | None                                                                |
| Risk when traders win    | The pool pays                                      | None for Coinside                                                   |
| Where users' money is    | Coinside's vault program (needs an external audit) | The user's own Hyperliquid account                                  |
| What has to be built     | Engine, ledger, vault, risk engine, price indexer  | An app on top of Hyperliquid's API                                  |
| Markets                  | Any Solana token by contract address               | What Hyperliquid lists (BTC, ETH, SOL and popular memecoins)        |
| Revenue                  | 1% to open + 1% to close, minus pool losses        | A builder fee on every order (Hyperliquid caps it at 0.1% on perps) |

Coinside becomes a **Hyperliquid builder**: a trading app made for Solana users. Orders go to Hyperliquid's
order book with Coinside's builder code, and Coinside earns a fee on each one. Coinside never holds user
funds and never takes the other side of a trade.

## How it works for a user

1. **Connect.** The user connects a Solana wallet that also has an EVM address (Phantom, Backpack). That EVM
   address is their Hyperliquid account. Wallets without one are decision 3 below.
2. **Deposit from Solana.**
   - **SOL:** goes through **Unit** to a deposit address made for the user's Hyperliquid account. It arrives
     in about a minute as spot SOL. The app swaps it to USDC on Hyperliquid's spot market and moves it to
     the perps account; the user signs both.
   - **USDC:** goes through **Across**, straight to the Hyperliquid account. (USDC sent to Unit's Solana
     address is lost: Unit only accepts SOL, FARTCOIN and PUMP there.)
3. **Approve once.**
   - **The builder fee:** an `approveBuilderFee` signature from the main wallet, with a maximum the user can
     revoke at any time.
   - **An agent key for one-click trading:** made in the browser and approved by the main wallet. It can
     place and cancel orders but never withdraw, the same idea as the session keys in the original brief.
4. **Trade.** Long or short with leverage up to each market's maximum. Order types: market (an
   immediate-or-cancel order with a slippage cap), limit, and take profit / stop loss. Margin is isolated or
   cross. Every order carries Coinside's builder code.
5. **Withdraw to Solana.** Swap USDC to SOL on Hyperliquid's spot market, then withdraw through Unit to the
   user's Solana address.

## Architecture

- **web (Next.js):** keeps the design system and most components (markets, terminal, chart, order panel,
  positions, portfolio).
  - **Market data:** read from Hyperliquid's public info API and WebSocket.
  - **Orders:** signed in the browser and sent to Hyperliquid. No Coinside server ever touches a user's key
    or funds.
- **api (Fastify):** small.
  - Referrals, the leaderboard and the weekly competition, built from Coinside's builder fills.
  - The IDR rate for showing values in Rupiah.
  - The geo-gate, and analytics.
- **worker:** builder fee and volume reports, competition payouts, alerts.
- **SDK:** `@nktkas/hyperliquid` (TypeScript, 0.33.3, maintained), evaluated in H1 against the official docs.
- **Retired:**
  - `programs/vault`, the engine, the price indexer and the risk engine;
  - the ledger, pool, position and balance-root database models;
  - lamport money math. Hyperliquid works in decimal strings: sizes have per-market decimals (`szDecimals`),
    and prices follow its significant-figure rules.

  Everything retired is archived on a branch and tag (`own-pool-design`) before it leaves the main tree.

- **Hosting and deploys:** unchanged (the same VPS, Nginx, PM2 and `coinside-deploy`).

## Phases

Each phase ends with a report and stops for ALFA, as before.

- **H0. Decisions and the new brief.** The decisions below, then `CLAUDE.md` rewritten for this design.
- **H1. Live markets from Hyperliquid (read only).**
  - **What it shows:** markets, prices, 24h change, funding, open interest, candles and the order book.
  - **The site:** coinside.fun shows real mainnet data and stays pre-launch for trading.
  - **Done when:** every listed perp market shows, prices match app.hyperliquid.xyz, and updates arrive
    within a second over the WebSocket.
- **H2. Wallet and account (read only).** Connect, then show the Hyperliquid balances, positions, open orders
  and fills of the connected account.
- **H3. Trading on Hyperliquid testnet.**
  - **Scope:** approve the builder fee and the agent key; market, limit, take profit / stop loss; close;
    leverage; clear error messages; Hyperliquid's rate limits.
  - **Done when:** a scripted end-to-end run on testnet passes and the builder fee shows on the fills.
- **H4. Deposits and withdrawals from Solana.**
  - **Scope:** Unit (SOL) and Across (USDC), with status tracking, limits, and handling when a transfer is
    late or fails.
  - **Done when:** it works with small real amounts on mainnet (the bridges may have no testnet).
- **H5. Mainnet launch.**
  - **Prerequisites:** a funded builder account, geo-blocking, terms and a plain risk disclosure, and
    monitoring.
  - **Rollout:** a small beta first.
- **H6. Growth.** Indonesian language and Rupiah values, referrals, the weekly competition, share cards, and
  copy trading (it needs its own design, because followers' orders must be signed by their own keys).

## Revenue

Coinside earns the builder fee on every filled order. Phantom charges 0.05% and reported about $20M in builder
fees on about $37B of volume in under a year. As an illustration, $1M of daily volume at 0.05% is $500 a day.

## Decisions for ALFA

1. **Builder fee.** 0.05% (Phantom's level) or lower to compete. The cap is 0.1%.
2. **Builder wallet.** An EVM address that ALFA controls, ideally a hardware wallet. Hyperliquid requires the
   builder to hold a minimum balance (100 USDC in its perps account as of 2025; to be checked).
3. **Wallets.**
   - **Option A:** at first, only wallets that also have an EVM address (Phantom, Backpack). No third party.
   - **Option B:** an embedded wallet provider such as Privy, so any Solana wallet works. Costs money and
     adds a vendor.
4. **Legal and geo-blocking.** Which countries are blocked. Hyperliquid's own restrictions apply, and Phantom
   blocks the US and the UK. A legal review is still needed: this is leveraged trading.
5. **Languages at launch.** Indonesian and English?
6. **Why users pick Coinside** over Phantom and the other Hyperliquid apps. For example: Indonesian first,
   Rupiah values, simpler screens for beginners, competitions and copy trading.
7. **The original design.** Archive it on a branch and tag after H1 (recommended), or delete it.

## What is needed to continue

- **Allowed domains for the development session:**
  - `api.hyperliquid.xyz` and `api.hyperliquid-testnet.xyz` (REST and WebSocket);
  - `hyperliquid.gitbook.io` (docs);
  - `api.hyperunit.xyz` and `docs.hyperunit.xyz` (Unit);
  - Across's API, in H4.
- **To verify against the official docs** once they can be read: the builder fee units in the order action,
  the builder's minimum balance, the approval flows, and Unit's deposit address API and minimums.

## Sources

- Builder codes: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes
- Builder fees explained: https://hyperliquidguide.com/guides/trading/hyperliquid-builder-fees-explained
- Phantom Perps review (fee, isolated margin, US and UK blocked): https://www.datawallet.com/crypto/phantom-perpetuals-review
- Phantom builder revenue: https://cryptobriefing.com/phantom-20m-builder-code-revenue-hyperliquid/
- Unit (deposits from Solana): https://docs.hyperunit.xyz/llms-full.txt
- Hyperliquid FAQ on Solana deposits: https://hyperliquid.gitbook.io/Hyperliquid-docs/support/faq/deposit-or-transfer-issues-missing-lost/deposited-via-solana-network
- Across, Solana to Hyperliquid: https://across.to/blog/solana-to-hyperliquid-the-cross-ecosystem-traders-bridge
- The frontend competition on Hyperliquid: https://blockworks.com/news/hyperliquid-the-frontend-wars

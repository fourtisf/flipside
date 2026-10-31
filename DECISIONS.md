# Decisions

Choices made while building that CLAUDE.md does not cover, or where it had to be interpreted. Newest phase
first. Anything in CLAUDE.md section 16 is not decided here; it is asked.

## Name: Coinside, at coinside.fun (ALFA, 29 Oct 2026)

Section 16, decision 1. Flipside was the working name; its domains were taken. Coinside reads as the product
itself (pick a coin, pick a side) and is the hero line "Every coin has two sides. Pick one." ALFA chose
`coinside.fun` over `coinside.trade`.

- Renamed everywhere before anything ships: UI copy and page titles, `prototype.html` (only the name, so the
  side-by-side check still compares like with like), workspace packages (`@coinside/*`), the Anchor program
  (`coinside_vault`), the signing and leaf prefixes in the brief (`coinside:withdraw`, `coinside:leaf`), the
  referral cookie (`coinside_ref`), env paths and docs. The GitHub repository is still `fourtisf/flipside`;
  renaming it is ALFA's call in GitHub settings.
- The example referral link reads `coinside.fun/r/<code>`.
- Logo concepts p / d and Flipped F depended on the old name and were dropped; the other four carry the new
  wordmark.
- Worth securing before launch: `coinside.trade` and `coinside.xyz` (so nobody phishes with them), the X handle,
  and allowlisting the domain with wallet security services so Phantom shows no warning on connect.

## An empty account: deposit first (31 Oct 2026)

The first real try on coinside.fun: Enable trading answered "Must deposit before performing actions". Hyperliquid
refuses every action, approving a trading key too, from an address that has never deposited.

- **The order button says so before anyone signs:** once the account is read and has nothing in it (no perps
  value, no positions, no spot balance), the button reads "Deposit first" instead of "Enable trading". It moves
  on by itself when the deposit arrives over the socket. While the account isn't read yet, nothing is blocked.
- **Deposits stay on Coinside, in the person's own account (ALFA: "jangan diarahkan ke Hyperliquid, harus ke
  Coinside aja depositnya" and "harusnya diarahkan ke akunnya lewat Coinside").** A first version linked to
  Hyperliquid's Deposit page; ALFA rejected it. "Deposit first" and Deposit in the wallet menu now go to
  `/portfolio#deposit`: a Deposit panel in the person's Portfolio, with no link to any other site.
- **The Deposit panel (H4, part 1):** step 1 is the personal SOL deposit address from Unit, which shows only after
  the guardian signatures on it are checked; that check needs Unit's published keys and message format, so step 1
  waits for `docs.hyperunit.xyz` to be reachable from the build environment. Step 2 works now: SOL arrives as
  USOL, and "Move to trading balance" sells the free USOL on USOL/USDC (immediate or cancel, 1% under the mid,
  signed by the trading key) and moves the free spot USDC to perps (`usdClassTransfer`, signed by the wallet),
  rounded down to the cent. Trading has to be enabled first when there is USOL to sell, since orders are signed
  by the trading key.
- Hyperliquid's message, if it still comes, reads "Your account is empty. Deposit first, then enable trading."

## Coinside charges no fee (ALFA, 31 Oct 2026)

ALFA: "semuanya free, jadi Coinside tidak memungut biaya apapun, fee trading dll". This answers decisions 1 and 2
in `PLAN-HYPERLIQUID.md`: no builder fee, so no builder wallet is needed.

- **Removed, not just switched off:** the builder-fee settings (`NEXT_PUBLIC_BUILDER_ADDRESS`,
  `NEXT_PUBLIC_BUILDER_FEE`), the `approveBuilderFee` step and the builder code on orders are gone from the code,
  so no setting can turn a fee on by mistake. Enabling trading is one wallet signature. Tests check that no order
  carries a builder code.
- **Said plainly:** the order panel has a "Coinside fee: Free" row, the Enable trading dialog says Coinside
  charges no fee, and the docs say users pay only Hyperliquid's own trading fee and the bridges' network fees,
  which Coinside doesn't set or receive. Each trade's Hyperliquid fee already shows in Portfolio.
- **What it means:** Coinside earns nothing from trading. A fee later would need every user to approve it with
  one more signature. Hyperliquid publishes builder fills only for orders with a builder code, so the leaderboard,
  referrals and competition will need another way to tell which trades came through Coinside.

## H3: trading on mainnet (31 Oct 2026)

ALFA: "saya ingin ke mainnet bisa trading". The plan had H3 on testnet first; ALFA chose mainnet. To keep that
safe:

- **A trading key, approved once.** Enable trading makes a key in the browser and the wallet signs one
  `approveAgent` (Hyperliquid's API-wallet mechanism), on the wallet's own chain. Orders, cancels and leverage
  changes are then signed by that key, with no pop-up each time. Hyperliquid never lets such a key withdraw or
  transfer funds. The key is stored in this browser per wallet; the wallet menu turns it off. A key Hyperliquid no
  longer knows is forgotten, and the button asks to enable again.
- **A risk notice before the first trade**: a checkbox that the person understands leveraged trading can lose the
  whole margin and is allowed to trade perpetual futures where they live, naming that Hyperliquid isn't available
  in the United States. This is not geo-blocking (decision 4 is still open) and needs legal review.
- **Orders** (`src/trade/orders.ts`): market orders are immediate-or-cancel limit orders 1% through the price;
  limit orders rest (good till cancelled); take profit and stop loss are reduce-only market triggers grouped with
  the order. Prices and sizes use the SDK's `formatPrice` and `formatSize` (5 significant figures, the market's tick
  and lot, truncated). Leverage is set before each order (cross margin, isolated where a market requires it).
  Close is a reduce-only immediate-or-cancel order for the whole position; Cancel cancels by order id. Hyperliquid's
  error messages come back in plain words.
- **Limits while trading is new**: one order can open at most a $1,000 position (`NEXT_PUBLIC_MAX_ORDER_USD`), and
  Hyperliquid's own $10 minimum is checked before sending. `NEXT_PUBLIC_TRADING=off` turns trading off at the next
  deploy.
- **Builder fee:** none. ALFA decided Coinside charges no fee (see "Coinside charges no fee" above).
- **Checked without the network**: the trading key's signature on an order recovers to the key under Hyperliquid's
  L1 scheme, and the wallet's `approveAgent` signature (made through `eth_signTypedData_v4`) recovers to the
  wallet, in unit tests with real keys. The e2e suite drives the whole flow with a pretend wallet and a pretend
  Hyperliquid that records every signed action. Not yet run against the real exchange: the first real trades
  should be small.

## H2: connect a wallet, read the Hyperliquid account (31 Oct 2026)

ALFA: "harus tambahkan fitur connect wallet dan tambahkan beberapa wallet, setiap wallet harus punya logonya
masing-masing". That answers decision 3 in `PLAN-HYPERLIQUID.md`: connect wallets directly, several of them, with
no embedded-wallet provider (Privy).

- **Wallets** (`src/wallet/catalog.ts`): Phantom and Backpack first (the Solana wallets our users have, both with an
  EVM account), then MetaMask, Rabby, OKX Wallet, Coinbase Wallet, Rainbow, Trust Wallet and Zerion. A
  Hyperliquid account is an EVM address, so Solana-only wallets (Solflare) can't hold one; the dialog says so.
- **Logos**: each wallet's own mark, from `@web3icons/core` 4.0.58 (MIT), as static files in `public/wallets`.
  The marks are their owners' trademarks, used only to name each wallet. Any other wallet that announces itself
  shows its own icon.
- **Finding wallets**: EIP-6963, the standard that lets every installed wallet announce itself, so two wallets
  never fight over `window.ethereum`; an old-style `window.ethereum` is the fallback. Installed wallets are listed
  first and connect; the rest link to their download page, or on a phone open Coinside inside the wallet's app
  (Phantom, MetaMask, OKX, Coinbase and Trust have documented links for that).
- **Connecting reads the address only** (`eth_requestAccounts`). Nothing is signed until trading opens (H3). The
  wallet used last reconnects on the next visit without a prompt (`eth_accounts`), and switching account inside
  the wallet follows along. Disconnect forgets it on this site.
- **The account, read only** (`src/wallet/account.ts`): a snapshot from the info API, then live updates over the
  WebSocket (clearinghouse state, spot balances, open orders, fills). The header shows the account value next to
  the address; the order forms show what is available; Portfolio shows the account value, withdrawable, unrealized
  P&L, margin used, open positions, open orders, spot balances and the last 50 trades.
- **Not yet**: WalletConnect (connecting a phone wallet by QR code) needs a project id from Reown that ALFA would
  register; until then, phones use the wallet apps' own browsers.

## H1: live Hyperliquid markets on coinside.fun (30 Oct 2026)

ALFA said to start ("ok mulai semuanya"). H1 is read only, so it needed none of the open decisions in
`PLAN-HYPERLIQUID.md`. What was chosen along the way:

- **The live edition replaces the pre-launch edition.** `lib/edition.ts` now has `live` (the default build,
  coinside.fun) and `prototype`. The flag is `LIVE`, because the edition stays when trading opens. The
  pre-launch branches inside the prototype's components were removed, so they are back to the approved port
  exactly; the live pages are their own components (`components/live/`) on the same design system.
- **The browser reads Hyperliquid directly**, with `@nktkas/hyperliquid` 0.33.3 over Hyperliquid's public info
  API and WebSocket. No Coinside server sits in between, so market data doesn't depend on ours, and the
  existing Nginx headers already allow it (no `connect-src` limit). A script Content-Security-Policy (deploy
  README, P3) must allow `https://api.hyperliquid.xyz` and `wss://api.hyperliquid.xyz`.
- **Data flow** (`src/hl/`): a snapshot of every perp market (`metaAndAssetCtxs`) on load and every 15 seconds,
  prices from the `allMids` channel in between, rendered at most 4 times a second. The terminal adds the
  market's live context, order book, trades and candles. Each subscription retries with backoff if it fails.
  Pages render on the client only: server rendering would make e2e results depend on whether the server can
  reach Hyperliquid.
- **Prices** show Hyperliquid's own precision: up to 5 significant figures, at most 6 minus `szDecimals`
  decimals, and the prototype's subscript-zero format under $0.001.
- **Markets page**: the hero keeps "Every coin has two sides. Pick one."; Quick trade (market picker, USDC
  margin, leverage, estimates, closed order button); a map of the 40 most traded markets, sized by 24h volume
  and colored by the 24h move clamped to ±10% (the prototype's ±30% over an hour suits memecoins, not BTC);
  top gainers, top losers and most traded; and all markets with price, 24h, volume, open interest, hourly
  funding and maximum leverage.
- **Terminal** (`/trade/SOL`; any case works and the URL takes Hyperliquid's spelling): price and stats with a
  funding countdown, a link to compare on Hyperliquid, the watchlist, candles from 1 minute to 1 day with the
  prototype's Short view, the order book and recent trades, and a closed order panel (market or limit, margin,
  leverage, take profit and stop loss as % of margin, estimates).
- **SOL is the default market** for the ticket, the terminal and `/trade`: Coinside is for Solana users.
- **Leverage buttons**: 2x, 5x and 10x where allowed plus the market's maximum, at least three.
- **Liquidation estimate**: for an isolated position, with maintenance margin at half the initial margin at
  the market's maximum leverage, before fees and funding. Labeled "about". To check against Hyperliquid's docs
  and testnet in H3.
- **Pool and Emergency withdraw** return 404 in the live edition (there is no pool or vault on Hyperliquid) and
  leave the nav, the tab bar and the footer. Portfolio and Leaderboard say what comes next. Docs describe the
  Hyperliquid model; its copy is a draft for ALFA, and states no fee until decision 1 is made.
- **Logos**: letter avatars only. Hyperliquid's own coin images would mean hotlinking another site's assets.
- **Tests**: unit tests for the transforms and formatting; the live e2e suite (`live.spec.ts`) serves fixtures
  in place of Hyperliquid's API and WebSocket (`hl-mock.ts`); Lighthouse runs on the live routes. axe found two
  issues on the terminal (the watchlist as a nested `aside`, and the stats row scrolling without keyboard
  focus), both fixed in the live edition.
- **Phones**: the hero column is `minmax(0,1fr)` below 1000px. With `1fr` the ticket's sparkline and amount
  input made the page 10px wider than a 390px screen and clipped the hero text, in the prototype too.

Verified on real data (CI run 5, 30 Oct 2026): the development sandbox couldn't reach Hyperliquid, so the check
runs in CI's "Live data" job instead. All 179 listed perps show; BTC 77,120 against a 77,119.5 mid, ETH 2,233
against 2,232.95, SOL 94.593 against 94.5955; 5 price messages in 5 seconds and 11 order book messages; 179 of 179
coins with a logo.

Hardening after review (ALFA: "pastikan semuanya berjalan lancar"):

- **CI had never run.** It ran on pushes to `main` and on pull requests, but the work lands on the default
  branch `claude/new-session-nptqr8`. It now runs on every push.
- **H1's done check runs in CI against the real Hyperliquid** (job "Live data", `e2e/real-hl.spec.ts`): the
  market count equals Hyperliquid's listed perps, BTC, ETH and SOL are within 0.5% of its mids, and allMids
  messages keep arriving. It also logs how often the order book is pushed. It is its own job because the market
  or Hyperliquid can make it fail.
- **Stale prices are called stale.** If nothing arrives from Hyperliquid for 45 seconds, the page stops saying
  "Live prices" and says it is reconnecting; the terminal shows the same notice. Coming back to a hidden tab
  refreshes at once.
- **Error pages**: a crash shows "Something went wrong" with Try again and Back to markets, not a blank screen.
- **k-markets** (kPEPE, kBONK) say "priced per 1,000 PEPE", in the terminal, the ticket and the docs.
- **Faster live data**, after the first CI run against the real Hyperliquid showed prices (BTC 77,266 shown vs
  77,265.5 mid) and the market count right, but `allMids` and the default order book arriving only about every
  5 seconds. Prices now come from `fastAssetCtxs` (mids and marks for the coins that changed, compressed), with
  `allMids` used only while it is silent for 10 seconds. The order book's top 5 levels come from the fast feed
  (twice a second) and the rest from the default feed. The last candle follows the live price between candle
  messages.
- **Coin logos** (ALFA: "setiap token harus ada logonya"): Hyperliquid's own icon for each market, served from
  coinside.fun at `/logos/<coin>` (`lib/logos.ts`). The web server fetches an icon once, renders it to a 64 px
  WebP with sharp (Next's image library, now a direct dependency) and keeps it for a day; browsers cache it
  too. It fetches only names Hyperliquid lists and looks for kPEPE under kPEPE and PEPE. A coin without an icon
  keeps its letter avatar. The "Live data" CI job counts how many coins have one and logs why any are missing.
  The first version served the SVGs as they were with a 100 kB cap: 161 of 179 coins had a logo, and the 18
  without were mostly memecoins, whose icons are large pictures wrapped in SVG. Rendering to WebP makes every
  icon a few kilobytes and means no SVG from elsewhere is served from our domain. Two more fixes, from the CI
  logs: the render density follows each SVG's size (a fixed density pushed Hyperliquid's 5,000-unit BTC
  canvas past sharp's pixel limit), and sources up to 10 MB are accepted (HMSTR's is a 3.1 MB SVG). That left
  PEOPLE, which Hyperliquid has no icon for, so coins without one get CoinGecko's: the exact ticker with the
  best market-cap rank in its public search, images from coingecko.com only, rendered the same way. The footer
  credits CoinGecko.
- **Known cost**: each build carries both editions' code, because the edition flag is not folded away across
  modules, so the live pages ship about 15 to 20 kB (gzipped) of prototype code. Archiving the original design
  (`PLAN-HYPERLIQUID.md`, decision 7) removes it.

## Direction: Coinside as a Hyperliquid builder (30 Oct 2026, proposed)

ALFA asked whether Coinside could work like Hyperliquid with Hyperliquid as the market maker, then chose that
direction. It removes the parts that made the original design slow and risky for ALFA:
- the seed capital for the pool;
- the pool's losses when traders win;
- a vault program holding users' SOL, which needs an external audit;
- building an engine and a risk engine.

Coinside becomes an app on Hyperliquid's order book that earns a builder fee on each order. Solana users
deposit SOL through Unit or USDC through Across. The cost is the "any token by contract address" feature and
a crowded field (Phantom already offers Hyperliquid perps in its wallet).

The plan, phases and open decisions are in `PLAN-HYPERLIQUID.md`. `CLAUDE.md` now points to it and is rewritten
once the decisions are made. Nothing in the original design is deleted yet; it is archived on a branch and tag
(`own-pool-design`) when it leaves the main tree.

## Pre-launch edition: no paper SOL, no trading until it is real (30 Oct 2026)

ALFA asked to remove "Claim paper SOL" and make everything mainnet. Real-money trading needs the engine, the
vault program and the external audit (P2 to P6), so it can't be switched on. Asked how the site should look
until then, ALFA had no preference, so the recommended options apply:

- **coinside.fun serves a pre-launch edition** (`apps/web/src/lib/edition.ts`, the default build).
  - **No paper SOL or trading:** no Practice toggle, no "Claim 10 paper SOL", no wallet button. The header
    says "Trading opens soon", and the ticket and terminal order buttons are disabled with the same words.
  - **Hidden, because it is trading activity that doesn't exist:** the trade tape, protocol stats, Live
    trades, Top wins, the "Long vs short" column and Most shorted.
  - **Kept, because it is market data P1 makes real:** the market map, Hot, Big caps, the markets table, the
    charts and the coin stats. Most liquid replaces Most shorted.
  - **Pages with nothing real yet:** Portfolio, Pool, Leaderboard and Emergency withdraw keep their heading
    and say when they open.
  - **Copy:** the footer and the hero badge say prices are simulated and trading isn't open.
- **Practice is hidden from visitors, not deleted.** The engine keeps a paper mode because P2's check needs it:
  a 24-hour run with simulated traders must keep the books balanced before any real SOL is touched. The Docs
  page drops its Practice sentence in the pre-launch edition.
- **The prototype edition stays** (`build:prototype`, into `.next-prototype`): the full simulated UI the e2e
  flows, the side-by-side check against `prototype.html` and development use. CI builds both. The e2e suite
  runs the flows on the prototype edition and `prelaunch.spec.ts` on the pre-launch edition. Lighthouse
  accessibility is 100 on every route in both.
- At launch the trading UI comes back in Real mode only, wired to the engine; that is P6 work.

## Removing the other apps from the server (30 Oct 2026)

ALFA asked to delete everything on the VPS except Coinside: uspad, divvy (four users and a backup job),
mochibo, and leftovers from ambervale and balast. `deploy/remove-other-apps.sh` does it in a way that can be
undone:

- It shows the plan by default. It only deletes with `--yes`, after stopping the apps and writing everything
  it removes to one root-only archive (`pg_dumpall`, the Redis dump, home folders, configs, crontabs,
  certificates). If the archive can't be written and read back, nothing is deleted.
- It finds the other apps instead of naming them, so it doesn't depend on a hand-made list. App accounts are
  users with a home in `/home`, or ordinary user IDs with a login shell. The first rehearsal also caught
  system accounts with high IDs (a build system's), which is why service accounts are left alone.
- It keeps anything a package installed, Ubuntu's own backups, the PostgreSQL and Redis servers (Coinside
  needs them in P2), SSH, the firewall and root's hidden files. It deletes only inside a fixed list of
  folders.
- Nginx goes first and is tested; if Nginx fails without the other sites, they are put back and nothing else
  is removed.

Rehearsed against a copy of the server's layout:
- **What it removed:** app users with running processes, an app under root's PM2, systemd services, cron
  files, an Nginx site, databases with data, a table an app left in the shared `postgres` database, Redis
  keys, and leftover folders.
- **What survived:** Coinside kept serving.
- **The backup:** restoring it brought back the database rows and files.
- **Bugs the rehearsal found, all fixed:** the stash could overwrite a same-named Nginx file; tar failed with
  no files to archive; a partial archive was readable by everyone; a table owned by an app survived.

## Audit and fixes (30 Oct 2026)

ALFA asked for the pending decisions to be applied and for a careful audit. Dependencies were checked with
`pnpm audit`, and the code had an independent review (money math, rules, API, services, web routes, deploy
scripts, Nginx). Every finding was checked against the code before it was fixed.

### Next.js 15 instead of 14 (security)

The brief pins Next.js 14 (section 3). `pnpm audit` reported 37 known vulnerabilities, 25 of them in Next.js,
including three critical remote-code-execution advisories in the image optimizer and on Windows hosts. All
are fixed only in Next 15.5.x: Next 14 no longer gets security fixes. So the web app moved to **Next.js
15.5.28 with React 19.3.1**, from the coordinated security release of 14 Oct 2026.

- Exposure before the upgrade was low. The app uses no `next/image`, Server Actions, middleware or
  rewrites, and the host is Linux. The image optimizer endpoint (`/_next/image`) existed anyway, so it is
  now off in `next.config.mjs` (`images.unoptimized`) and closed in Nginx (404).
- Migration: route `params` are awaited (`/trade/[mint]`, `/r/[code]`), and the `JSX` type is imported
  from React. Nothing visual changed: all 12 views match the prototype's page heights, and the e2e suite,
  which fails on any console or hydration error, passes.
- `next lint` is deprecated in 15.5 and removed in 16. Move to the ESLint CLI before any Next 16 upgrade.
- Vitest 3 to **4.1.12** (critical advisories in its `tinypool` dependency, and two in its mocker). Test-only.
- pnpm overrides pin patched versions of transitive packages: `postcss` (Next still ships 8.4.31), `glob`
  (eslint-config-next), `deepmerge-ts` (Prisma config) and `esbuild` (tsup). `pnpm audit` now reports no
  known vulnerabilities.

### Review findings, fixed

- **Rules accepted risky overrides.** Integers took `0x64`, `1e2` and `0b11`; now plain decimal only.
  `LEV_TIERS` and `MAX_WIN_TIERS` accepted swapped or duplicate tiers, so `10:0,2:500` would have given the
  thinnest coins 10x. Tiers must now rise with their minimum.
- **`toPriceScaled` turned prices below 10^-18 into 0**, which only failed later, inside position math. It
  now throws at the boundary.
- **The Docs page hardcoded about 20 rule numbers.** They are now written from the rules the engine enforces
  (`apps/web/src/lib/docs-copy.ts`). A test proves the default rules give the prototype's copy word for word.
  From P1 the page passes the live `GET /api/rules` (section 14).
- **Two copies of the health payload** (the API's and the other processes'). `coinside-deploy` reads
  `release` from it, so it is now built in one place (`healthBody` in `@coinside/core/node`).
- **Deploy script.** A manual rollback now marks the release it leaves, so a later rollback can't return to
  it. If switching back after a failed deploy also fails, the script now says the site may be down, instead
  of exiting with a bare line number.
- **Nginx comment without a rule.** `/_next/image` is now really closed.
- **Hardening.** CI runs with a read-only token. The API trusts `X-Forwarded-For` from loopback only (Nginx),
  so it sees the visitor's address, which per-IP rate limits need in P2. The git history has no secrets:
  no keys, no env files, and the Helius key never entered the repository.

### Decisions ALFA approved (30 Oct 2026)

- **Logo: Two sides** (brand concept 4). It is used for the header and footer mark, `icon.svg`, `favicon.ico`
  (16, 32 and 48 px) and a 180 px `apple-icon.png` (full-bleed, since iOS rounds the corners itself).
- **`--t3` is `#858585`** (prototype `#6E6E6E`). `#6E6E6E` is under 4.5:1 on every surface. `#7C7C7C`, the
  first suggestion, still fails on the lightest panel (`#1A1A1A`, 4.17:1). `#858585` passes on all of them
  (4.72:1 or more). Lighthouse accessibility is now 100 on every route at mobile and desktop.
- **TradingView credit** in the footer ("Charts by TradingView", linked), as the chart library's license
  requires.
- **Hero badge** reads "Preview with simulated data" until P1 brings real prices, then goes back to the
  prototype's "Live on Solana mainnet". The footer already said the data is simulated.

## Deployment: P0 preview on coinside.fun (29 Oct 2026)

ALFA asked to put the build on the Hostinger VPS now. CLAUDE.md section 13 sets the stack (PM2, Nginx,
Certbot); these are the choices around it. Runbook: `deploy/README.md`.

- **Release directories and a `current` symlink.** Each deploy installs and builds in
  `/srv/coinside/releases/<UTC time>-<commit>` while the live release keeps serving, then switches
  `current` with one atomic rename and reloads PM2. PM2 starts every process through the `current` path,
  so a reload or a reboot always runs the live release. Rollback is a symlink switch, with no rebuild.
- **Health-gated, with automatic rollback.** A deploy only counts if every process is online on the new
  release, answers its health check, and doesn't restart for 10 seconds. Otherwise the previous release
  goes back. Health payloads now carry `release` (`COINSIDE_RELEASE`, `dev` outside the server) so the
  check knows which build answered. Rehearsed in a container: build failure, failed health check, crash
  loop, broken PM2 config, manual rollback and reboot all left the previous release live.
- **web and api run as two PM2 cluster workers each.** A reload replaces them one at a time. Rehearsal
  under steady traffic: zero failed requests during deploys and rollbacks, against about 0.7 s of 502s per
  deploy with one API process. The engine stays a single fork-mode process (section 6); indexer and worker
  are single fork-mode processes too.
- **Build on the server, with checks.** `pnpm install --frozen-lockfile`, then typecheck and unit tests
  (skippable for urgent fixes), then the build. CI only runs on `main` and on pull requests, and this work
  is on a branch, so the server checks too.
- **Environment in `/etc/coinside/coinside.env`**, owned by root and readable by the `coinside` group only.
  The setup script writes it from `.env.example` with production values and fresh random secrets, and never
  overwrites it. `ecosystem.config.cjs` parses it with Node's own `.env` parser on every reload; the deploy
  script uses the same parser for the build. `APP_URL` is now declared in `turbo.json`, because Turborepo's
  strict environment mode was keeping it from `next build` (`metadataBase` fell back to localhost).
- **One unprivileged `coinside` user** owns the releases and runs PM2, started by a systemd unit in the repo.
  The brief wants keypairs readable only by the engine and worker; separate Unix users for those two come
  with the keys in P3.
- **Nginx.** Mozilla intermediate TLS (1.2 and 1.3), HSTS for a year without preload, www to the bare domain,
  and unknown host names dropped. WebSocket upgrade on `/ws`, and 60 requests per second per IP on `/api`
  (section 10's number) until the API's Redis limits exist. `X-Forwarded-For` is overwritten, not appended,
  because Nginx is the edge. Headers deny framing, which matters for one-click trading. No script CSP yet:
  Next needs nonces for that, which come with the wallet adapter in P3.
- **Certificate from Let's Encrypt over HTTP-01 (webroot)**, ECDSA, renewed by certbot's timer with an Nginx
  reload hook. The Nginx config stays exactly as committed; certbot never edits it. No OCSP stapling: Let's
  Encrypt shut OCSP down in 2025. The email address is optional, since Let's Encrypt no longer sends expiry
  emails.
- **Preview hygiene.** `X-Robots-Tag: noindex, nofollow` until launch, so search results never show
  simulated trades on the real domain.
- **Cloudflare later.** DNS stays at Hostinger for now. The brief puts Cloudflare in front; the real-IP
  snippet is ready (`deploy/nginx/snippets/coinside-cloudflare.conf`) and the runbook lists the steps.
- **Server hardening.** ufw (SSH rate-limited, 80, 443), fail2ban for SSH, daily unattended security updates
  without automatic reboots, swap. Key-only SSH is opt-in (`--harden-ssh`), because forcing it
  could lock out a password login.
- **Pinned versions.** When they are missing: Node 22 from NodeSource's signed apt repository and PM2 7.0.4
  (7.1.x is under two weeks old). pnpm always comes from `packageManager`, via corepack.

**The server is shared.** The VPS already serves another site (uspad), whose Nginx config is the default
server on port 80. The first setup run failed its Nginx test because Coinside's config claimed the default
server too. Nginx was never reloaded, so uspad kept running. The setup script now treats every server as
possibly shared:

- `coinside.fun.conf` never claims the default server. A separate catch-all site is enabled only when no
  other site has that role.
- Each Nginx site is tested as it goes in and disabled again if Nginx rejects it, so a bad Coinside config
  can never stop Nginx from restarting for everyone else.
- Coinside's ports come from the environment file (`WEB_PORT` is new). The setup script moves any port
  another program holds to the next free one and writes the Nginx upstreams from them.
  `coinside-deploy` checks the ports before switching.
- The firewall is never switched on over ports other programs serve publicly; those ports are listed instead.
- An existing Node 22 and an existing PM2 are reused; a different system-wide Node stops the script. The
  PM2 unit finds `pm2` through `env`, wherever npm put it.
- NodeSource is only added when the server has no NodeSource entry. The first run had added a second entry
  for the same repository with a different key path next to the server's own, and apt then refused to
  read its sources at all. The script now removes that duplicate (only the one whose key is in
  `/etc/apt/keyrings`) before its first `apt-get update`.
- On Nginx 1.24, `http2` is a property of the port, so enabling it for coinside.fun also offers HTTP/2 to the
  other sites on 443 (Nginx warns "protocol options redefined"). Browsers negotiate it; nothing to do.
- The time zone is no longer changed.

The rehearsal covered the shared case: another site as the default server, the broken config from the
first run already on disk, another program on port 3000, another app serving a public port, and the firewall
already on. The setup completed, uspad kept answering on HTTP and HTTPS, and Coinside deployed on port 3001.

Two bugs the rehearsal found in the P0 app, now fixed:

- `/r/[code]` redirected to `https://localhost:3000/` behind a proxy, because Next builds `req.url` from its
  own listen address. It now sends a relative `Location: /`.
- `/trade` was prerendered as a 307 with no `Location` header, which only worked for browsers that ran the
  page's JavaScript. It now redirects per request (`dynamic = 'force-dynamic'`).

A new e2e test asserts both `Location` headers while sending the headers Nginx forwards.

## P0. Scaffold and design system

### Token logos (ALFA's request, 29 Oct: every token must have its logo)

This overrides the prototype's letter-on-hue avatars.

- Every token avatar shows the token's logo: markets table, lists, tape, ticket, search, watchlist,
  terminal header, positions and history, pool exposure, live trades and top wins. Tokens that were only
  text now carry a small inline logo too: the leaderboard's best trades and the rug guard line in the feed.
- Market map tiles show the logo beside the ticker when both fit, above it when the tile is tall enough,
  and leave it out only on tiles too small for both. The ticker is never clipped to make room.
- If a token has no logo, or its image fails to load, the avatar falls back to the prototype's letter
  avatar, so a row is never blank.
- Toasts, the order panel's pause banner and other sentences keep the ticker as text.
- P0's coins are fictional, so their logos are 22 placeholder SVGs in `apps/web/public/tokens`.
- P1: the indexer reads each coin's image from Helius DAS (`content.links.image`, else the metadata
  JSON's `image`) into `Coin.logoUri` (added to the schema). The API hands the browser
  `/api/tokens/:mint/logo`, a proxy that fetches the image once, checks its type and size, re-encodes it
  as a small square raster and caches it. Browsers never load images from third-party hosts, and SVGs are
  never passed through, since an SVG can carry script.

### Stack and versions

| Piece | Choice | Why |
|---|---|---|
| Next.js | 15.5.28, React 19.3.1 | The brief pins Next.js 14; moved to 15 for security fixes (see Audit and fixes). |
| TypeScript | 5.9 | TypeScript 7 exists but Next and typescript-eslint need 5.x. |
| ESLint | 8.57 + typescript-eslint 8 | Chosen when `eslint-config-next@14` only supported ESLint 8; version 15 also supports ESLint 9. |
| Prisma | 6.19 | Stable `prisma-client-js` generator and engines; Prisma 7 changes the client and datasource model. Revisit before P2. |
| zod | 4 | Current major; schemas live in `packages/core/src/schemas.ts`. |
| Fastify | 5 + `@fastify/websocket` 11 | Current majors. |
| Charts | `lightweight-charts` 5.2 | The brief asks for TradingView lightweight-charts. |
| Treemap | `d3-hierarchy` 3, `treemapSquarify.ratio(1)` | Ratio 1 is the classic squarify the prototype implements by hand. |
| Tests | vitest 4 (unit), Playwright 1.63 (e2e) | Playwright is pinned to the version whose Chromium is preinstalled on our build machines; CI installs its own. |
| Node services | TypeScript run with `tsx` in dev, bundled with `tsup` for PM2 | Workspace packages ship TypeScript source, so services bundle them and Next transpiles them (`transpilePackages`). No per-package build step. |

### Styling: one global stylesheet, not CSS modules or Tailwind

The brief allows "plain CSS modules or Tailwind configured with the exact tokens". I ported the prototype's
`<style>` block rule for rule into `apps/web/src/app/globals.css`, kept in its compact one-rule-per-line form
and excluded from Prettier, so it can be diffed directly against `prototype.html`. That is the cheapest way to
match the prototype exactly and to keep matching it as the prototype changes. The only edits are listed in
the file's header comment (font variables, `a` instead of `button` for nav links, heading-level classes, a
valid `<dl>` sub-line, `aria-sort` placement, chart overlay classes). Splitting it into CSS modules later is
mechanical if we want component scoping.

### Fonts

Inter comes from `next/font/google`. Geist Mono comes from Vercel's `geist` package (`next/font/local`)
because Next 14's Google font list predated Geist Mono (kept on Next 15: same font files). Both are self-hosted at build time, so pages make no
runtime requests to Google. Same families as the prototype's Google Fonts link.

### Money in P0

The P0 UI runs on a mock engine (`apps/web/src/mock/sim.ts`, a port of the prototype's simulation). To keep
the "no floats in balances, fees or P&L" rule even in the mock, I wrote `packages/core/src/money.ts` and
`packages/core/src/rules.ts` now instead of in P2: all balances, stakes, margins, fees and P&L in the mock are
lamport `bigint`s and go through those helpers. Prices, percentages and the random walk stay floats because
they are display data. P2 extends `money.ts` (ledger entries, fixed-point prices from the indexer) rather
than starting it. `rules.ts` already resolves every env override and the engine logs its sha256 at boot.

Where the prototype's simulation and the brief's money rules disagree, the brief wins (CLAUDE.md preamble):

- Liquidation price shown in the order summary is `entry * (1 ∓ 1/lev)`. The prototype used `0.99/lev` there.
- Liquidation triggers at exactly `pnl <= -margin` and max win at exactly the cap. The prototype used 99.9%.
- Order summary "Position size" and "Max win" are rounded down, so the preview never overstates. This also
  matches what the prototype shows (its float math truncated 0.495 to 0.49).
- The 80/20 fee split rounds the pool's 80% up; the protocol gets the remainder.

### Behavior fixes to the prototype (no visual change)

- The wallet dialog clears its `returnValue` when it opens. In the prototype, pressing Escape after an
  earlier pick reconnected the previous wallet.
- The withdraw dialog pre-fills the balance without thousands separators. The prototype's `1,234.00`
  would parse as 1.
- Leaderboard, wins and the connected mock wallet use distinct fixture addresses, so a trader never appears
  twice on the leaderboard.

### Accessibility changes (no visual change)

Lighthouse accessibility was 96 to 97 on every route at mobile and desktop in P0 (`pnpm a11y`), and is 100
since `--t3` changed (see Audit and fixes). To get there:

- Panel headings on Portfolio, Pool and Emergency are `h2` elements that wear the prototype's `h3` style,
  and footer headings are `h2` with the `h4` style. The prototype skipped levels (h1 to h3, h2 to h4).
- Metric sub-lines are a second `<dd>` instead of a `<p>` inside `<dl>`.
- `aria-sort` sits on the column header, not on the sort button; table cells have `role="columnheader"`.
- Market map tiles that show text get their accessible name from that text ("Trade $KELP +4.1%"). Tiles
  narrower or shorter than 24 px are color only and not clickable (WCAG target size); those coins are still
  one tap away in search and the markets table.
- The tape is `role="marquee"` and its duplicated loop copy is `aria-hidden`.
- Search comboboxes set `aria-activedescendant`; the order panel is a labelled `role="group"`.

### Charts

`lightweight-charts` is styled to the prototype (grid #151515, mono axis labels, dashed 60s average, dashed
entry lines with "Your long 2x" labels as HTML overlays, last-price chip in the candle color with dark text,
crosshair with an OHLC readout, inverted price axis and swapped colors in Short view, no pan or zoom).
Known differences from the hand-drawn canvas: the library picks "nice" price steps (5 lines on desktop like
the prototype, 3 on a 390 px phone), candle bodies are slightly wider, and line widths are whole pixels.

The TradingView attribution logo on the chart is turned off to match the prototype. The library's license
requires attribution with a link to tradingview.com where users can see it; that is the footer's "Charts by
TradingView" on every page.

### Routes

- `/trade` redirects to the default coin, like the prototype's Trade button. `/leaders` redirects to
  `/leaderboard` (the prototype's view name).
- `/trade/[mint]` for a mint that is not in the fixtures is a 404 in P0. P1 resolves any pasted mint
  through the indexer.
- `/r/[code]` accepts `[a-z0-9_-]{2,32}`, lowercases it, sets an httpOnly `coinside_ref` cookie for 30 days
  and redirects to `/`.
- `/emergency` is new: same design system, shows the last balance proof, the time until emergency
  withdrawals would open, the user's claimable balance and proof, and a withdraw button that stays disabled
  until 72 hours pass without a root. It is wired to the API and program in P3.

### Wallets

P0 keeps the prototype's own "Connect a wallet" dialog with a mock connection. `@solana/wallet-adapter-react`
(Phantom, Solflare, Backpack) is wired in with Sign-In With Solana in P3, behind the same dialog, so the
design does not change.

### State and rendering

The mock engine lives in a React provider in the root layout, so it survives client-side navigation the way
the prototype's single page did. It is seeded, so the server render and the browser's first render are
identical; the e2e suite fails on any console error, which includes hydration mismatches. Lists the
prototype re-rendered only occasionally (Hot / Most shorted / Big caps every 4 seconds, table order on sort
or filter, watchlist order per coin, map layout on resize) keep that cadence, so rows never jump under the
pointer.

### Config

`.env.example` gained overrides for four rules the brief states but the template lacked:
`INSIDER_FUNDING_WINDOW_DAYS=7`, `COIN_LOSS_PAUSE_MINUTES=60`, `DEVIATION_GUARD_SECONDS=30` and
`PRICE_MIN_POOL_LIQ_SOL=25`, plus service ports and `LOG_LEVEL`.

### Vault program

`programs/vault` is an Anchor 0.32.1 scaffold with a placeholder program ID and a no-op `initialize`, checked
with `cargo check` in CI. This machine has Rust but not the Solana or Anchor CLIs, so `anchor build` and the
bankrun tests start in P3, with the real program keypair.

### Copy

No prototype copy changed except the product name (see Name, above), the hero badge during the preview and
the footer's TradingView credit (see Audit and fixes). New copy is limited to `/emergency` and the 404 page, in the same voice. The
footer still says "Prototype with simulated prices, trades and wallets. Nothing here moves real SOL.",
which is true in P0 and must change when real data arrives.

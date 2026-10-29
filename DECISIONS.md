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
  Next 14 needs nonces for that, which come with the wallet adapter in P3.
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
| Next.js | 14.2.35 (latest 14.x), React 18.3.1 | The brief pins Next.js 14. |
| TypeScript | 5.9 | TypeScript 7 exists but Next 14 and typescript-eslint need 5.x. |
| ESLint | 8.57 + typescript-eslint 8 | `eslint-config-next@14` only supports ESLint 8. |
| Prisma | 6.19 | Stable `prisma-client-js` generator and engines; Prisma 7 changes the client and datasource model. Revisit before P2. |
| zod | 4 | Current major; schemas live in `packages/core/src/schemas.ts`. |
| Fastify | 5 + `@fastify/websocket` 11 | Current majors. |
| Charts | `lightweight-charts` 5.2 | The brief asks for TradingView lightweight-charts. |
| Treemap | `d3-hierarchy` 3, `treemapSquarify.ratio(1)` | Ratio 1 is the classic squarify the prototype implements by hand. |
| Tests | vitest 3 (unit), Playwright 1.63 (e2e) | Playwright is pinned to the version whose Chromium is preinstalled on our build machines; CI installs its own. |
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
because Next 14's Google font list predates Geist Mono. Both are self-hosted at build time, so pages make no
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

Lighthouse accessibility is 96 to 97 on every route at mobile and desktop (`pnpm a11y`). To get there:

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

The TradingView attribution logo is turned off to match the prototype. The library's license requires
attribution with a link to tradingview.com somewhere users can see it. This needs a home before the site
is public (see the P0 report).

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

No prototype copy changed except the product name (see Name, above). New copy is limited to `/emergency` and the 404 page, in the same voice. The
footer still says "Prototype with simulated prices, trades and wallets. Nothing here moves real SOL.",
which is true in P0 and must change when real data arrives.

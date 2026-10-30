import type { MetaAndAssetCtxsResponse } from '@nktkas/hyperliquid/api/info';

/**
 * Hyperliquid perp markets as the app shows them. Hyperliquid sends every number as a decimal string;
 * these are parsed to floats for display only. Orders (H3) are built from the exchange's own strings and
 * rules (szDecimals, significant figures), never from these floats.
 */
/** The market the terminal and the ticket open on: Coinside is for Solana users. */
export const DEFAULT_MARKET = 'SOL';
export type PerpAssetCtx = MetaAndAssetCtxsResponse[1][number];

export interface Market {
  /** Hyperliquid's coin name, e.g. "BTC" or "kPEPE" (1,000 PEPE). Case matters. */
  name: string;
  /** Position in Hyperliquid's universe: the asset id an order names. */
  asset: number;
  /** Decimals a size may have. Prices may have at most 6 - szDecimals decimals. */
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
  /** Live price: the latest mid from the WebSocket, else the mid or mark from the last snapshot. */
  px: number;
  /** The price before the last change, so a changed price can flash. */
  prev: number;
  mark: number;
  oracle: number;
  /** Price 24 hours ago. */
  prevDay: number;
  /** 24h notional volume in USD. */
  volume: number;
  /** Open interest in USD (coins open times the mark price). */
  oi: number;
  /** Funding rate for one hour: 0.0000125 is 0.00125% an hour. Longs pay shorts when positive. */
  funding: number;
}

const num = (s: string | null | undefined): number => {
  const n = s == null ? NaN : Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** Change over 24 hours, 0.05 for +5%. */
export const change24h = (m: Pick<Market, 'px' | 'prevDay'>): number =>
  m.prevDay > 0 ? m.px / m.prevDay - 1 : 0;

/**
 * Zip Hyperliquid's universe with its asset contexts (same order, same length). Delisted markets are left
 * out. `mids` (from allMids) and `prior` (the markets already shown) keep the live price when a slower
 * snapshot arrives.
 */
export function toMarkets(
  [meta, ctxs]: MetaAndAssetCtxsResponse,
  mids: Record<string, string> = {},
  prior: Record<string, Market> = {},
): Market[] {
  const out: Market[] = [];
  meta.universe.forEach((u, asset) => {
    const ctx = ctxs[asset];
    if (!ctx || u.isDelisted) return;
    const mark = num(ctx.markPx);
    const px = num(mids[u.name]) || prior[u.name]?.px || num(ctx.midPx) || mark;
    out.push({
      name: u.name,
      asset,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
      onlyIsolated: !!u.onlyIsolated,
      px,
      prev: prior[u.name]?.prev ?? px,
      mark,
      oracle: num(ctx.oraclePx),
      prevDay: num(ctx.prevDayPx),
      volume: num(ctx.dayNtlVlm),
      oi: num(ctx.openInterest) * mark,
      funding: num(ctx.funding),
    });
  });
  return out;
}

/** Apply a context pushed for one market (activeAssetCtx). Returns false if nothing visible changed. */
export function applyCtx(m: Market, ctx: PerpAssetCtx): boolean {
  const mark = num(ctx.markPx);
  const next = {
    mark,
    oracle: num(ctx.oraclePx),
    prevDay: num(ctx.prevDayPx),
    volume: num(ctx.dayNtlVlm),
    oi: num(ctx.openInterest) * mark,
    funding: num(ctx.funding),
  };
  const changed = (Object.keys(next) as Array<keyof typeof next>).some((k) => m[k] !== next[k]);
  Object.assign(m, next);
  return changed;
}

/** Apply allMids. Returns the number of markets whose price changed. */
export function applyMids(markets: Market[], mids: Record<string, string>): number {
  let n = 0;
  for (const m of markets) {
    const p = num(mids[m.name]);
    if (p > 0 && p !== m.px) {
      m.prev = m.px;
      m.px = p;
      n++;
    }
  }
  return n;
}

/** Hyperliquid's coin names are case-sensitive ("kPEPE"); URLs and search shouldn't be. */
export function findMarket(markets: Market[], name: string): Market | undefined {
  const q = name
    .trim()
    .replace(/^\$/, '')
    .replace(/-(USD|PERP|USDC)$/i, '');
  return markets.find((m) => m.name === q) ?? markets.find((m) => m.name.toLowerCase() === q.toLowerCase());
}

/** The name people say: kPEPE is shown as "kPEPE", with the pair as "kPEPE-USD" like Hyperliquid. */
export const pair = (name: string) => `${name}-USD`;

/** The terminal for a market. */
export const marketHref = (name: string) => `/trade/${encodeURIComponent(name)}`;

/** The name for the letter avatar: kPEPE is PEPE (Hyperliquid's "k" means 1,000 units). */
export const tokName = (name: string) => name.replace(/^k(?=[A-Z])/, '');

/** "priced per 1,000 PEPE" for Hyperliquid's k-markets, whose price and size count thousands of coins. */
export const unitNote = (name: string): string | null =>
  /^k[A-Z]/.test(name) ? `priced per 1,000 ${tokName(name)}` : null;

/** The coin's icon, served by coinside.fun from Hyperliquid's set (lib/logos.ts). */
export const logoUrl = (name: string) => `/logos/${encodeURIComponent(name)}`;

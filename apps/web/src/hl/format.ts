/**
 * Display helpers for Hyperliquid markets. Display only: floats are fine here, orders (H3) never use them.
 */
import { M, priceParts, type PriceParts } from '@/lib/format';

/**
 * Decimals Hyperliquid shows for a price: up to 5 significant figures (whole numbers always in full), and
 * never more than 6 - szDecimals decimals, the exchange's own price rule for perps.
 */
export function pxDecimals(p: number, szDecimals: number): number {
  const cap = Math.max(0, 6 - szDecimals);
  if (!(p > 0)) return Math.min(2, cap);
  const sig = p >= 1 ? 5 - (Math.floor(Math.log10(p)) + 1) : 4 - Math.floor(Math.log10(p));
  return Math.max(0, Math.min(cap, sig));
}

/** A grouped number with exactly `d` decimals: "1,234.50". */
export const fixed = (p: number, d: number) =>
  p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** "97,124", "3,456.7", "0.012345": no currency sign, for axes, the order book and trades. */
export const pxText = (p: number, szDecimals: number): string => fixed(p, pxDecimals(p, szDecimals));

/** A price difference (the spread) with the decimals of the price it is measured at: 0.02 at $187.23. */
export const pxDiffText = (diff: number, px: number, szDecimals: number): string =>
  fixed(diff, pxDecimals(px, szDecimals));

/** A USD price for <Price>: "$97,124", or the subscript-zero format under $0.001 like the rest of the app. */
export function pxParts(p: number, szDecimals: number): PriceParts {
  if (p > 0 && p < 0.001) return priceParts(p);
  return { kind: 'plain', text: '$' + pxText(p, szDecimals) };
}

/** Hourly funding as Hyperliquid shows it: "+0.0013%", or "−0.0040%". */
export const fundingText = (f: number): string => (f >= 0 ? '+' : M) + Math.abs(f * 100).toFixed(4) + '%';

/** A size in coins: "0.00153", trimmed to the market's size decimals. */
export const szText = (s: number, szDecimals: number): string =>
  s.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: szDecimals });

/** A size in a column (order book, trades): always all of the market's size decimals, so digits line up. */
export const szCol = (s: number, szDecimals: number): string => fixed(s, szDecimals);

/** Time to the next hourly funding payment: "42:07". */
export function fundingCountdown(now: number): string {
  const left = 3_600_000 - (now % 3_600_000);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Leverage buttons for a market: 2x, 5x and 10x where allowed, then the market's maximum, padded with lower
 * steps so there are always at least three. 40 -> [2, 5, 10, 40], 10 -> [2, 5, 10], 5 -> [1, 2, 5].
 */
export function levChoices(max: number): number[] {
  const c = [2, 5, 10].filter((l) => l < max);
  c.push(max);
  const lower = [1, 2, 3].filter((l) => l < c[0]!);
  return [...lower.slice(Math.max(0, lower.length - (3 - c.length))), ...c].slice(0, 4);
}

/**
 * Estimated liquidation price for an isolated position opened at `entry`. Hyperliquid liquidates when the
 * margin left falls below the maintenance margin, which is half the initial margin at the market's maximum
 * leverage (so 1 / (2 * maxLeverage) of the position's value). Fees and funding move it slightly.
 */
export function liqPrice(entry: number, lev: number, maxLeverage: number, side: 'long' | 'short'): number {
  const l = 1 / (2 * maxLeverage);
  return side === 'long' ? (entry * (1 - 1 / lev)) / (1 - l) : (entry * (1 + 1 / lev)) / (1 + l);
}

/** Position size in coins for `usdc` of margin at `lev`, rounded down to the market's size decimals. */
export function sizeFor(usdc: number, lev: number, px: number, szDecimals: number): number {
  if (!(usdc > 0) || !(px > 0)) return 0;
  const f = 10 ** szDecimals;
  return Math.floor(((usdc * lev) / px) * f + 1e-9) / f;
}

type Level = { px: string; sz: string };

/**
 * One side of the order book from two feeds: the fast feed's top levels (5, twice a second) and, beyond them,
 * the slow feed's deeper levels (20, every 5 seconds). `dir` is 1 for asks (rising prices), -1 for bids.
 */
export function mergeSide(
  top: readonly Level[] | null,
  deep: readonly Level[] | null,
  dir: 1 | -1,
  n: number,
) {
  if (!top?.length) return (deep ?? []).slice(0, n);
  const edge = Number(top[top.length - 1]!.px);
  const beyond = (deep ?? []).filter((l) => (dir > 0 ? Number(l.px) > edge : Number(l.px) < edge));
  return [...top, ...beyond].slice(0, n);
}

export interface BookRow {
  px: number;
  sz: number;
  /** Size from the best price down to this level. */
  total: number;
  /** total / the largest total on either side, for the depth bar. */
  depth: number;
}

/** Order book rows with running totals, best price first. `max` is the larger side's total. */
export function bookSide(levels: ReadonlyArray<{ px: string; sz: string }>, n: number): BookRow[] {
  let total = 0;
  return levels.slice(0, n).map((l) => {
    const sz = Number(l.sz);
    total += sz;
    return { px: Number(l.px), sz, total, depth: 0 };
  });
}

/** Fill in depth bars against the deeper side, and the spread between the best bid and ask. */
export function withDepth(bids: BookRow[], asks: BookRow[]) {
  const max = Math.max(bids[bids.length - 1]?.total ?? 0, asks[asks.length - 1]?.total ?? 0) || 1;
  for (const r of [...bids, ...asks]) r.depth = r.total / max;
  const bid = bids[0]?.px;
  const ask = asks[0]?.px;
  const spread = bid !== undefined && ask !== undefined ? ask - bid : null;
  return { bids, asks, spread, spreadPct: spread !== null && ask ? spread / ask : null };
}

/**
 * Turns what someone typed into a Hyperliquid order, or says plainly why it can't be placed. Pure, so every rule
 * is unit tested: prices to Hyperliquid's 5 significant figures and tick, sizes rounded down to the market's lot,
 * the $10 minimum, the beta cap, and take profit / stop loss as reduce-only trigger orders. No order carries a
 * builder code: Coinside charges no fee.
 */
import type { OrderParameters, OrderSuccessResponse } from '@nktkas/hyperliquid/api/exchange';
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils';
import { pxText, szText } from '@/hl/format';
import type { Market } from '@/hl/markets';
import type { PositionRow } from '@/wallet/account';
import { MAX_ORDER_USD, MIN_ORDER_USD, SLIPPAGE } from './config';

export type Order = OrderParameters['orders'][number];
export type Side = 'long' | 'short';

export interface OpenInput {
  m: Market;
  side: Side;
  /** USDC of margin. */
  margin: number;
  lev: number;
  type: 'market' | 'limit';
  limit?: number;
  /** Take profit and stop loss as % of the margin, as the order panel asks for them. */
  tp?: number;
  sl?: number;
  /** What the account can use (withdrawable), when known. */
  available?: number;
}

export interface Plan {
  orders: Order[];
  grouping: 'na' | 'normalTpsl';
  leverage: { asset: number; isCross: boolean; leverage: number };
  /** For the confirmation: the size in coins and the price the order is sent at. */
  size: string;
  px: string;
  notional: number;
}

export type Planned = { ok: true; plan: Plan } | { ok: false; reason: string };

const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const fail = (reason: string): Planned => ({ ok: false, reason });

/** A price `frac` through `px` against the order: higher for a buy, lower for a sell. */
export const through = (px: number, isBuy: boolean, frac = SLIPPAGE) => px * (1 + (isBuy ? frac : -frac));

/** Where a take profit (+) or stop loss (−) set as a % of margin triggers. */
export const triggerAt = (entry: number, lev: number, side: Side, pctOfMargin: number) =>
  entry * (1 + ((side === 'long' ? 1 : -1) * pctOfMargin) / 100 / lev);

export function planOpen(i: OpenInput): Planned {
  const { m, side, lev } = i;
  const sz = m.szDecimals;
  if (!(i.margin > 0)) return fail('Enter an amount.');
  const ref = i.type === 'limit' ? (i.limit ?? 0) : m.px;
  if (!(ref > 0)) return fail(i.type === 'limit' ? 'Enter a limit price.' : 'No price yet. Wait a moment.');
  const notional = i.margin * lev;
  if (notional < MIN_ORDER_USD)
    return fail(
      `The position must be worth at least ${usd(MIN_ORDER_USD)}. Raise the amount or the leverage.`,
    );
  if (notional > MAX_ORDER_USD)
    return fail(`While trading is new, one order can open at most a ${usd(MAX_ORDER_USD)} position.`);
  if (i.available !== undefined && i.margin > i.available + 1e-9)
    return fail(`You have ${usd(i.available)} available. Deposit more or lower the amount.`);
  if (i.sl !== undefined && !(i.sl > 0 && i.sl < 100))
    return fail('Stop loss must be between 0% and 100% of the margin.');
  if (i.tp !== undefined && !(i.tp > 0)) return fail('Take profit must be above 0%.');

  const isBuy = side === 'long';
  let px: string;
  let size: string;
  try {
    px = formatPrice(i.type === 'market' ? through(ref, isBuy) : ref, sz);
    size = formatSize(notional / ref, sz);
  } catch {
    return fail(`That is too small for ${m.name}. Raise the amount.`);
  }
  const orders: Order[] = [
    {
      a: m.asset,
      b: isBuy,
      p: px,
      s: size,
      r: false,
      t: { limit: { tif: i.type === 'market' ? 'Ioc' : 'Gtc' } },
    },
  ];
  // take profit and stop loss close the position: the other side, reduce only, at market once triggered
  const exit = (pct: number, tpsl: 'tp' | 'sl'): Order => {
    const trigger = triggerAt(ref, lev, side, tpsl === 'tp' ? pct : -pct);
    return {
      a: m.asset,
      b: !isBuy,
      p: formatPrice(through(trigger, !isBuy), sz),
      s: size,
      r: true,
      t: { trigger: { isMarket: true, triggerPx: formatPrice(trigger, sz), tpsl } },
    };
  };
  if (i.tp) orders.push(exit(i.tp, 'tp'));
  if (i.sl) orders.push(exit(i.sl, 'sl'));
  return {
    ok: true,
    plan: {
      orders,
      grouping: orders.length > 1 ? 'normalTpsl' : 'na',
      leverage: { asset: m.asset, isCross: !m.onlyIsolated, leverage: lev },
      size,
      px,
      notional,
    },
  };
}

/** Close a whole position now: the other side, reduce only, immediate or cancel. */
export function planClose(p: PositionRow, m: Market): Order {
  const isBuy = p.side === 'short';
  return {
    a: m.asset,
    b: isBuy,
    p: formatPrice(through(m.px, isBuy), m.szDecimals),
    s: formatSize(p.size, m.szDecimals),
    r: true,
    t: { limit: { tif: 'Ioc' } },
  };
}

/** What happened to the main order, in a sentence. */
export function describe(res: OrderSuccessResponse, m: Market): string {
  const s = res.response.data.statuses[0];
  if (s && typeof s === 'object' && 'filled' in s)
    return `Filled ${szText(Number(s.filled.totalSz), m.szDecimals)} ${m.name} at $${pxText(Number(s.filled.avgPx), m.szDecimals)}.`;
  if (s && typeof s === 'object' && 'resting' in s)
    return 'Order placed. It fills when the price gets there.';
  return 'Order sent.';
}

/**
 * Hyperliquid's error messages, in words that say what happened and what to do. Unknown ones pass through,
 * since Hyperliquid's own wording is better than a guess.
 */
export function explain(message: string): string {
  const t = message.toLowerCase();
  if (t.includes('could not immediately match'))
    return 'The price moved before the order could fill. Nothing was bought or sold. Try again.';
  if (t.includes('insufficient margin'))
    return 'Not enough margin for this order. Lower the amount or the leverage.';
  if (t.includes('minimum value')) return `The position must be worth at least $${MIN_ORDER_USD}.`;
  if (t.includes('does not exist'))
    return 'Hyperliquid has no account for this wallet yet. Deposit first, then enable trading again.';
  if (t.includes('reduce only')) return 'There is no position to close on this market.';
  return message;
}

/**
 * Getting a deposit into the trading balance. SOL deposited from Solana arrives in the account's spot balance
 * as USOL (Unit's token on Hyperliquid), and orders use USDC in the perps balance. So the deposit becomes
 * tradable in two steps, both from Coinside:
 *
 * 1. Sell the USOL for USDC on Hyperliquid's USOL/USDC spot market (an immediate-or-cancel order 1% through the
 *    mid price, signed by the trading key).
 * 2. Move the spot USDC to perps (`usdClassTransfer`, which only the wallet can sign).
 *
 * Pure, so every rule is unit tested; the store sends what this plans.
 */
import type { SpotMetaAndAssetCtxsResponse } from '@nktkas/hyperliquid/api/info';
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils';
import type { SpotRow } from '@/wallet/account';
import { MIN_ORDER_USD, SLIPPAGE } from './config';
import type { Order } from './orders';

/** Unit's SOL on Hyperliquid. */
export const USOL = 'USOL';

/** Hyperliquid numbers spot markets from 10,000 in orders. */
const SPOT_ASSET_OFFSET = 10_000;

export interface SpotMarket {
  /** The pair's name in Hyperliquid's API, as in "@156". */
  pair: string;
  /** Its asset number in orders. */
  asset: number;
  /** Size decimals of the base token. */
  szDecimals: number;
  /** Mid price in USDC, when there is one. */
  px: number;
  /** The base token as spotSend names it ("USOL:0x…"). */
  token: string;
}

/** The canonical USOL/USDC market and its price, or null when Hyperliquid lists none. */
export function usolMarket([meta, ctxs]: SpotMetaAndAssetCtxsResponse): SpotMarket | null {
  const usol = meta.tokens.find((t) => t.name === USOL);
  const usdc = meta.tokens.find((t) => t.name === 'USDC');
  if (!usol || !usdc) return null;
  const u = meta.universe.find((p) => p.tokens[0] === usol.index && p.tokens[1] === usdc.index);
  if (!u) return null;
  const ctx = ctxs.find((c) => c.coin === u.name);
  const px = Number(ctx?.midPx ?? ctx?.markPx ?? 0);
  return {
    pair: u.name,
    asset: SPOT_ASSET_OFFSET + u.index,
    szDecimals: usol.szDecimals,
    px,
    token: `${usol.name}:${usol.tokenId}`,
  };
}

/** What a spot balance can move: the total less what open orders hold. */
export const free = (spot: SpotRow[] | null, coin: string) => {
  const b = spot?.find((r) => r.coin === coin);
  return b ? Math.max(0, b.total - b.hold) : 0;
};

/**
 * The sell order that turns all free USOL into USDC, or why it can't go. It sells at the best bid when the book
 * gives one (a small deposit sits close to Hyperliquid's $10 minimum, and 1% of slippage could push it under),
 * else 1% under the mid; and the $10 check uses exactly what Hyperliquid will check: the size after rounding
 * down to the lot, times the limit price.
 */
export function planSellUsol(
  spot: SpotRow[] | null,
  m: SpotMarket | null,
  bid?: number,
): { ok: true; order: Order; size: string } | { ok: false; reason: string } | null {
  const amount = free(spot, USOL);
  if (!(amount > 0)) return null;
  if (!m || !(m.px > 0))
    return { ok: false, reason: 'No USOL price from Hyperliquid yet. Try again in a moment.' };
  let size: string;
  let px: string;
  try {
    size = formatSize(amount, m.szDecimals);
    px = formatPrice(bid && bid > 0 ? bid : m.px * (1 - SLIPPAGE), m.szDecimals, 'spot');
  } catch {
    // less than one lot: a leftover crumb, not something to sell
    return null;
  }
  const value = Number(size) * Number(px);
  // a leftover crumb after a sale (under $1) is not a deposit waiting to move
  if (value < DUST_USD) return null;
  if (value < MIN_ORDER_USD)
    return {
      ok: false,
      reason: `Your USOL is worth $${value.toFixed(2)}, under Hyperliquid's $${MIN_ORDER_USD} smallest order, so it can't be sold yet. Deposit a little more SOL, then try again.`,
    };
  return {
    ok: true,
    size,
    order: { a: m.asset, b: false, p: px, s: size, r: false, t: { limit: { tif: 'Ioc' } } },
  };
}

/** Under this many dollars, USOL or USDC left in spot is a crumb, not worth a signature to move. */
export const DUST_USD = 1;

/** USDC to move from spot to perps, rounded down to the cent, or null when there is under $1. */
export function usdcToMove(spot: SpotRow[] | null): string | null {
  const cents = Math.floor(free(spot, 'USDC') * 100 + 1e-9);
  return cents >= DUST_USD * 100 ? (cents / 100).toFixed(2) : null;
}

/* ---------- withdrawing to Solana ---------- */

const solEnv = (v: string | undefined, fallback: number) => {
  const n = Number((v ?? '').trim() || fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
/**
 * The smallest withdrawal Coinside sends to Unit, in SOL. Unit doesn't pay out tiny amounts, and its published
 * limits weren't reachable from the build environment, so this matches its deposit minimum (0.12 SOL), which is
 * at least its withdrawal minimum (NEXT_PUBLIC_MIN_WITHDRAW_SOL to change it).
 */
export const MIN_WITHDRAW_SOL = solEnv(process.env.NEXT_PUBLIC_MIN_WITHDRAW_SOL, 0.12);
/** While withdrawals are new, the most one sends (NEXT_PUBLIC_MAX_WITHDRAW_SOL), like deposits. */
export const MAX_WITHDRAW_SOL = solEnv(process.env.NEXT_PUBLIC_MAX_WITHDRAW_SOL, 1);

const cents = (v: number) => Math.floor(v * 100 + 1e-9) / 100;
const centsUp = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;
const usd = (v: number) => `$${v.toFixed(2)}`;

/** The USDC a withdrawal can use: the trading balance's withdrawable amount plus free spot USDC. */
export const withdrawable = (perp: number, spotUsdc: number) =>
  cents(Math.max(0, perp) + Math.max(0, spotUsdc));

/** The smallest withdrawal in dollars at a SOL price: Unit's minimum and Hyperliquid's $10 order, bought 1% through. */
export const minWithdrawUsd = (px: number) =>
  centsUp(Math.max(MIN_WITHDRAW_SOL * px, MIN_ORDER_USD) * (1 + SLIPPAGE) + 0.01);
/** The largest, by the cap while withdrawals are new. */
export const maxWithdrawUsd = (px: number) => cents(MAX_WITHDRAW_SOL * px);

/**
 * Why `amount` dollars can't be withdrawn now, or null when it can. The same rules for the form (at the SOL price
 * shown) and for the store (at the USOL ask when it sends).
 */
export function withdrawProblem(amount: number, available: number, px: number): string | null {
  if (!(amount > 0)) return 'Enter an amount in USDC.';
  if (amount > available + 1e-9) return `You have ${usd(available)} to withdraw.`;
  if (!(px > 0)) return 'No SOL price from Hyperliquid yet. Try again in a moment.';
  const min = minWithdrawUsd(px);
  if (amount < min)
    return `Withdraw at least ${usd(min)}: Unit pays out ${MIN_WITHDRAW_SOL} SOL or more, and Hyperliquid's smallest order is $${MIN_ORDER_USD}.`;
  if (amount > maxWithdrawUsd(px) + 1e-9)
    return `While withdrawals are new, one can be at most ${MAX_WITHDRAW_SOL} SOL (about ${usd(maxWithdrawUsd(px))}).`;
  return null;
}

export interface WithdrawPlan {
  /** The buy of USOL with the USDC, immediate or cancel, 1% through the ask. */
  order: Order;
  /** USOL it buys. */
  size: string;
  /** USDC to move from the trading balance to spot first, or null when spot has enough. */
  toSpot: string | null;
}

/**
 * The steps that turn `amount` dollars of the account into USOL ready to send to Unit: move what spot lacks from
 * the trading balance, then buy USOL at most 1% over the best ask. The size rounds down to the lot, so the buy never
 * needs more USDC than was moved.
 */
export function planWithdraw(i: {
  amount: number;
  perp: number;
  spotUsdc: number;
  m: SpotMarket | null;
  ask: number;
}): { ok: true; plan: WithdrawPlan } | { ok: false; reason: string } {
  const ref = i.ask > 0 ? i.ask : (i.m?.px ?? 0);
  const problem = withdrawProblem(i.amount, withdrawable(i.perp, i.spotUsdc), ref);
  if (problem) return { ok: false, reason: problem };
  const m = i.m!;
  let px: string;
  let size: string;
  try {
    px = formatPrice(ref * (1 + SLIPPAGE), m.szDecimals, 'spot');
    size = formatSize(i.amount / Number(px), m.szDecimals);
  } catch {
    return { ok: false, reason: 'That amount is too small to buy SOL with. Withdraw a little more.' };
  }
  if (Number(size) < MIN_WITHDRAW_SOL)
    return { ok: false, reason: `Withdraw at least ${usd(minWithdrawUsd(ref))}.` };
  const need = centsUp(Number(size) * Number(px));
  const lack = centsUp(need - Math.max(0, i.spotUsdc));
  const move = lack > 0 ? Math.min(lack, cents(i.perp)) : 0;
  return {
    ok: true,
    plan: {
      order: { a: m.asset, b: true, p: px, s: size, r: false, t: { limit: { tif: 'Ioc' } } },
      size,
      toSpot: move > 0 ? move.toFixed(2) : null,
    },
  };
}

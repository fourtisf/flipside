/**
 * Trading settings, fixed per build (NEXT_PUBLIC_*), so changing one is an edit to the environment file and a
 * deploy.
 *
 * - NEXT_PUBLIC_TRADING=off turns trading off again: the order buttons go back to "Trading opens soon".
 * - NEXT_PUBLIC_MAX_ORDER_USD caps a single order's position size while trading is new (default $1,000).
 *
 * Coinside charges no fee (ALFA, 31 Oct 2026): orders carry no builder code, so the only trading fee is
 * Hyperliquid's own.
 */
const env = (v: string | undefined) => (v ?? '').trim();

export const TRADING = env(process.env.NEXT_PUBLIC_TRADING) !== 'off';

const cap = Number(env(process.env.NEXT_PUBLIC_MAX_ORDER_USD) || 1000);
export const MAX_ORDER_USD = Number.isFinite(cap) && cap > 0 ? cap : 1000;

/** Hyperliquid rejects orders worth less than this. */
export const MIN_ORDER_USD = 10;
/** A market order is an immediate-or-cancel limit order this far through the price. */
export const SLIPPAGE = 0.01;

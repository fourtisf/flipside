/**
 * Trading settings, fixed per build (NEXT_PUBLIC_*), so changing one is an edit to the environment file and a
 * deploy.
 *
 * - NEXT_PUBLIC_TRADING=off turns trading off again: the order buttons go back to "Trading opens soon".
 * - NEXT_PUBLIC_MAX_ORDER_USD caps a single order's position size while trading is new (default $1,000).
 * - NEXT_PUBLIC_BUILDER_ADDRESS and NEXT_PUBLIC_BUILDER_FEE turn on Coinside's builder fee (PLAN-HYPERLIQUID.md,
 *   decisions 1 and 2). The fee is in tenths of a basis point, Hyperliquid's unit: 50 is 0.05%, and Hyperliquid
 *   caps perps at 100 (0.1%). Unset, orders carry no builder fee.
 */
const env = (v: string | undefined) => (v ?? '').trim();

export const TRADING = env(process.env.NEXT_PUBLIC_TRADING) !== 'off';

const cap = Number(env(process.env.NEXT_PUBLIC_MAX_ORDER_USD) || 1000);
export const MAX_ORDER_USD = Number.isFinite(cap) && cap > 0 ? cap : 1000;

const builder = env(process.env.NEXT_PUBLIC_BUILDER_ADDRESS).toLowerCase();
const fee = Math.floor(Number(env(process.env.NEXT_PUBLIC_BUILDER_FEE) || 0));
/** The builder code to put on every order, or null when no fee is set. */
export const BUILDER: { b: `0x${string}`; f: number } | null =
  /^0x[0-9a-f]{40}$/.test(builder) && fee > 0 && fee <= 100 ? { b: builder as `0x${string}`, f: fee } : null;

/** "0.05%": the maximum the person approves, in Hyperliquid's approveBuilderFee format. */
export const builderFeePct = (f: number) => `${+(f / 1000).toFixed(4)}%`;

/** Hyperliquid rejects orders worth less than this. */
export const MIN_ORDER_USD = 10;
/** A market order is an immediate-or-cancel limit order this far through the price. */
export const SLIPPAGE = 0.01;

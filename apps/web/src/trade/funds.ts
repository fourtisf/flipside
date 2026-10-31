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
  return { pair: u.name, asset: SPOT_ASSET_OFFSET + u.index, szDecimals: usol.szDecimals, px };
}

/** What a spot balance can move: the total less what open orders hold. */
export const free = (spot: SpotRow[] | null, coin: string) => {
  const b = spot?.find((r) => r.coin === coin);
  return b ? Math.max(0, b.total - b.hold) : 0;
};

/** The sell order that turns all free USOL into USDC, or why it can't go. */
export function planSellUsol(
  spot: SpotRow[] | null,
  m: SpotMarket | null,
): { ok: true; order: Order; size: string } | { ok: false; reason: string } | null {
  const amount = free(spot, USOL);
  if (!(amount > 0)) return null;
  if (!m || !(m.px > 0))
    return { ok: false, reason: 'No USOL price from Hyperliquid yet. Try again in a moment.' };
  if (amount * m.px < MIN_ORDER_USD)
    return {
      ok: false,
      reason: `Your SOL is worth less than $${MIN_ORDER_USD}, Hyperliquid's smallest order. Deposit a little more.`,
    };
  let size: string;
  try {
    size = formatSize(amount, m.szDecimals);
  } catch {
    return { ok: false, reason: 'That amount of SOL is too small to sell.' };
  }
  return {
    ok: true,
    size,
    order: {
      a: m.asset,
      b: false,
      p: formatPrice(m.px * (1 - SLIPPAGE), m.szDecimals, 'spot'),
      s: size,
      r: false,
      t: { limit: { tif: 'Ioc' } },
    },
  };
}

/** USDC to move from spot to perps, rounded down to the cent, or null when there is none. */
export function usdcToMove(spot: SpotRow[] | null): string | null {
  const cents = Math.floor(free(spot, 'USDC') * 100 + 1e-9);
  return cents > 0 ? (cents / 100).toFixed(2) : null;
}

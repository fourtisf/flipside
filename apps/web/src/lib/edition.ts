/**
 * Which UI this build shows, fixed at build time by NEXT_PUBLIC_COINSIDE_UI.
 *
 * - "live" (the default, and what coinside.fun serves): Coinside as a Hyperliquid builder
 *   (PLAN-HYPERLIQUID.md). Real Hyperliquid markets, prices, candles and order books, read in the browser.
 *   Trading is not open yet: order buttons say "Trading opens soon" (H3 adds it on testnet).
 * - "prototype": the approved prototype of the original own-pool design, as ported in P0, with simulated
 *   coins, trading and Practice mode. Kept as the record of that design until ALFA decides what happens to it
 *   (PLAN-HYPERLIQUID.md, decision 7). Its e2e suite runs against it.
 */
export const LIVE = process.env.NEXT_PUBLIC_COINSIDE_UI !== 'prototype';

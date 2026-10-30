/**
 * Which UI this build shows, fixed at build time by NEXT_PUBLIC_COINSIDE_UI.
 *
 * - "prelaunch" (the default, and what coinside.fun serves): no trading and no paper SOL. Markets and charts
 *   can be browsed; trade buttons say "Trading opens soon"; nothing simulated is shown as trading activity
 *   (tape, feed, wins, stats, leaderboard, pool, portfolio). It stays until real trading opens (P6).
 * - "prototype": the approved prototype as ported in P0, simulated trading and Practice mode included. The
 *   e2e suite, the side-by-side check against prototype.html and development use it.
 */
export const PRELAUNCH = process.env.NEXT_PUBLIC_COINSIDE_UI !== 'prototype';

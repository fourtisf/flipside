import type { Status } from '@/hl/store';

/** What the page says while Hyperliquid's data is loading, flowing, interrupted or unreachable. */
export const statusText = (s: Status) =>
  s === 'live'
    ? 'Live prices from Hyperliquid'
    : s === 'stale'
      ? 'Reconnecting to Hyperliquid. Prices may be out of date.'
      : s === 'down'
        ? "Can't reach Hyperliquid right now. Retrying."
        : 'Loading markets from Hyperliquid.';

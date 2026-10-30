/** What the page says while Hyperliquid's data is loading, flowing or unreachable. */
export const statusText = (s: 'loading' | 'live' | 'down') =>
  s === 'live'
    ? 'Live prices from Hyperliquid'
    : s === 'down'
      ? "Can't reach Hyperliquid right now. Retrying."
      : 'Loading markets from Hyperliquid.';

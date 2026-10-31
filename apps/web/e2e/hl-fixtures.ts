/**
 * Hyperliquid API responses for tests, in the exact shapes the SDK types describe. The numbers are made up
 * (plausible, not real), so tests never depend on the market. Unit tests (src/hl) and the live-edition e2e
 * suite (live.spec.ts, which serves these in place of api.hyperliquid.xyz) share them.
 */
import type {
  CandleSnapshotResponse,
  ClearinghouseStateResponse,
  FrontendOpenOrdersResponse,
  L2BookResponse,
  MetaAndAssetCtxsResponse,
  SpotClearinghouseStateResponse,
  SpotMetaAndAssetCtxsResponse,
  UserFillsResponse,
} from '@nktkas/hyperliquid/api/info';

interface Row {
  name: string;
  sz: number;
  lev: number;
  px: number;
  /** 24h change, 0.05 = +5% */
  ch: number;
  /** 24h volume, USD */
  vol: number;
  /** open interest, USD */
  oi: number;
  /** hourly funding */
  f: number;
  isolated?: boolean;
  delisted?: boolean;
}

export const ROWS: Row[] = [
  { name: 'BTC', sz: 5, lev: 40, px: 97123.5, ch: 0.0213, vol: 3.1e9, oi: 4.2e9, f: 0.0000125 },
  { name: 'ETH', sz: 4, lev: 25, px: 3456.7, ch: -0.0141, vol: 1.6e9, oi: 2.1e9, f: 0.0000098 },
  { name: 'SOL', sz: 2, lev: 20, px: 187.23, ch: 0.0532, vol: 6.4e8, oi: 7.9e8, f: 0.0000162 },
  { name: 'HYPE', sz: 2, lev: 10, px: 41.873, ch: 0.0874, vol: 4.1e8, oi: 6.6e8, f: 0.0000231 },
  { name: 'XRP', sz: 0, lev: 20, px: 2.4512, ch: -0.0226, vol: 2.2e8, oi: 3.4e8, f: 0.0000071 },
  { name: 'FARTCOIN', sz: 1, lev: 10, px: 1.2345, ch: 0.1418, vol: 1.9e8, oi: 1.5e8, f: 0.0000412 },
  { name: 'DOGE', sz: 0, lev: 10, px: 0.38921, ch: -0.0418, vol: 1.7e8, oi: 2.6e8, f: 0.0000054 },
  { name: 'kPEPE', sz: 0, lev: 10, px: 0.020145, ch: 0.0611, vol: 1.2e8, oi: 1.1e8, f: 0.0000135 },
  { name: 'SUI', sz: 1, lev: 10, px: 4.1234, ch: -0.0712, vol: 9.8e7, oi: 1.4e8, f: -0.0000032 },
  { name: 'PUMP', sz: 0, lev: 5, px: 0.0061234, ch: 0.2241, vol: 8.7e7, oi: 6.1e7, f: 0.0000522 },
  { name: 'WIF', sz: 0, lev: 10, px: 1.8734, ch: -0.1123, vol: 7.6e7, oi: 9.2e7, f: -0.0000088 },
  { name: 'TRUMP', sz: 1, lev: 10, px: 12.345, ch: 0.0189, vol: 6.1e7, oi: 8.8e7, f: 0.0000101 },
  { name: 'kBONK', sz: 0, lev: 10, px: 0.031245, ch: 0.0342, vol: 5.4e7, oi: 4.9e7, f: 0.0000077 },
  { name: 'ENA', sz: 0, lev: 10, px: 0.81234, ch: -0.0331, vol: 4.9e7, oi: 7.1e7, f: 0.0000063 },
  { name: 'AVAX', sz: 2, lev: 10, px: 38.912, ch: 0.0121, vol: 4.2e7, oi: 6.2e7, f: 0.0000088 },
  { name: 'LINK', sz: 1, lev: 10, px: 21.345, ch: -0.0085, vol: 3.6e7, oi: 5.5e7, f: 0.0000052 },
  { name: 'JUP', sz: 0, lev: 10, px: 0.91234, ch: 0.0477, vol: 2.8e7, oi: 3.3e7, f: 0.0000119 },
  { name: 'AAVE', sz: 2, lev: 10, px: 312.45, ch: 0.0253, vol: 2.4e7, oi: 4.4e7, f: 0.0000091 },
  { name: 'LTC', sz: 2, lev: 10, px: 112.34, ch: -0.0165, vol: 1.9e7, oi: 3.1e7, f: 0.0000048 },
  { name: 'TAO', sz: 3, lev: 5, px: 512.34, ch: 0.0391, vol: 1.6e7, oi: 2.7e7, f: 0.0000143 },
  { name: 'ADA', sz: 0, lev: 10, px: 0.98123, ch: -0.0254, vol: 1.4e7, oi: 2.5e7, f: 0.0000039 },
  { name: 'ARB', sz: 1, lev: 10, px: 0.71234, ch: -0.0498, vol: 1.1e7, oi: 1.9e7, f: -0.0000011 },
  {
    name: 'POPCAT',
    sz: 0,
    lev: 5,
    px: 0.51234,
    ch: 0.0712,
    vol: 8.2e6,
    oi: 9.1e6,
    f: 0.0000198,
    isolated: true,
  },
  { name: 'OLDCOIN', sz: 0, lev: 3, px: 0.1, ch: 0, vol: 0, oi: 0, f: 0, delisted: true },
];

const s = (n: number) => String(+n.toPrecision(8));

export const META_AND_CTXS: MetaAndAssetCtxsResponse = [
  {
    universe: ROWS.map((r) => ({
      name: r.name,
      szDecimals: r.sz,
      maxLeverage: r.lev,
      marginTableId: r.lev,
      ...(r.isolated ? { onlyIsolated: true as const } : {}),
      ...(r.delisted ? { isDelisted: true as const } : {}),
    })),
    marginTables: [],
    collateralToken: 0,
  },
  ROWS.map((r) => ({
    prevDayPx: s(r.px / (1 + r.ch)),
    dayNtlVlm: s(r.vol),
    markPx: s(r.px),
    midPx: s(r.px),
    funding: s(r.f),
    openInterest: s(r.oi / r.px),
    premium: '0.0',
    oraclePx: s(r.px * 1.0002),
    impactPxs: [s(r.px * 0.9999), s(r.px * 1.0001)],
    dayBaseVlm: s(r.vol / r.px),
  })),
];

export const row = (name: string) => ROWS.find((r) => r.name === name)!;

/** allMids for the main dex: every live market's mid, optionally nudged by `bump` (0.01 = +1%). */
export function mids(bump: Record<string, number> = {}): Record<string, string> {
  return Object.fromEntries(
    ROWS.filter((r) => !r.delisted).map((r) => [r.name, s(r.px * (1 + (bump[r.name] ?? 0)))]),
  );
}

/** Deterministic pseudo-random numbers, so every run draws the same candles. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const MS: Record<string, number> = {
  '1m': 6e4,
  '5m': 3e5,
  '15m': 9e5,
  '1h': 3.6e6,
  '4h': 1.44e7,
  '1d': 8.64e7,
};

/** Candles from `start` to `end` that finish at the market's price. */
export function candles(coin: string, interval: string, start: number, end: number): CandleSnapshotResponse {
  const r = row(coin);
  const step = MS[interval] ?? 6e4;
  const t0 = Math.ceil(start / step) * step;
  const n = Math.max(1, Math.min(500, Math.floor((end - t0) / step) + 1));
  const rand = rng(coin.length * 7919 + step);
  const vol = 0.004 * Math.sqrt(step / 6e4);
  const closes: number[] = [r.px];
  for (let i = 1; i < n; i++) closes.unshift(closes[0]! / (1 + (rand() - 0.5) * 2 * vol));
  return closes.map((c, i) => {
    const o = i ? closes[i - 1]! : c * (1 - vol / 3);
    const t = t0 + i * step;
    return {
      t,
      T: t + step - 1,
      s: coin,
      i: interval as CandleSnapshotResponse[number]['i'],
      o: s(o),
      c: s(c),
      h: s(Math.max(o, c) * (1 + rand() * vol)),
      l: s(Math.min(o, c) * (1 - rand() * vol)),
      v: s((r.vol / r.px / (8.64e7 / step)) * (0.5 + rand())),
      n: 10 + Math.floor(rand() * 500),
    };
  });
}

/** A 20-level book around the market's price, one tick apart. */
export function book(coin: string, time = Date.now()): L2BookResponse {
  const r = row(coin);
  const tick = 10 ** -Math.max(0, Math.min(6 - r.sz, 5 - (Math.floor(Math.log10(r.px)) + 1)));
  const rand = rng(coin.length * 104729);
  const level = (i: number, dir: 1 | -1) => ({
    px: s(Math.round((r.px + dir * tick * (i + 1)) / tick) * tick),
    sz: s(+((10_000 / r.px) * (0.2 + rand() * 2)).toFixed(r.sz)),
    n: 1 + Math.floor(rand() * 9),
  });
  return {
    coin,
    time,
    levels: [
      Array.from({ length: 20 }, (_, i) => level(i, -1)),
      Array.from({ length: 20 }, (_, i) => level(i, 1)),
    ],
  };
}

/** Recent trades, newest first. */
export function trades(coin: string, n = 30, now = Date.now()) {
  const r = row(coin);
  const rand = rng(coin.length * 15485863);
  return Array.from({ length: n }, (_, i) => ({
    coin,
    side: (rand() > 0.5 ? 'B' : 'A') as 'B' | 'A',
    px: s(r.px * (1 + (rand() - 0.5) * 0.001)),
    sz: s(+((2_000 / r.px) * (0.1 + rand() * 3)).toFixed(r.sz)),
    time: now - i * 1_500,
    hash: '0x' + '0'.repeat(64),
    tid: 1_000_000 + n - i,
    users: ['0x' + '1'.repeat(40), '0x' + '2'.repeat(40)] as [string, string],
  }));
}

/* ---------- an account (H2) ---------- */

export const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

const summary = {
  accountValue: '1234.56',
  totalNtlPos: '2937.16',
  totalRawUsd: '-1702.6',
  totalMarginUsed: '490.3',
};
const funding = { allTime: '0.5', sinceOpen: '0.2', sinceChange: '0.2' };

export const CLEARINGHOUSE: ClearinghouseStateResponse = {
  marginSummary: summary,
  crossMarginSummary: summary,
  crossMaintenanceMarginUsed: '61.2',
  withdrawable: '744.26',
  assetPositions: [
    {
      type: 'oneWay',
      position: {
        coin: 'SOL',
        szi: '10.5',
        leverage: { type: 'cross', value: 5 },
        entryPx: '180.12',
        positionValue: '1965.92',
        unrealizedPnl: '74.66',
        returnOnEquity: '0.1974',
        liquidationPx: '150.01',
        marginUsed: '393.18',
        maxLeverage: 20,
        cumFunding: funding,
      },
    },
    {
      type: 'oneWay',
      position: {
        coin: 'BTC',
        szi: '-0.01',
        leverage: { type: 'isolated', value: 10, rawUsd: '1068.36' },
        entryPx: '96000',
        positionValue: '971.24',
        unrealizedPnl: '-11.24',
        returnOnEquity: '-0.117',
        liquidationPx: '105000',
        marginUsed: '97.12',
        maxLeverage: 40,
        cumFunding: funding,
      },
    },
  ],
  time: 1_793_000_000_000,
};

export const SPOT: SpotClearinghouseStateResponse = {
  balances: [
    { coin: 'USOL', token: 254, total: '1.5', hold: '0.0', entryNtl: '280.5' },
    { coin: 'USDC', token: 0, total: '500.12', hold: '20.0', entryNtl: '0.0' },
    { coin: 'PURR', token: 1, total: '0.0', hold: '0.0', entryNtl: '0.0' },
  ],
};

/** A wallet that has never deposited: what Hyperliquid answers for any new address. */
const zero = { accountValue: '0.0', totalNtlPos: '0.0', totalRawUsd: '0.0', totalMarginUsed: '0.0' };
export const EMPTY_CLEARINGHOUSE: ClearinghouseStateResponse = {
  marginSummary: zero,
  crossMarginSummary: zero,
  crossMaintenanceMarginUsed: '0.0',
  withdrawable: '0.0',
  assetPositions: [],
  time: 1_793_000_000_000,
};
export const EMPTY_SPOT: SpotClearinghouseStateResponse = { balances: [] };

/** Spot markets: just enough for USOL/USDC ("@156"), where a SOL deposit is sold for USDC. */
const token = (name: string, index: number, szDecimals: number) => ({
  name,
  szDecimals,
  weiDecimals: 8,
  index,
  tokenId: `0x${index.toString(16).padStart(32, '0')}` as `0x${string}`,
  isCanonical: true,
  evmContract: null,
  fullName: null,
  deployerTradingFeeShare: '0.0',
});
const spotCtx = (coin: string, px: string) => ({
  coin,
  prevDayPx: px,
  dayNtlVlm: '1000000.0',
  markPx: px,
  midPx: px,
  circulatingSupply: '1000000.0',
  totalSupply: '1000000.0',
  dayBaseVlm: '5000.0',
});
export const SPOT_META: SpotMetaAndAssetCtxsResponse = [
  {
    tokens: [token('USDC', 0, 8), token('PURR', 1, 0), token('USOL', 254, 2)],
    universe: [
      { tokens: [1, 0], name: 'PURR/USDC', index: 0, isCanonical: true },
      { tokens: [254, 0], name: '@156', index: 156, isCanonical: false },
    ],
  },
  [spotCtx('PURR/USDC', '0.21'), spotCtx('@156', '187.1')],
];

export const ORDERS: FrontendOpenOrdersResponse = [
  {
    coin: 'SOL',
    side: 'B',
    limitPx: '170.5',
    sz: '2.0',
    oid: 9001,
    timestamp: 1_793_000_000_000,
    origSz: '2.0',
    triggerCondition: 'N/A',
    isTrigger: false,
    triggerPx: '0.0',
    children: [],
    isPositionTpsl: false,
    reduceOnly: false,
    orderType: 'Limit',
    tif: 'Gtc',
    cloid: null,
  },
];

const fill = (
  tid: number,
  coin: string,
  side: 'B' | 'A',
  px: string,
  sz: string,
  dir: string,
  closedPnl: string,
) => ({
  coin,
  px,
  sz,
  side,
  time: 1_793_000_000_000 - tid * 60_000,
  startPosition: '0.0',
  dir,
  closedPnl,
  hash: `0x${'ab'.repeat(32)}` as const,
  oid: 8000 + tid,
  crossed: true,
  fee: '0.08',
  tid,
  feeToken: 'USDC',
  twapId: null,
});

export const FILLS: UserFillsResponse = [
  fill(1, 'SOL', 'B', '180.12', '10.5', 'Open Long', '0.0'),
  fill(2, 'ETH', 'A', '3500.1', '0.2', 'Close Long', '12.5'),
];

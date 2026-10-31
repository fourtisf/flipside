'use client';

/**
 * A Hyperliquid account, read only: what it holds, its open positions and orders, and its latest fills.
 * A snapshot from the info API when the wallet connects, then live updates over the WebSocket. Floats are for
 * display only; nothing here places or signs anything.
 */
import * as info from '@nktkas/hyperliquid/api/info';
import type {
  ClearinghouseStateResponse,
  FrontendOpenOrdersResponse,
  SpotClearinghouseStateResponse,
  UserFillsResponse,
} from '@nktkas/hyperliquid/api/info';
import * as sub from '@nktkas/hyperliquid/api/subscription';
import { httpConfig, wsConfig } from '@/hl/client';
import { keepSubscribed } from '@/hl/store';
import type { Address } from './store';

const num = (s: string | null | undefined) => {
  const n = s == null ? NaN : Number(s);
  return Number.isFinite(n) ? n : 0;
};

export interface PositionRow {
  coin: string;
  side: 'long' | 'short';
  /** Size in coins, always positive. */
  size: number;
  entry: number;
  value: number;
  pnl: number;
  /** Return on the margin, 0.12 for +12%. */
  roe: number;
  liq: number | null;
  lev: number;
  margin: 'cross' | 'isolated';
}

export interface Summary {
  value: number;
  withdrawable: number;
  marginUsed: number;
  pnl: number;
}

export interface SpotRow {
  coin: string;
  total: number;
  /** Held by open orders. */
  hold: number;
}

export interface OrderRow {
  oid: number;
  coin: string;
  side: 'buy' | 'sell';
  type: string;
  px: number;
  size: number;
  origSize: number;
  trigger: number | null;
  reduceOnly: boolean;
  time: number;
}

export interface FillRow {
  tid: number;
  coin: string;
  /** Hyperliquid's own wording: "Open Long", "Close Short", "Buy", ... */
  dir: string;
  side: 'buy' | 'sell';
  px: number;
  size: number;
  fee: number;
  closedPnl: number;
  time: number;
}

export function toPerps(ch: ClearinghouseStateResponse): { summary: Summary; positions: PositionRow[] } {
  const positions = ch.assetPositions
    .map(({ position: p }) => {
      const szi = num(p.szi);
      return {
        coin: p.coin,
        side: szi >= 0 ? ('long' as const) : ('short' as const),
        size: Math.abs(szi),
        entry: num(p.entryPx),
        value: num(p.positionValue),
        pnl: num(p.unrealizedPnl),
        roe: num(p.returnOnEquity),
        liq: p.liquidationPx == null ? null : num(p.liquidationPx),
        lev: p.leverage.value,
        margin: p.leverage.type,
      };
    })
    .filter((p) => p.size > 0)
    .sort((a, b) => b.value - a.value);
  return {
    summary: {
      value: num(ch.marginSummary.accountValue),
      withdrawable: num(ch.withdrawable),
      marginUsed: num(ch.marginSummary.totalMarginUsed),
      pnl: positions.reduce((s, p) => s + p.pnl, 0),
    },
    positions,
  };
}

export const toSpot = (s: SpotClearinghouseStateResponse): SpotRow[] =>
  s.balances
    .map((b) => ({ coin: b.coin, total: num(b.total), hold: num(b.hold) }))
    .filter((b) => b.total > 0)
    .sort((a, b) => (a.coin === 'USDC' ? -1 : b.coin === 'USDC' ? 1 : b.total - a.total));

export const toOrders = (os: FrontendOpenOrdersResponse): OrderRow[] =>
  os
    .map((o) => ({
      oid: o.oid,
      coin: o.coin,
      side: o.side === 'B' ? ('buy' as const) : ('sell' as const),
      type: o.orderType,
      px: num(o.limitPx),
      size: num(o.sz),
      origSize: num(o.origSz),
      trigger: o.isTrigger ? num(o.triggerPx) : null,
      reduceOnly: o.reduceOnly,
      time: o.timestamp,
    }))
    .sort((a, b) => b.time - a.time);

export const toFills = (fs: UserFillsResponse, keep = 50): FillRow[] =>
  fs
    .map((f) => ({
      tid: f.tid,
      coin: f.coin,
      dir: f.dir,
      side: f.side === 'B' ? ('buy' as const) : ('sell' as const),
      px: num(f.px),
      size: num(f.sz),
      fee: num(f.fee),
      closedPnl: num(f.closedPnl),
      time: f.time,
    }))
    .sort((a, b) => b.time - a.time || b.tid - a.tid)
    .slice(0, keep);

/** Newest fills first, merged by trade id so a reconnect never lists one twice. */
export function mergeFills(prev: FillRow[], incoming: FillRow[], keep = 50): FillRow[] {
  const seen = new Set(prev.map((f) => f.tid));
  const fresh = incoming.filter((f) => !seen.has(f.tid));
  if (!fresh.length) return prev;
  return [...fresh, ...prev].sort((a, b) => b.time - a.time || b.tid - a.tid).slice(0, keep);
}

/**
 * Nothing in the account: no perps value, no positions and no spot balance. Hyperliquid refuses every action from
 * an account that has never deposited ("Must deposit before performing actions"), approving a trading key too.
 * False while the account isn't known yet, so nothing is blocked on a slow or failed read.
 */
export function isEmpty(summary: Summary | null, positions: PositionRow[], spot: SpotRow[] | null): boolean {
  if (!summary || !spot) return false;
  return !(summary.value > 0) && positions.length === 0 && spot.every((b) => !(b.total > 0));
}

/** The account as an external store, for the header and the Portfolio page. */
export class AccountStore {
  address: Address | null = null;
  summary: Summary | null = null;
  positions: PositionRow[] = [];
  spot: SpotRow[] | null = null;
  orders: OrderRow[] | null = null;
  fills: FillRow[] | null = null;
  /** The snapshot couldn't be read; live updates may still fill it in. */
  failed = false;

  version = 0;
  private listeners = new Set<() => void>();
  private stop: (() => void) | null = null;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  /** Known to be empty: the order button asks for a deposit first. */
  empty(): boolean {
    return isEmpty(this.summary, this.positions, this.spot);
  }

  private perps(ch: ClearinghouseStateResponse) {
    const { summary, positions } = toPerps(ch);
    this.summary = summary;
    this.positions = positions;
  }

  /** Follow a new address (or none). */
  follow(address: Address | null) {
    if (address === this.address) return;
    this.stop?.();
    this.stop = null;
    this.address = address;
    this.summary = null;
    this.positions = [];
    this.spot = this.orders = this.fills = null;
    this.failed = false;
    this.emit();
    if (!address) return;

    const user = address;
    const ctl = new AbortController();
    const on = () => !ctl.signal.aborted && this.address === user;
    const update = (fn: () => void) => {
      if (!on()) return;
      fn();
      this.emit();
    };
    Promise.all([
      info.clearinghouseState(httpConfig(), { user }, ctl.signal),
      info.spotClearinghouseState(httpConfig(), { user }, ctl.signal),
      info.frontendOpenOrders(httpConfig(), { user }, ctl.signal),
      info.userFills(httpConfig(), { user }, ctl.signal),
    ]).then(
      ([ch, spot, orders, fills]) =>
        update(() => {
          this.perps(ch);
          this.spot = toSpot(spot);
          this.orders = toOrders(orders);
          this.fills = toFills(fills);
        }),
      () => update(() => void (this.failed = true)),
    );
    const stops = [
      keepSubscribed((o) =>
        sub.clearinghouseState(
          wsConfig(),
          { user },
          (e) => update(() => this.perps(e.clearinghouseState)),
          o,
        ),
      ),
      keepSubscribed((o) =>
        sub.spotState(wsConfig(), { user }, (e) => update(() => void (this.spot = toSpot(e.spotState))), o),
      ),
      keepSubscribed((o) =>
        sub.openOrders(wsConfig(), { user }, (e) => update(() => void (this.orders = toOrders(e.orders))), o),
      ),
      keepSubscribed((o) =>
        sub.userFills(
          wsConfig(),
          { user },
          (e) =>
            update(() => {
              const rows = toFills(e.fills);
              this.fills = e.isSnapshot || !this.fills ? rows : mergeFills(this.fills, rows);
            }),
          o,
        ),
      ),
    ];
    this.stop = () => {
      ctl.abort();
      stops.forEach((s) => s());
    };
  }
}

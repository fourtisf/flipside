'use client';

import * as info from '@nktkas/hyperliquid/api/info';
import * as sub from '@nktkas/hyperliquid/api/subscription';
import type { ISubscription } from '@nktkas/hyperliquid';
import type { SubscriptionOptions } from '@nktkas/hyperliquid/api/subscription';
import { httpConfig, wsConfig } from './client';
import { DEFAULT_MARKET, applyMids, toMarkets, type Market } from './markets';

/** How often the full snapshot (volume, open interest, funding, new listings) is refreshed. */
const SNAPSHOT_MS = 15_000;
/** Prices arrive many times a second; the UI re-renders at most this often. */
const RENDER_MS = 250;
/** Nothing heard from Hyperliquid for this long means the connection is gone and prices may be old. */
export const STALE_MS = 45_000;

/**
 * loading: no snapshot yet. live: data is flowing. stale: data was flowing but nothing has arrived for a
 * while (prices on screen may be old). down: Hyperliquid couldn't be reached before anything arrived.
 */
export type Status = 'loading' | 'live' | 'stale' | 'down';

/**
 * Keep a WebSocket subscription alive: retry with backoff if subscribing fails, or if a confirmed
 * subscription is dropped after a reconnect. Returns a function that stops it.
 */
export function keepSubscribed(open: (opts: SubscriptionOptions) => Promise<ISubscription>): () => void {
  const ctl = new AbortController();
  let stopped = false;
  let current: ISubscription | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = 1_000;
  const retry = () => {
    current = null;
    if (stopped) return;
    timer = setTimeout(go, delay);
    delay = Math.min(delay * 2, 30_000);
  };
  function go() {
    if (stopped) return;
    open({ signal: ctl.signal, onError: retry }).then((s) => {
      if (stopped) void s.unsubscribe().catch(() => {});
      else {
        current = s;
        delay = 1_000;
      }
    }, retry);
  }
  go();
  return () => {
    stopped = true;
    clearTimeout(timer);
    ctl.abort();
    void current?.unsubscribe().catch(() => {});
  };
}

export type Side = 'long' | 'short';
export type SortKey = 'name' | 'px' | 'change' | 'volume' | 'oi' | 'funding' | 'lev';

/** What the ticket and the order panel hold. One draft, so "Full terminal" carries it over. */
export interface Draft {
  side: Side;
  /** USDC of margin, as typed. */
  amt: string;
  lev: number;
  type: 'market' | 'limit';
  limit: string;
  tpsl: boolean;
  tp: string;
  sl: string;
}

/**
 * Live Hyperliquid market data for the whole app, as an external store (like the prototype's Sim):
 * components re-render when `version` changes.
 *
 * - A snapshot of every perp market (metaAndAssetCtxs) on start and every 15 seconds.
 * - Prices from the allMids WebSocket channel in between, so they move within a second.
 */
export class HlStore {
  markets: Market[] = [];
  byName: Record<string, Market> = {};
  status: Status = 'loading';
  /** When the last snapshot arrived (ms). */
  updatedAt = 0;
  /** Bumped on every snapshot: lists and table rows re-order then, not on every price tick. */
  rowsKey = 0;

  /** The terminal's market, for the Trade link. */
  sel = DEFAULT_MARKET;
  /** The Quick trade ticket's market. */
  tk = DEFAULT_MARKET;
  draft: Draft = { side: 'long', amt: '100', lev: 5, type: 'market', limit: '', tpsl: false, tp: '', sl: '' };
  table: { q: string; sort: { k: SortKey; d: 1 | -1 } } = { q: '', sort: { k: 'volume', d: -1 } };
  watchQ = '';

  version = 0;
  private listeners = new Set<() => void>();
  private mids: Record<string, string> = {};
  private pending: ReturnType<typeof setTimeout> | undefined;
  /** When anything last arrived from Hyperliquid (ms): a snapshot or a batch of prices. */
  private heardAt = 0;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => this.version;

  private emit() {
    clearTimeout(this.pending);
    this.pending = undefined;
    this.version++;
    this.listeners.forEach((l) => l());
  }
  /** Coalesce price updates into at most one render per RENDER_MS. */
  private emitSoon() {
    this.pending ??= setTimeout(() => this.emit(), RENDER_MS);
  }

  /** Change UI state and re-render now. */
  set(fn: (s: this) => void) {
    fn(this);
    this.emit();
  }

  /** Accept a snapshot (exported for tests and for the e2e fixtures). */
  applySnapshot(snap: Parameters<typeof toMarkets>[0]) {
    this.markets = toMarkets(snap, this.mids, this.byName);
    this.byName = Object.fromEntries(this.markets.map((m) => [m.name, m]));
    this.status = 'live';
    this.updatedAt = this.heardAt = Date.now();
    this.rowsKey++;
    this.emit();
  }

  applyMids(mids: Record<string, string>) {
    Object.assign(this.mids, mids);
    this.heardAt = Date.now();
    const back = this.status === 'stale';
    if (back) this.status = 'live';
    if (applyMids(this.markets, mids) || back) this.emitSoon();
  }

  /** Run every few seconds: when nothing has arrived for a while, stop calling the prices live. */
  checkStale(now = Date.now()) {
    if (this.status === 'live' && now - this.heardAt > STALE_MS) this.set((s) => void (s.status = 'stale'));
  }

  /** Re-render without new data (a pushed market context changed a Market in place). */
  touch() {
    this.emitSoon();
  }

  /** Connect. Returns a function that disconnects (the provider calls it on unmount). */
  start(): () => void {
    let stopped = false;
    let inflight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctl = new AbortController();
    const poll = async () => {
      if (stopped || inflight) return;
      clearTimeout(timer);
      let next = SNAPSHOT_MS;
      // Skip the refresh while the tab is hidden; prices keep coming over the WebSocket.
      if (!document.hidden || !this.markets.length) {
        inflight = true;
        try {
          this.applySnapshot(await info.metaAndAssetCtxs(httpConfig(), ctl.signal));
        } catch {
          if (stopped) return;
          if (this.status === 'loading') this.set((s) => void (s.status = 'down'));
          // Retry sooner while there is nothing to show.
          if (!this.markets.length) next = 5_000;
        } finally {
          inflight = false;
        }
      }
      if (!stopped) timer = setTimeout(poll, next);
    };
    // Coming back to the tab refreshes at once instead of waiting for the next round.
    const onVisible = () => {
      if (!document.hidden && Date.now() - this.updatedAt > SNAPSHOT_MS) void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', onVisible);
    const watchdog = setInterval(() => this.checkStale(), 5_000);
    const stopMids = keepSubscribed((opts) => sub.allMids(wsConfig(), (e) => this.applyMids(e.mids), opts));
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(this.pending);
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisible);
      ctl.abort();
      stopMids();
    };
  }
}

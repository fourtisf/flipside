'use client';

import * as info from '@nktkas/hyperliquid/api/info';
import * as sub from '@nktkas/hyperliquid/api/subscription';
import type { L2BookEvent } from '@nktkas/hyperliquid/api/subscription';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { httpConfig, wsConfig } from './client';
import { bookSide, mergeSide, withDepth } from './format';
import { applyCtx } from './markets';
import { HlStore, keepSubscribed } from './store';

const HlContext = createContext<HlStore | null>(null);

/** Owns the Hyperliquid connection for the whole app. Lives in the root layout, so it survives navigation. */
export function HlProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new HlStore());
  useEffect(() => store.start(), [store]);
  return <HlContext.Provider value={store}>{children}</HlContext.Provider>;
}

function useStore(): HlStore {
  const store = useContext(HlContext);
  if (!store) throw new Error('useHl must be used inside <HlProvider>');
  return store;
}

/** Subscribe to the market data. Re-renders on every snapshot, price batch or UI change. */
export function useHl(): HlStore {
  const store = useStore();
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store;
}

/** Live mark, oracle, funding, volume and open interest for one market while it is on screen. */
export function useActiveCtx(name: string) {
  const store = useStore();
  useEffect(
    () =>
      keepSubscribed((opts) =>
        sub.activeAssetCtx(
          wsConfig(),
          { coin: name },
          (e) => {
            const m = store.byName[name];
            if (m && applyCtx(m, e.ctx)) store.touch();
          },
          opts,
        ),
      ),
    [store, name],
  );
}

export type Book = ReturnType<typeof withDepth>;

type Levels = L2BookEvent['levels'];
/** Hyperliquid's fast book feed sends this many levels a side; the default feed sends 20. */
const FAST_LEVELS = 5;

/**
 * The order book, `levels` per side, live over the WebSocket. Null until the first snapshot. Hyperliquid's
 * default feed has 20 levels but arrives every 5 seconds, its fast feed 5 levels twice a second, so the top
 * comes from the fast feed and the rest from the default one.
 */
export function useBook(name: string, levels: number): Book | null {
  const [feeds, setFeeds] = useState<{ top: Levels | null; deep: Levels | null }>({ top: null, deep: null });
  useEffect(() => {
    setFeeds({ top: null, deep: null });
    // a message still in flight for the previous market must not land on this one
    let on = true;
    // Both subscriptions hear every l2Book message for the coin, so each message is sorted by its depth.
    const take = (e: L2BookEvent) => {
      if (!on) return;
      const deep = e.levels[0].length > FAST_LEVELS || e.levels[1].length > FAST_LEVELS;
      setFeeds((f) => (deep ? { ...f, deep: e.levels } : { ...f, top: e.levels }));
    };
    const stopFast = keepSubscribed((opts) => sub.l2Book(wsConfig(), { coin: name, fast: true }, take, opts));
    const stopDeep = keepSubscribed((opts) => sub.l2Book(wsConfig(), { coin: name }, take, opts));
    return () => {
      on = false;
      stopFast();
      stopDeep();
    };
  }, [name]);
  return useMemo(() => {
    if (!feeds.top && !feeds.deep) return null;
    const side = (i: 0 | 1) => mergeSide(feeds.top?.[i] ?? null, feeds.deep?.[i] ?? null, i ? 1 : -1, levels);
    return withDepth(bookSide(side(0), levels), bookSide(side(1), levels));
  }, [feeds, levels]);
}

export interface Trade {
  tid: number;
  /** "B" when the buyer took liquidity (price went up), "A" when the seller did. */
  side: 'B' | 'A';
  px: number;
  sz: number;
  time: number;
}

const toTrade = (t: { tid: number; side: 'B' | 'A'; px: string; sz: string; time: number }): Trade => ({
  tid: t.tid,
  side: t.side,
  px: Number(t.px),
  sz: Number(t.sz),
  time: t.time,
});

/** Newest trades first, merged by trade id so a reconnect never shows one twice. */
function mergeTrades(prev: Trade[], incoming: Trade[], keep: number): Trade[] {
  const seen = new Set(prev.map((t) => t.tid));
  const fresh = incoming.filter((t) => !seen.has(t.tid));
  if (!fresh.length) return prev;
  return [...fresh, ...prev].sort((a, b) => b.time - a.time || b.tid - a.tid).slice(0, keep);
}

/** Recent trades: the last ones from the info API, then every new one over the WebSocket. */
export function useTrades(name: string, keep: number): Trade[] | null {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  useEffect(() => {
    setTrades(null);
    const ctl = new AbortController();
    const on = () => !ctl.signal.aborted;
    info
      .recentTrades(httpConfig(), { coin: name }, ctl.signal)
      .then((r) => setTrades((p) => mergeTrades(p ?? [], r.map(toTrade), keep)))
      .catch(() => setTrades((p) => p ?? []));
    const stop = keepSubscribed((opts) =>
      sub.trades(
        wsConfig(),
        { coin: name },
        (e) => on() && setTrades((p) => mergeTrades(p ?? [], e.map(toTrade), keep)),
        opts,
      ),
    );
    return () => {
      ctl.abort();
      stop();
    };
  }, [name, keep]);
  return trades;
}

/**
 * Read one value from the store and re-render only when it changes (the Trade link needs the selected
 * market, not every price). `pick` must return a primitive or a stable reference.
 */
export function useHlValue<T>(pick: (s: HlStore) => T): T {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    () => pick(store),
    () => pick(store),
  );
}

/** The 24 hours before now as 15-minute closes, for the ticket's sparkline. Null while loading. */
export function useSpark(name: string): number[] | null {
  const [closes, setCloses] = useState<number[] | null>(null);
  useEffect(() => {
    setCloses(null);
    const ctl = new AbortController();
    const now = Date.now();
    info
      .candleSnapshot(
        httpConfig(),
        { coin: name, interval: '15m', startTime: now - 86_400_000, endTime: now },
        ctl.signal,
      )
      .then((cs) => setCloses(cs.map((c) => Number(c.c))))
      .catch(() => setCloses([]));
    return () => ctl.abort();
  }, [name]);
  return closes;
}

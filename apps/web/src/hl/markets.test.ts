import { describe, expect, it } from 'vitest';
import { META_AND_CTXS, ROWS } from '../../e2e/hl-fixtures';
import { applyCtx, applyMids, change24h, findMarket, toMarkets, unitNote } from './markets';
import { HlStore } from './store';

describe('toMarkets', () => {
  const ms = toMarkets(META_AND_CTXS);

  it('zips the universe with its contexts and leaves delisted markets out', () => {
    expect(ms).toHaveLength(ROWS.length - 1);
    expect(ms.find((m) => m.name === 'OLDCOIN')).toBeUndefined();
    const btc = ms[0]!;
    expect(btc).toMatchObject({ name: 'BTC', asset: 0, szDecimals: 5, maxLeverage: 40, onlyIsolated: false });
    expect(btc.px).toBe(97123.5);
    expect(btc.volume).toBe(3.1e9);
    expect(btc.oi).toBeCloseTo(4.2e9, -3);
    expect(btc.funding).toBe(0.0000125);
  });

  it('keeps the asset id of every market, even after a delisted one is skipped', () => {
    // OLDCOIN is last in the fixture; the asset id is the position in Hyperliquid's universe either way
    ms.forEach((m) => expect(META_AND_CTXS[0].universe[m.asset]!.name).toBe(m.name));
  });

  it('marks isolated-only markets', () => {
    expect(ms.find((m) => m.name === 'POPCAT')!.onlyIsolated).toBe(true);
  });

  it('computes the 24h change from the price 24 hours ago', () => {
    const sol = ms.find((m) => m.name === 'SOL')!;
    expect(change24h(sol)).toBeCloseTo(0.0532, 6);
    expect(change24h({ px: 1, prevDay: 0 })).toBe(0);
  });

  it('prefers a live mid over the snapshot, and keeps the shown price when a snapshot has none newer', () => {
    const live = toMarkets(META_AND_CTXS, { SOL: '190.01' });
    expect(live.find((m) => m.name === 'SOL')!.px).toBe(190.01);
    const prior = Object.fromEntries(live.map((m) => [m.name, m]));
    const again = toMarkets(META_AND_CTXS, {}, prior);
    expect(again.find((m) => m.name === 'SOL')!.px).toBe(190.01);
  });

  it('survives missing or malformed numbers', () => {
    const [meta, ctxs] = structuredClone(META_AND_CTXS);
    ctxs[0] = { ...ctxs[0]!, midPx: null, markPx: 'x', funding: '' };
    const btc = toMarkets([meta, ctxs])[0]!;
    expect(btc.px).toBe(0);
    expect(btc.funding).toBe(0);
  });
});

describe('live updates', () => {
  it('applies mids and remembers the previous price for the flash', () => {
    const ms = toMarkets(META_AND_CTXS);
    expect(applyMids(ms, { BTC: '97200', ETH: '3456.7', NOPE: '1' })).toBe(1);
    const btc = ms[0]!;
    expect(btc.px).toBe(97200);
    expect(btc.prev).toBe(97123.5);
  });

  it('applies a pushed market context and says whether anything changed', () => {
    const ms = toMarkets(META_AND_CTXS);
    const sol = ms.find((m) => m.name === 'SOL')!;
    const ctx = META_AND_CTXS[1][2]!;
    expect(applyCtx(sol, ctx)).toBe(false);
    expect(applyCtx(sol, { ...ctx, funding: '0.0001' })).toBe(true);
    expect(sol.funding).toBe(0.0001);
  });

  it('the store re-orders rows on snapshots only, and batches price renders', async () => {
    const store = new HlStore();
    let renders = 0;
    store.subscribe(() => renders++);
    store.applySnapshot(META_AND_CTXS);
    expect(store.status).toBe('live');
    expect(store.rowsKey).toBe(1);
    expect(renders).toBe(1);
    store.applyMids({ BTC: '97300' });
    store.applyMids({ BTC: '97400' });
    expect(renders).toBe(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(renders).toBe(2);
    expect(store.rowsKey).toBe(1);
    expect(store.byName.BTC!.px).toBe(97400);
    // a later snapshot keeps the live price
    store.applySnapshot(META_AND_CTXS);
    expect(store.byName.BTC!.px).toBe(97400);
  });
});

describe('findMarket', () => {
  const ms = toMarkets(META_AND_CTXS);
  it('matches names case-insensitively, exact case first, and accepts pairs and $tickers', () => {
    expect(findMarket(ms, 'kPEPE')!.name).toBe('kPEPE');
    expect(findMarket(ms, 'kpepe')!.name).toBe('kPEPE');
    expect(findMarket(ms, 'sol')!.name).toBe('SOL');
    expect(findMarket(ms, 'SOL-USD')!.name).toBe('SOL');
    expect(findMarket(ms, '$btc')!.name).toBe('BTC');
    expect(findMarket(ms, 'OLDCOIN')).toBeUndefined();
    expect(findMarket(ms, 'nope')).toBeUndefined();
  });
});

describe('connection state', () => {
  it('says prices may be old when nothing arrives, and live again when prices come back', () => {
    const store = new HlStore();
    store.applySnapshot(META_AND_CTXS);
    const t = Date.now();
    store.checkStale(t + 10_000);
    expect(store.status).toBe('live');
    store.checkStale(t + 46_000);
    expect(store.status).toBe('stale');
    store.applyMids({ BTC: '97123.5' }); // unchanged prices still prove the connection is back
    expect(store.status).toBe('live');
  });

  it('never calls a page stale before anything arrived', () => {
    const store = new HlStore();
    store.checkStale(Date.now() + 100_000);
    expect(store.status).toBe('loading');
  });
});

describe('unitNote', () => {
  it('explains k-markets only', () => {
    expect(unitNote('kPEPE')).toBe('priced per 1,000 PEPE');
    expect(unitNote('SOL')).toBeNull();
    expect(unitNote('kaito')).toBeNull();
  });
});

describe('price channels', () => {
  it('takes mids and marks from the fast channel, and lets allMids in only when it goes quiet', () => {
    const store = new HlStore();
    store.applySnapshot(META_AND_CTXS);
    store.applyFast({ BTC: { midPx: '97500', markPx: '97499' }, '@107': { midPx: '1.0' } });
    expect(store.byName.BTC!.px).toBe(97500);
    expect(store.byName.BTC!.mark).toBe(97499);
    const t = Date.now();
    store.applySlowMids({ BTC: '97000' }, t + 1_000);
    expect(store.byName.BTC!.px).toBe(97500);
    store.applySlowMids({ BTC: '97000' }, t + 11_000);
    expect(store.byName.BTC!.px).toBe(97000);
  });
});

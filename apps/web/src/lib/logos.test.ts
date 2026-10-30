import { describe, expect, it } from 'vitest';
import { LogoStore, iconCandidates, looksLikeSvg } from './logos';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><circle r="1"/></svg>';
const enc = (s: string) => new TextEncoder().encode(s);

/** A stand-in for Hyperliquid: lists BTC and kPEPE, has icons for BTC.svg and PEPE.svg. */
function fakeHyperliquid(opts: { down?: boolean; icons?: Record<string, string> } = {}) {
  const icons = opts.icons ?? { BTC: SVG, PEPE: SVG };
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (opts.down) throw new Error('network down');
    if (u.endsWith('/info'))
      return Response.json({ universe: [{ name: 'BTC' }, { name: 'kPEPE' }, { name: 'ETH' }] });
    const file = decodeURIComponent(u.split('/coins/')[1]!.replace(/\.svg$/, ''));
    return icons[file] ? new Response(icons[file]) : new Response('nope', { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe('logos', () => {
  it('recognizes SVG documents only', () => {
    expect(looksLikeSvg(enc(SVG))).toBe(true);
    expect(looksLikeSvg(enc(`<?xml version="1.0"?>\n${SVG}`))).toBe(true);
    expect(looksLikeSvg(enc('<!doctype html><html></html>'))).toBe(false);
    expect(looksLikeSvg(enc('{"error":"not found"}'))).toBe(false);
  });

  it('looks for a k-market under both names', () => {
    expect(iconCandidates('kPEPE')).toEqual(['kPEPE', 'PEPE']);
    expect(iconCandidates('BTC')).toEqual(['BTC']);
  });

  it('serves listed markets, falls back to the base name, and caches', async () => {
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher);
    expect(new TextDecoder().decode((await store.get('BTC'))!)).toBe(SVG);
    expect(await store.get('kPEPE')).not.toBeNull();
    const n = hl.calls.length;
    await store.get('BTC');
    await store.get('kPEPE');
    expect(hl.calls.length).toBe(n);
  });

  it('never fetches names Hyperliquid does not list', async () => {
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher);
    expect(await store.get('../../etc/passwd')).toBeNull();
    expect(await store.get('NOTLISTED')).toBeNull();
    expect(hl.calls.filter((c) => c.includes('/coins/'))).toEqual([]);
  });

  it('remembers a missing icon for an hour, a network error for a minute', async () => {
    let t = 1_000_000;
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher, () => t);
    expect(await store.get('ETH')).toBeNull(); // listed, no icon
    const n = hl.calls.length;
    t += 30 * 60_000;
    expect(await store.get('ETH')).toBeNull();
    expect(hl.calls.length).toBe(n);
    t += 31 * 60_000;
    await store.get('ETH');
    expect(hl.calls.length).toBeGreaterThan(n);

    const down = fakeHyperliquid({ down: true });
    const s2 = new LogoStore(down.fetcher, () => t);
    expect(await s2.get('BTC')).toBeNull();
  });

  it('fetches a cold icon once however many requests arrive together', async () => {
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher);
    await Promise.all(Array.from({ length: 20 }, () => store.get('BTC')));
    expect(hl.calls.filter((c) => c.endsWith('/coins/BTC.svg'))).toHaveLength(1);
    expect(hl.calls.filter((c) => c.endsWith('/info'))).toHaveLength(1);
  });

  it('rejects icons that are not SVG or are too big', async () => {
    const hl = fakeHyperliquid({
      icons: { BTC: '<html>blocked</html>', ETH: `<svg>${'x'.repeat(200_000)}</svg>` },
    });
    const store = new LogoStore(hl.fetcher);
    expect(await store.get('BTC')).toBeNull();
    expect(await store.get('ETH')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { LogoStore, iconCandidates, looksLikeSvg, renderWebp, type Render } from './logos';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#3DD68C"/></svg>';
const enc = (s: string) => new TextEncoder().encode(s);
const WEBP = enc('RIFF....WEBP');
const fakeRender: Render = async () => WEBP;
const noRender: Render = async () => null;

/**
 * A stand-in for Hyperliquid and CoinGecko. Hyperliquid lists BTC, kPEPE, ETH and PEOPLE, has icons for BTC.svg
 * and PEPE.svg, and answers anything else with its web page (as it does for PEOPLE). CoinGecko knows PEOPLE.
 */
function fakeSources(
  opts: { down?: boolean; icons?: Record<string, string>; gecko?: Record<string, unknown[]> } = {},
) {
  const icons = opts.icons ?? { BTC: SVG, PEPE: SVG };
  const gecko = opts.gecko ?? {
    people: [
      {
        symbol: 'PEOPLE',
        market_cap_rank: 400,
        large: 'https://coin-images.coingecko.com/coins/images/1/large/people.png',
      },
      {
        symbol: 'PEOPLE',
        market_cap_rank: 3000,
        large: 'https://coin-images.coingecko.com/coins/images/2/large/other.png',
      },
      {
        symbol: 'PEOPLEX',
        market_cap_rank: 1,
        large: 'https://coin-images.coingecko.com/coins/images/3/large/x.png',
      },
    ],
  };
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (opts.down) throw new Error('network down');
    if (u.endsWith('/info'))
      return Response.json({
        universe: [{ name: 'BTC' }, { name: 'kPEPE' }, { name: 'ETH' }, { name: 'PEOPLE' }],
      });
    if (u.startsWith('https://api.coingecko.com/'))
      return Response.json({ coins: gecko[decodeURIComponent(u.split('query=')[1]!)] ?? [] });
    if (u.includes('coingecko.com/coins/images/')) return new Response(PNG);
    const file = decodeURIComponent(u.split('/coins/')[1]!.replace(/\.svg$/, ''));
    return icons[file]
      ? new Response(icons[file])
      : new Response('<!DOCTYPE html><html lang="en"></html>', { headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  return { fetcher, calls };
}
const fakeHyperliquid = fakeSources;
const PNG = enc('png bytes');

describe('logos', () => {
  it('recognizes SVG documents, not HTML pages', () => {
    expect(looksLikeSvg(enc(SVG))).toBe(true);
    expect(looksLikeSvg(enc(`<?xml version="1.0"?>\n${SVG}`))).toBe(true);
    expect(looksLikeSvg(enc(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n${SVG}`))).toBe(true);
    expect(looksLikeSvg(enc('<!doctype html><html><body><svg></svg></body></html>'))).toBe(false);
    expect(looksLikeSvg(enc('{"error":"not found"}'))).toBe(false);
  });

  it('looks for a k-market under both names', () => {
    expect(iconCandidates('kPEPE')).toEqual(['kPEPE', 'PEPE']);
    expect(iconCandidates('BTC')).toEqual(['BTC']);
  });

  it('renders a real SVG to a 64 px WebP with sharp', async () => {
    const out = await renderWebp(enc(SVG));
    expect(out).not.toBeNull();
    const head = new TextDecoder().decode(out!.subarray(0, 12));
    expect(head.startsWith('RIFF') && head.endsWith('WEBP')).toBe(true);
    expect(out!.byteLength).toBeLessThan(10_000);
    // a big picture wrapped in an SVG comes out small too
    const big = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${'<rect width="1000" height="1000" fill="#111"/>'.repeat(2000)}</svg>`;
    expect((await renderWebp(enc(big)))!.byteLength).toBeLessThan(10_000);
  });

  it('renders SVGs of any canvas size, tiny or huge', async () => {
    const { default: sharp } = await import('sharp');
    for (const n of [16, 32, 500, 5000, 20000]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}"><circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}" fill="#3DD68C"/></svg>`;
      const out = await renderWebp(enc(svg));
      expect(out, `${n}`).not.toBeNull();
      expect((await sharp(Buffer.from(out!)).metadata()).width, `${n}`).toBe(64);
    }
  });

  it('renders an SVG that wraps a picture (how many memecoin icons are made)', async () => {
    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 95, b: 95, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 400"><image width="400" height="400" xlink:href="data:image/png;base64,${png.toString('base64')}"/></svg>`;
    const out = await renderWebp(enc(wrapped));
    expect(out).not.toBeNull();
    const { width, height } = await sharp(Buffer.from(out!)).metadata();
    expect([width, height]).toEqual([64, 64]);
  });

  it('serves listed markets as WebP, falls back to the base name, and caches', async () => {
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher, Date.now, fakeRender);
    expect(await store.get('BTC')).toEqual({ body: WEBP, type: 'image/webp' });
    expect(await store.get('kPEPE')).not.toBeNull();
    const n = hl.calls.length;
    await store.get('BTC');
    await store.get('kPEPE');
    expect(hl.calls.length).toBe(n);
  });

  it('serves a small SVG as it is if it cannot be rendered, never a big one', async () => {
    const hl = fakeHyperliquid({ icons: { BTC: SVG, ETH: `<svg>${'x'.repeat(400_000)}</svg>` } });
    const store = new LogoStore(hl.fetcher, Date.now, noRender);
    expect((await store.get('BTC'))?.type).toBe('image/svg+xml');
    expect(await store.get('ETH')).toBeNull();
  });

  it('never fetches names Hyperliquid does not list', async () => {
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher, Date.now, fakeRender);
    expect(await store.get('../../etc/passwd')).toBeNull();
    expect(await store.get('NOTLISTED')).toBeNull();
    expect(hl.calls.filter((c) => c.includes('/coins/'))).toEqual([]);
  });

  it('remembers a missing icon for an hour, a network error for a minute', async () => {
    let t = 1_000_000;
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher, () => t, fakeRender);
    expect(await store.get('ETH')).toBeNull(); // listed, no icon
    const n = hl.calls.length;
    t += 30 * 60_000;
    expect(await store.get('ETH')).toBeNull();
    expect(hl.calls.length).toBe(n);
    t += 31 * 60_000;
    await store.get('ETH');
    expect(hl.calls.length).toBeGreaterThan(n);

    const down = fakeHyperliquid({ down: true });
    expect(await new LogoStore(down.fetcher, () => t, fakeRender).get('BTC')).toBeNull();
  });

  it('fetches a cold icon once however many requests arrive together', async () => {
    const hl = fakeHyperliquid();
    const store = new LogoStore(hl.fetcher, Date.now, fakeRender);
    await Promise.all(Array.from({ length: 20 }, () => store.get('BTC')));
    expect(hl.calls.filter((c) => c.endsWith('/coins/BTC.svg'))).toHaveLength(1);
    expect(hl.calls.filter((c) => c.endsWith('/info'))).toHaveLength(1);
  });

  it('asks CoinGecko when Hyperliquid has no icon, taking the best-ranked exact ticker', async () => {
    const src = fakeSources();
    const store = new LogoStore(src.fetcher, Date.now, fakeRender);
    expect(await store.get('PEOPLE')).toEqual({ body: WEBP, type: 'image/webp' });
    expect(src.calls).toContain('https://coin-images.coingecko.com/coins/images/1/large/people.png');
    expect(src.calls.some((c) => c.includes('/images/2/') || c.includes('/images/3/'))).toBe(false);
  });

  it('only takes images from CoinGecko itself, and never asks it when Hyperliquid is down', async () => {
    const evil = fakeSources({
      gecko: { people: [{ symbol: 'PEOPLE', large: 'https://evil.example/x.png' }] },
    });
    expect(await new LogoStore(evil.fetcher, Date.now, fakeRender).get('PEOPLE')).toBeNull();
    expect(evil.calls).not.toContain('https://evil.example/x.png');

    const down = fakeSources({ down: true });
    await new LogoStore(down.fetcher, Date.now, fakeRender).get('PEOPLE');
    expect(down.calls.some((c) => c.includes('coingecko'))).toBe(false);
  });

  it('renders raster icons (PNG) too', async () => {
    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 250, height: 250, channels: 4, background: { r: 61, g: 214, b: 140, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const out = await renderWebp(new Uint8Array(png));
    expect((await sharp(Buffer.from(out!)).metadata()).width).toBe(64);
    expect(await renderWebp(enc('not an image'))).toBeNull();
  });

  it('rejects sources that are not SVG', async () => {
    const hl = fakeHyperliquid({ icons: { BTC: '<html>blocked</html>' } });
    expect(await new LogoStore(hl.fetcher, Date.now, fakeRender).get('BTC')).toBeNull();
  });
});

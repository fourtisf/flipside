import { LogoStore } from '@/lib/logos';

// One store per server process; each of the web workers keeps its own copy (a few hundred kilobytes).
const store = new LogoStore();

const NAME = /^[A-Za-z0-9]{1,24}$/;

/**
 * GET /logos/BTC: the coin's icon as a 64 px WebP, or 404 so the page shows the letter avatar (lib/logos.ts).
 * An older ".svg" address still works. If an SVG is ever served as it is, it is sandboxed: it can't run
 * scripts even if someone opens it on its own.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ coin: string }> }) {
  const name = (await params).coin.replace(/\.(svg|webp)$/, '');
  const icon = NAME.test(name) ? await store.get(name) : null;
  // a short cache: a 404 may only mean Hyperliquid didn't answer this time
  if (!icon) return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
  return new Response(icon.body as BodyInit, {
    headers: {
      'Content-Type': icon.type,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

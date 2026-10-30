import { LogoStore } from '@/lib/logos';

// One store per server process; each of the web workers keeps its own copy (a few hundred kilobytes).
const store = new LogoStore();

const NAME = /^[A-Za-z0-9]{1,24}$/;

/**
 * GET /logos/BTC.svg: the coin's icon, or 404 so the page shows the letter avatar (lib/logos.ts). The SVG is
 * sandboxed: it can't run scripts even if someone opens it on its own.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ coin: string }> }) {
  const name = (await params).coin.replace(/\.svg$/, '');
  const body = NAME.test(name) ? await store.get(name) : null;
  if (!body) return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } });
  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

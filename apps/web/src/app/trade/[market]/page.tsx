import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LiveTradeView } from '@/components/live/LiveTrade';
import { TradeView } from '@/components/trade/TradeView';
import { pair } from '@/hl/markets';
import { LIVE } from '@/lib/edition';
import { COINS, MINTS } from '@/mock/fixtures';

/** `market` is a Hyperliquid coin name ("SOL") on coinside.fun, and a Solana mint in the prototype edition. */
interface Props {
  params: Promise<{ market: string }>;
}

/** A malformed escape in the URL ("/trade/%E0") is just an unknown market, not a server error. */
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const market = decode((await params).market);
  if (LIVE) return { title: pair(market) };
  const c = COINS.find((k) => k.mint === market);
  return { title: c ? `$${c.sym}` : 'Coin not found' };
}

export default async function TradePage({ params }: Props) {
  const market = decode((await params).market);
  // Hyperliquid's list is read in the browser, so an unknown market is reported there.
  if (LIVE) return <LiveTradeView name={market} />;
  // The prototype serves its fixture coins only.
  if (!MINTS.has(market)) notFound();
  return <TradeView mint={market} />;
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TradeView } from '@/components/trade/TradeView';
import { COINS, MINTS } from '@/mock/fixtures';

interface Props {
  params: { mint: string };
}

export function generateMetadata({ params }: Props): Metadata {
  const c = COINS.find((k) => k.mint === params.mint);
  return { title: c ? `$${c.sym}` : 'Coin not found' };
}

export default function TradePage({ params }: Props) {
  // P0 serves the fixture markets only. P1 resolves any pasted mint through the indexer.
  if (!MINTS.has(params.mint)) notFound();
  return <TradeView mint={params.mint} />;
}

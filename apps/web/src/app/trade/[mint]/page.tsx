import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TradeView } from '@/components/trade/TradeView';
import { COINS, MINTS } from '@/mock/fixtures';

interface Props {
  params: Promise<{ mint: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mint } = await params;
  const c = COINS.find((k) => k.mint === mint);
  return { title: c ? `$${c.sym}` : 'Coin not found' };
}

export default async function TradePage({ params }: Props) {
  const { mint } = await params;
  // P0 serves the fixture markets only. P1 resolves any pasted mint through the indexer.
  if (!MINTS.has(mint)) notFound();
  return <TradeView mint={mint} />;
}

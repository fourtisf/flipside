import type { Metadata } from 'next';
import { LivePortfolio } from '@/components/live/LivePortfolio';
import { PortfolioView } from '@/components/PortfolioView';
import { LIVE } from '@/lib/edition';

export const metadata: Metadata = { title: 'Portfolio' };

export default function Page() {
  return LIVE ? <LivePortfolio /> : <PortfolioView />;
}

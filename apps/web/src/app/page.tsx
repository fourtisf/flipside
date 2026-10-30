import { LiveMarketsView } from '@/components/live/LiveMarkets';
import { MarketsView } from '@/components/markets/MarketsView';
import { LIVE } from '@/lib/edition';

export default function MarketsPage() {
  return LIVE ? <LiveMarketsView /> : <MarketsView />;
}

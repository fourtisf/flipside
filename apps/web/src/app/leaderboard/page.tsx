import type { Metadata } from 'next';
import { LeaderboardView } from '@/components/LeaderboardView';

export const metadata: Metadata = { title: 'Leaderboard' };

export default function Page() {
  return <LeaderboardView />;
}

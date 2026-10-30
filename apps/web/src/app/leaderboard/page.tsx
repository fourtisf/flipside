import type { Metadata } from 'next';
import { LeaderboardView } from '@/components/LeaderboardView';
import { PreLaunchPage } from '@/components/PreLaunch';
import { LIVE } from '@/lib/edition';

export const metadata: Metadata = { title: 'Leaderboard' };

export default function Page() {
  if (LIVE)
    return (
      <PreLaunchPage
        id="v-leaderboard"
        title="Leaderboard"
        intro="The most profitable traders, today and this week."
        state="Starts with trading"
        note="Rankings and the weekly competition begin when trading opens."
        link={['/', 'Browse markets']}
      />
    );
  return <LeaderboardView />;
}

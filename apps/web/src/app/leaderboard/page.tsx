import type { Metadata } from 'next';
import { LeaderboardView } from '@/components/LeaderboardView';
import { PreLaunchPage } from '@/components/PreLaunch';
import { PRELAUNCH } from '@/lib/edition';

export const metadata: Metadata = { title: 'Leaderboard' };

export default function Page() {
  if (PRELAUNCH)
    return (
      <PreLaunchPage
        id="v-leaderboard"
        title="Leaderboard"
        intro="The most profitable traders, today and this week."
        state="Starts with trading"
        note="Rankings, the weekly prize and copy trading begin when trading opens."
        link={['/', 'Browse markets']}
      />
    );
  return <LeaderboardView />;
}

import type { Metadata } from 'next';
import { PortfolioView } from '@/components/PortfolioView';
import { PreLaunchPage } from '@/components/PreLaunch';
import { PRELAUNCH } from '@/lib/edition';

export const metadata: Metadata = { title: 'Portfolio' };

export default function Page() {
  if (PRELAUNCH)
    return (
      <PreLaunchPage
        id="v-portfolio"
        title="Portfolio"
        intro="Your balance, open positions and trade history, once trading opens."
        state="Trading opens soon"
        note="Positions and P&L show up here as soon as it does."
        link={['/', 'Browse markets']}
      />
    );
  return <PortfolioView />;
}

import type { Metadata } from 'next';
import { PortfolioView } from '@/components/PortfolioView';
import { PreLaunchPage } from '@/components/PreLaunch';
import { LIVE } from '@/lib/edition';

export const metadata: Metadata = { title: 'Portfolio' };

export default function Page() {
  if (LIVE)
    return (
      <PreLaunchPage
        id="v-portfolio"
        title="Portfolio"
        intro="Your Hyperliquid account from your Solana wallet: balance, open positions, orders and trade history."
        state="Connecting a wallet comes next"
        note="Once you can connect, this page reads your account straight from Hyperliquid."
        link={['/', 'Browse markets']}
      />
    );
  return <PortfolioView />;
}

import type { Metadata } from 'next';
import { PoolView } from '@/components/PoolView';
import { PreLaunchPage } from '@/components/PreLaunch';
import { PRELAUNCH } from '@/lib/edition';

export const metadata: Metadata = { title: 'Pool' };

export default function Page() {
  if (PRELAUNCH)
    return (
      <PreLaunchPage
        id="v-pool"
        title="The pool"
        intro="The pool is the other side of every trade. It keeps losing stakes, pays winners at once and earns 80% of every trading fee. Anyone can add SOL and own a share."
        state="Opens with trading"
        note="Deposits, the share price, exposure per coin and the safety switches go live here on launch day."
        link={['/docs#d-guards', 'How the pool is protected']}
      />
    );
  return <PoolView />;
}

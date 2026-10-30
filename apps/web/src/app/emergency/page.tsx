import type { Metadata } from 'next';
import { EmergencyView } from '@/components/EmergencyView';
import { PreLaunchPage } from '@/components/PreLaunch';
import { PRELAUNCH } from '@/lib/edition';

export const metadata: Metadata = { title: 'Emergency withdraw' };

export default function Page() {
  if (PRELAUNCH)
    return (
      <PreLaunchPage
        id="v-emergency"
        title="Emergency withdraw"
        intro="If the engine stops posting balance proofs for 72 hours, you can withdraw your full balance straight from the vault program, profits included. You don't need us online to do it."
        state="Starts with deposits"
        note="Balance proofs are posted every 5 minutes once deposits open. Until then there is nothing to withdraw."
        link={['/docs#d-guards', 'How it works']}
      />
    );
  return <EmergencyView />;
}

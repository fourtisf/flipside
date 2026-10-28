import type { Metadata } from 'next';
import { EmergencyView } from '@/components/EmergencyView';

export const metadata: Metadata = { title: 'Emergency withdraw' };

export default function Page() {
  return <EmergencyView />;
}

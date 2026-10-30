import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmergencyView } from '@/components/EmergencyView';
import { LIVE } from '@/lib/edition';

export const metadata: Metadata = { title: 'Emergency withdraw' };

/** Part of the original own-pool design (prototype edition). On Hyperliquid there is no pool or vault. */
export default function Page() {
  if (LIVE) notFound();
  return <EmergencyView />;
}

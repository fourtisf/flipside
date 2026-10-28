import type { Metadata } from 'next';
import { PoolView } from '@/components/PoolView';

export const metadata: Metadata = { title: 'Pool' };

export default function Page() {
  return <PoolView />;
}

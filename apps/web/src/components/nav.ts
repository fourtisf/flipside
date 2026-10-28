'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { maxLev, type Side } from '@/mock/sim';
import { useSim } from '@/mock/provider';

export const tradeHref = (mint: string) => `/trade/${mint}`;

/** Prototype openTrade(): select the coin, optionally the side, clamp leverage, go to the terminal. */
export function useOpenTrade() {
  const sim = useSim();
  const router = useRouter();
  return useCallback(
    (sym: string, side?: Side) => {
      const c = sim.bySym[sym];
      if (!c) return;
      sim.set((s) => {
        if (side) s.order.side = side;
        if (s.order.lev > maxLev(c)) s.order.lev = 2;
        s.sel = sym;
      });
      router.push(tradeHref(c.mint));
    },
    [sim, router],
  );
}

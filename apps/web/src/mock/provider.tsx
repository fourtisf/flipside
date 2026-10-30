'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Sim } from './sim';

const SimContext = createContext<Sim | null>(null);

/** Owns the mock engine for the whole app. Lives in the root layout, so it survives navigation. */
export function SimProvider({ children }: { children: ReactNode }) {
  const [sim] = useState(() => new Sim());
  useEffect(() => sim.start(), [sim]);
  return <SimContext.Provider value={sim}>{children}</SimContext.Provider>;
}

/** Subscribe to the mock engine. Components re-render on every tick or action, like the prototype. */
export function useSim(): Sim {
  const sim = useContext(SimContext);
  if (!sim) throw new Error('useSim must be used inside <SimProvider>');
  useSyncExternalStore(sim.subscribe, sim.getVersion, sim.getVersion);
  return sim;
}

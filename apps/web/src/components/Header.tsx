'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_MARKET, marketHref } from '@/hl/markets';
import { useHlValue } from '@/hl/provider';
import { LIVE } from '@/lib/edition';
import { shortA, sol } from '@/lib/format';
import { useSim } from '@/mock/provider';
import { LiveSearchBox } from './live/LiveSearch';
import { tradeHref, useOpenTrade } from './nav';
import { SearchBox } from './Search';
import { LogoMark, SearchIcon } from './ui';

export type NavKey = 'markets' | 'trade' | 'portfolio' | 'pool' | 'leaders' | 'docs';

export function navKey(pathname: string): NavKey | null {
  if (pathname === '/') return 'markets';
  if (pathname.startsWith('/trade')) return 'trade';
  if (pathname.startsWith('/portfolio')) return 'portfolio';
  if (pathname.startsWith('/pool')) return 'pool';
  if (pathname.startsWith('/leaderboard')) return 'leaders';
  if (pathname.startsWith('/docs')) return 'docs';
  return null;
}

const hrefs = (trade: string): Record<NavKey, string> => ({
  markets: '/',
  trade,
  portfolio: '/portfolio',
  pool: '/pool',
  leaders: '/leaderboard',
  docs: '/docs',
});

function useSimNavHrefs(): Record<NavKey, string> {
  const sim = useSim();
  return hrefs(tradeHref(sim.bySym[sim.sel]!.mint));
}

function useLiveNavHrefs(): Record<NavKey, string> {
  return hrefs(marketHref(useHlValue((s) => s.sel) || DEFAULT_MARKET));
}

/** Where each nav item goes; Trade opens the market you last looked at. Fixed per build (lib/edition.ts). */
export const useNavHrefs = LIVE ? useLiveNavHrefs : useSimNavHrefs;

/** Hyperliquid has no pool for anyone to deposit in, so the live edition has no Pool page. */
export const NAV: Array<[NavKey, string]> = (
  [
    ['markets', 'Markets'],
    ['trade', 'Trade'],
    ['portfolio', 'Portfolio'],
    ['pool', 'Pool'],
    ['leaders', 'Leaderboard'],
    ['docs', 'Docs'],
  ] as Array<[NavKey, string]>
).filter(([k]) => !(LIVE && k === 'pool'));

/** Focus #q2 once the markets page has rendered it (after a client navigation). */
function focusWhenReady(sel: string, tries = 60) {
  const el = document.querySelector<HTMLInputElement>(sel);
  if (el) el.focus();
  else if (tries > 0) requestAnimationFrame(() => focusWhenReady(sel, tries - 1));
}

/** The header's frame: logo, nav, search, and whatever sits at the right (wallet or "Trading opens soon"). */
function HeaderFrame({ search, children }: { search: (kbd: ReactNode) => ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = useNavHrefs();
  const active = navKey(pathname);
  const [kbd, setKbd] = useState('⌘K');

  useEffect(() => {
    setKbd(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K');
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) return;
      e.preventDefault();
      const box = document.querySelector('.search');
      if (box && getComputedStyle(box).display !== 'none')
        document.querySelector<HTMLInputElement>('#q1')?.focus();
      else {
        if (window.location.pathname !== '/') router.push('/');
        focusWhenReady('#q2');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <header className="hdr">
      <div className="hdr-in">
        <Link className="logo" href="/" aria-label="Coinside, go to markets">
          <LogoMark />
          <span>Coinside</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map(([k, label]) => (
            <Link key={k} href={links[k]} aria-current={active === k ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="hdr-r">
          {search(<kbd id="kbd">{kbd}</kbd>)}
          {children}
        </div>
      </div>
    </header>
  );
}

/** coinside.fun: search Hyperliquid's markets; trading isn't open yet. */
function LiveHeader() {
  const router = useRouter();
  return (
    <HeaderFrame
      search={(kbd) => (
        <LiveSearchBox
          id="q1"
          className="search"
          placeholder="Search markets"
          label="Search Hyperliquid markets"
          onPick={(name) => router.push(marketHref(name))}
          before={<SearchIcon />}
          after={kbd}
        />
      )}
    >
      <div id="walletbox" style={{ display: 'flex', gap: 8 }}>
        <span className="soon">Trading opens soon</span>
      </div>
    </HeaderFrame>
  );
}

/** The prototype: simulated wallet, Real and Practice modes. */
function SimHeader() {
  const sim = useSim();
  const openTrade = useOpenTrade();
  const bal = sim.bal();
  let wallet;
  if (sim.mode === 'practice')
    wallet =
      bal > 0n ? (
        <span className="bal n">
          {sol(bal)}
          <small>paper SOL</small>
        </span>
      ) : (
        <button className="btn w" onClick={() => sim.claim()}>
          Claim 10 paper SOL
        </button>
      );
  else if (!sim.wallet)
    wallet = (
      <button className="btn w" onClick={() => sim.requestConnect()}>
        Connect wallet
      </button>
    );
  else
    wallet = (
      <>
        <span className="bal n">
          {sol(bal)}
          <small>SOL</small>
        </span>
        <button className="btn o n" title="Simulated wallet" onClick={() => sim.walletMenu()}>
          {shortA(sim.wallet)}
        </button>
      </>
    );

  return (
    <HeaderFrame
      search={(kbd) => (
        <SearchBox
          id="q1"
          className="search"
          placeholder="Search or paste address"
          label="Search coins or paste a contract address"
          onPick={(c) => openTrade(c.sym)}
          before={<SearchIcon />}
          after={kbd}
        />
      )}
    >
      <div className="seg" role="group" aria-label="Trading mode" id="modeT">
        {(['real', 'practice'] as const).map((m) => (
          <button key={m} data-mode={m} aria-pressed={sim.mode === m} onClick={() => sim.setMode(m)}>
            {m === 'real' ? 'Real' : 'Practice'}
          </button>
        ))}
      </div>
      <div id="walletbox" style={{ display: 'flex', gap: 8 }}>
        {wallet}
      </div>
    </HeaderFrame>
  );
}

export const Header = LIVE ? LiveHeader : SimHeader;

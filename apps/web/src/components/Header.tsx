'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { shortA, sol } from '@/lib/format';
import { useSim } from '@/mock/provider';
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

export function useNavHrefs(): Record<NavKey, string> {
  const sim = useSim();
  return {
    markets: '/',
    trade: tradeHref(sim.bySym[sim.sel]!.mint),
    portfolio: '/portfolio',
    pool: '/pool',
    leaders: '/leaderboard',
    docs: '/docs',
  };
}

const NAV: Array<[NavKey, string]> = [
  ['markets', 'Markets'],
  ['trade', 'Trade'],
  ['portfolio', 'Portfolio'],
  ['pool', 'Pool'],
  ['leaders', 'Leaderboard'],
  ['docs', 'Docs'],
];

/** Focus #q2 once the markets page has rendered it (after a client navigation). */
function focusWhenReady(sel: string, tries = 60) {
  const el = document.querySelector<HTMLInputElement>(sel);
  if (el) el.focus();
  else if (tries > 0) requestAnimationFrame(() => focusWhenReady(sel, tries - 1));
}

export function Header() {
  const sim = useSim();
  const pathname = usePathname();
  const router = useRouter();
  const openTrade = useOpenTrade();
  const hrefs = useNavHrefs();
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
    <header className="hdr">
      <div className="hdr-in">
        <Link className="logo" href="/" aria-label="Coinside, go to markets">
          <LogoMark />
          <span>Coinside</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map(([k, label]) => (
            <Link key={k} href={hrefs[k]} aria-current={active === k ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="hdr-r">
          <SearchBox
            id="q1"
            className="search"
            placeholder="Search or paste address"
            label="Search coins or paste a contract address"
            onPick={(c) => openTrade(c.sym)}
            before={<SearchIcon />}
            after={<kbd id="kbd">{kbd}</kbd>}
          />
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
        </div>
      </div>
    </header>
  );
}

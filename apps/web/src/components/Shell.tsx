'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type JSX } from 'react';
import { fixed, shortA, sol } from '@/lib/format';
import { useSim } from '@/mock/provider';
import { navKey, useNavHrefs, type NavKey } from './Header';
import { LIVE } from '@/lib/edition';
import { useDialog } from './dialog';
import { LogoMark } from './ui';

export function Footer() {
  const hrefs = useNavHrefs();
  return (
    <footer>
      <div className="wrap">
        <div className="ft">
          <div>
            <span className="logo">
              <LogoMark />
              Coinside
            </span>
            <p>
              {LIVE
                ? "Long or short on every Hyperliquid market from your Solana wallet, on Hyperliquid's order book."
                : 'Long or short any Solana coin by its contract address, filled against an on-chain pool.'}
            </p>
          </div>
          <div>
            <h2 className="h4">Product</h2>
            <ul>
              <li>
                <Link href="/">Markets</Link>
              </li>
              <li>
                <Link href={hrefs.trade}>Trade</Link>
              </li>
              {!LIVE && (
                <li>
                  <Link href="/pool">Pool</Link>
                </li>
              )}
              <li>
                <Link href="/leaderboard">Leaderboard</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="h4">Resources</h2>
            <ul>
              <li>
                <Link href="/docs">How it works</Link>
              </li>
              <li>
                <Link href="/docs#d-rules">Fees and rules</Link>
              </li>
              <li>
                <Link href="/docs#d-risks">Risks</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="h4">Community</h2>
            <ul>
              <li>
                <a href="#" onClick={(e) => e.preventDefault()}>
                  X
                </a>
              </li>
              <li>
                <a href="#" onClick={(e) => e.preventDefault()}>
                  Telegram
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="fb">
          <span>
            {LIVE ? 'Coinside, built on Hyperliquid.' : 'Coinside on Solana.'} Charts by{' '}
            <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
              TradingView
            </a>
            {LIVE ? (
              <>
                , a few coin icons by{' '}
                <a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">
                  CoinGecko
                </a>
                .
              </>
            ) : (
              '.'
            )}
          </span>
          <span>
            {LIVE
              ? 'Prices are live from Hyperliquid. Trading is not open yet.'
              : 'Prototype with simulated prices, trades and wallets. Nothing here moves real SOL.'}
          </span>
        </div>
      </div>
    </footer>
  );
}

const TABS: Array<[NavKey, string, JSX.Element]> = [
  [
    'markets',
    'Markets',
    <svg
      key="i"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#6E6E6E"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 15l4-5 3 3 6-8" />
    </svg>,
  ],
  [
    'trade',
    'Trade',
    <svg
      key="i"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#6E6E6E"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M6 3v14M14 3v14" />
      <rect x="4" y="6" width="4" height="6" rx="1" />
      <rect x="12" y="8" width="4" height="5" rx="1" />
    </svg>,
  ],
  [
    'portfolio',
    'Portfolio',
    <svg
      key="i"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#6E6E6E"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="14" height="11" rx="2.5" />
      <path d="M13 10.5h4" />
    </svg>,
  ],
  [
    'pool',
    'Pool',
    <svg
      key="i"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#6E6E6E"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <ellipse cx="10" cy="6" rx="6" ry="2.5" />
      <path d="M4 6v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
    </svg>,
  ],
  [
    'leaders',
    'Leaders',
    <svg
      key="i"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#6E6E6E"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M4 16V10M10 16V4M16 16v-8" />
    </svg>,
  ],
];

export function TabBar() {
  const active = navKey(usePathname());
  const hrefs = useNavHrefs();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.filter(([k]) => !(LIVE && k === 'pool')).map(([k, label, icon]) => (
        <Link key={k} href={hrefs[k]} aria-current={active === k ? 'page' : undefined}>
          {icon}
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function WalletDialog() {
  const sim = useSim();
  const ref = useDialog(sim.dialogs.wallets, (v) => sim.closeWalletDialog(v || null));
  return (
    <dialog id="wallets" aria-labelledby="wT" ref={ref}>
      <form method="dialog">
        <h3 id="wT">Connect a wallet</h3>
        <p>Pick the Solana wallet you want to trade with. Only this wallet can withdraw what it deposits.</p>
        <div className="wl" id="wl">
          <button value="Phantom">
            <i>P</i>Phantom<small>Detected</small>
          </button>
          <button value="Solflare">
            <i>S</i>Solflare<small>Detected</small>
          </button>
          <button value="Backpack">
            <i>B</i>Backpack<small>Install</small>
          </button>
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          Prototype: no wallet is actually opened.
        </p>
        <div className="dlg-a">
          <button className="btn o" value="cancel">
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function FundDialog() {
  const sim = useSim();
  const kind = sim.dialogs.fund;
  const [amt, setAmt] = useState('1');
  const [shown, setShown] = useState<'deposit' | 'withdraw'>('deposit');
  const ref = useDialog(kind !== null, (v) => sim.closeFund(v === 'ok', amt));
  useEffect(() => {
    if (!kind) return;
    setShown(kind);
    setAmt(kind === 'deposit' ? '1' : fixed(sim.bal()));
    // only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  const dep = shown === 'deposit';
  return (
    <dialog id="fund" aria-labelledby="fundT" ref={ref}>
      <form method="dialog">
        <h3 id="fundT">{dep ? 'Deposit SOL' : 'Withdraw SOL'}</h3>
        <p id="fundN">
          {dep
            ? 'SOL goes into the vault program and is credited to your balance in seconds.'
            : `You can withdraw up to ${sol(sim.bal())} SOL. It goes back to ${shortA(sim.wallet ?? '')}, the wallet that deposited.`}
        </p>
        <div className="amt">
          <label htmlFor="fundAmt" className="vh">
            Amount
          </label>
          <input id="fundAmt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <span>SOL</span>
        </div>
        <p className="hint">Prototype: no real transaction is sent.</p>
        <div className="dlg-a">
          <button className="btn o" value="cancel">
            Cancel
          </button>
          <button className="btn w" value="ok" id="fundOk">
            {dep ? 'Deposit' : 'Withdraw'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function Toasts() {
  const sim = useSim();
  return (
    <div className="toasts" id="toasts" aria-live="polite">
      {sim.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <i></i>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

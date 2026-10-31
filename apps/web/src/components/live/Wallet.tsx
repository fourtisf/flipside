'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { shortAddr } from '@/wallet/catalog';
import { useAccount, useWallet } from '@/wallet/provider';
import type { WalletOption } from '@/wallet/store';
import { useDialog } from '../dialog';

/** "$12,345.67" */
export const usd2 = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Where a Hyperliquid account can be looked up. */
export const explorerUrl = (address: string) => `https://app.hyperliquid.xyz/explorer/address/${address}`;

/** A wallet's logo, or its first letter if it has none. */
export function WalletIcon({ icon, name, size = 28 }: { icon: string; name: string; size?: number }) {
  if (!icon) return <i aria-hidden="true">{name[0]}</i>;
  // eslint-disable-next-line @next/next/no-img-element -- tiny static logos (or a wallet's own data: icon)
  return <img src={icon} alt="" width={size} height={size} />;
}

const isMobile = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** The header's wallet area: Connect wallet, or the account value and the connected address. */
export function WalletButton() {
  const wallet = useWallet();
  const account = useAccount();
  if (wallet.status !== 'connected' || !wallet.address)
    return (
      <button
        className="btn w"
        id="connect"
        disabled={wallet.status === 'connecting'}
        onClick={() => wallet.set((s) => void (s.dialog = 'connect'))}
      >
        {wallet.status === 'connecting' ? 'Connecting' : 'Connect wallet'}
      </button>
    );
  return (
    <>
      {account.summary && (
        <span className="bal n" id="acct">
          {usd2(account.summary.value)}
          <small>USDC</small>
        </span>
      )}
      <button
        className="btn o n wbtn"
        id="walletBtn"
        aria-label={`${wallet.name} ${wallet.address}, open wallet menu`}
        onClick={() => wallet.set((s) => void (s.dialog = 'menu'))}
      >
        <WalletIcon icon={wallet.icon} name={wallet.name} size={18} />
        {shortAddr(wallet.address)}
      </button>
    </>
  );
}

function OptionRow({ o, busy, mobile }: { o: WalletOption; busy: boolean; mobile: boolean }) {
  const wallet = useWallet();
  if (o.installed)
    return (
      <button type="button" data-wallet={o.key} disabled={busy} onClick={() => void wallet.connect(o.key)}>
        <WalletIcon icon={o.icon} name={o.name} />
        {o.name}
        <small>Detected</small>
      </button>
    );
  // not installed: on a phone, open Coinside inside the wallet's app; elsewhere, its download page
  return (
    <a
      href={o.install}
      target="_blank"
      rel="noopener noreferrer"
      data-wallet={o.key}
      onClick={(e) => {
        if (!mobile || !o.open) return;
        e.preventDefault();
        window.location.href = o.open(window.location.href);
      }}
    >
      <WalletIcon icon={o.icon} name={o.name} />
      {o.name}
      <small>{mobile && o.open ? 'Open app' : 'Install'}</small>
    </a>
  );
}

/** Pick a wallet. Installed ones connect; the rest link to their download page or mobile app. */
export function ConnectDialog() {
  const wallet = useWallet();
  const ref = useDialog(wallet.dialog === 'connect', () =>
    wallet.set((s) => {
      if (s.dialog === 'connect') s.dialog = null;
    }),
  );
  const options = wallet.options();
  const busy = wallet.status === 'connecting';
  // known only in the browser, so the first render matches the server's
  const [mobile, setMobile] = useState(false);
  useEffect(() => setMobile(isMobile()), []);
  return (
    <dialog id="wallets" aria-labelledby="wT" ref={ref}>
      <form method="dialog">
        <h3 id="wT">Connect a wallet</h3>
        <p>
          Hyperliquid accounts use Ethereum-style addresses (0x…), so your wallet may say Ethereum. No ETH is
          needed and nothing happens on Ethereum: you deposit and withdraw in SOL. Connecting only reads your
          address.
        </p>
        <div className="wl" id="wl">
          {options.map((o) => (
            <OptionRow key={o.key} o={o} busy={busy} mobile={mobile} />
          ))}
        </div>
        <p className="omsg" id="wErr" role="alert">
          {wallet.error}
        </p>
        <p className="hint">
          Solana-only wallets such as Solflare can&apos;t hold a Hyperliquid account yet.
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

/** The connected wallet: its address, account value, and the way out. */
export function WalletMenu() {
  const wallet = useWallet();
  const account = useAccount();
  const [copied, setCopied] = useState(false);
  const ref = useDialog(wallet.dialog === 'menu', () =>
    wallet.set((s) => {
      if (s.dialog === 'menu') s.dialog = null;
    }),
  );
  useEffect(() => setCopied(false), [wallet.dialog]);
  const a = wallet.address;
  return (
    <dialog id="walletMenu" aria-labelledby="wmT" ref={ref}>
      <form method="dialog">
        {a && (
          <>
            <div className="wm-h">
              <WalletIcon icon={wallet.icon} name={wallet.name} size={36} />
              <div>
                <h3 id="wmT" className="n">
                  {shortAddr(a)}
                </h3>
                <p>Connected with {wallet.name}</p>
              </div>
            </div>
            <dl className="sum">
              <div>
                <dt>Account value</dt>
                <dd>{account.summary ? usd2(account.summary.value) : '…'}</dd>
              </div>
              <div>
                <dt>Withdrawable</dt>
                <dd>{account.summary ? usd2(account.summary.withdrawable) : '…'}</dd>
              </div>
            </dl>
            <div className="wm-a">
              <button
                type="button"
                className="btn o"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(a)
                    .then(() => setCopied(true))
                    .catch(() => {})
                }
              >
                {copied ? 'Copied' : 'Copy address'}
              </button>
              <a className="btn o" href={explorerUrl(a)} target="_blank" rel="noopener noreferrer">
                View on Hyperliquid
              </a>
              <Link
                className="btn o"
                href="/portfolio"
                onClick={() => wallet.set((s) => void (s.dialog = null))}
              >
                Portfolio
              </Link>
            </div>
          </>
        )}
        <div className="dlg-a">
          <button type="button" className="btn o" id="disconnect" onClick={() => wallet.disconnect()}>
            Disconnect
          </button>
          <button className="btn w" value="close">
            Done
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** The amount field's note: what the account can use, once a wallet is connected. */
export function AvailableNote() {
  const wallet = useWallet();
  const account = useAccount();
  if (wallet.status !== 'connected' || !account.summary) return <b>Margin in USDC</b>;
  return <b>Available {usd2(account.summary.withdrawable)}</b>;
}

'use client';

import type { AbstractViemJsonRpcAccount } from '@nktkas/hyperliquid/signing';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { walletSigner } from '@/trade/signer';
import { WALLETS, shortAddr, walletByRdns, walletFromFlags, type WalletInfo } from './catalog';
import { deriveKey, keyAddress, signInBytes, signInProblem } from './derive';
import { shortSol, type SolanaStore } from './solana';

/** The part of an EIP-1193 provider (an injected wallet) that Coinside uses. */
export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): void;
  removeListener?(event: string, listener: (...args: never[]) => void): void;
}

/** What a wallet announces about itself under EIP-6963 (multi-wallet discovery). */
export interface Announced {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
}

/** One row of the connect dialog: a catalog wallet (installed or not) or another wallet that announced itself. */
export interface WalletOption {
  /** rdns for announced wallets, "legacy" for an old-style window.ethereum, else the catalog id. */
  key: string;
  name: string;
  icon: string;
  installed: boolean;
  install?: string;
  open?: (url: string) => string;
}

export type Address = `0x${string}`;
const SAVED = 'coinside.wallet';
/** The Hyperliquid address derived for a Solana wallet (public; the key itself is never stored). */
const DERIVED = (sol: string) => `coinside.hl.${sol}`;
/** How long the derived account key stays in memory after the wallet signs for it. */
const KEY_TTL_MS = 120_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** What to tell someone when their wallet says no, in words that say what happened and what to do. */
export function connectError(name: string, e: unknown): string {
  const code = (e as { code?: number } | null)?.code;
  if (code === 4001 || /reject|denied|cancel/i.test(String((e as Error | null)?.message)))
    return `You closed the request in ${name}. Try again when you're ready.`;
  if (code === -32002) return `${name} is already asking you to connect. Open ${name} to answer.`;
  return `${name} couldn't connect. Unlock it and try again, or pick another wallet.`;
}

const firstAddress = (accounts: unknown): Address | null => {
  const a = Array.isArray(accounts) ? accounts[0] : null;
  return typeof a === 'string' && ADDRESS.test(a) ? (a.toLowerCase() as Address) : null;
};

const safeStorage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // private mode: the wallet just won't reconnect on the next visit
    }
  },
};

/**
 * The connected wallet, as an external store. Finds installed wallets with EIP-6963 (and an old-style
 * window.ethereum as a fallback), connects with eth_requestAccounts, and on the next visit reconnects
 * silently with eth_accounts if the wallet still allows this site. Connecting only reads the address: nothing
 * is signed until trading opens.
 */
export class WalletStore {
  status: 'idle' | 'connecting' | 'connected' = 'idle';
  /** The Hyperliquid account: the 0x wallet's own address, or the one derived for a Solana wallet. */
  address: Address | null = null;
  /** How the account is held: a 0x wallet, or a Solana wallet through a derived key. */
  kind: 'evm' | 'solana' | null = null;
  /** The Solana wallet's address, when the account comes from one. */
  solAddress: string | null = null;
  /** While connecting a Solana wallet: what the wallet is being asked for. */
  step: 'connect' | 'sign' | 'check' | null = null;
  /** The connected wallet's name and icon. */
  name = '';
  icon = '';
  /** Which dialog is open: picking a wallet, or the connected wallet's menu. */
  dialog: 'connect' | 'menu' | null = null;
  error = '';
  /** Installed wallets that announced themselves, by rdns. */
  announced = new Map<string, Announced>();
  legacy: Eip1193 | null = null;

  version = 0;
  private listeners = new Set<() => void>();
  private active: Eip1193 | null = null;
  private master: { key: `0x${string}`; at: number } | null = null;

  constructor(private readonly solana: SolanaStore | null = null) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  set(fn: (s: this) => void) {
    fn(this);
    this.emit();
  }

  /** Every catalog wallet, installed ones first, then other wallets that announced themselves. */
  options(): WalletOption[] {
    const rows: WalletOption[] = [];
    const used = new Set<string>();
    for (const w of WALLETS) {
      const found = w.rdns.map((r) => this.announced.get(r)).find(Boolean);
      if (found) used.add(found.info.rdns);
      const legacy = !found && this.legacy && walletFromFlags(this.legacy as never)?.id === w.id;
      rows.push({
        key: found ? found.info.rdns : legacy ? 'legacy' : w.id,
        name: w.name,
        icon: w.logo,
        installed: !!found || !!legacy,
        install: w.install,
        open: w.open,
      });
    }
    for (const a of this.announced.values())
      if (!used.has(a.info.rdns))
        rows.push({ key: a.info.rdns, name: a.info.name, icon: a.info.icon, installed: true });
    // a wallet that injects the old way and isn't in the catalog
    if (this.legacy && !rows.some((r) => r.key === 'legacy') && !this.announced.size)
      rows.push({ key: 'legacy', name: 'Browser wallet', icon: '', installed: true });
    return rows.sort((a, b) => Number(b.installed) - Number(a.installed));
  }

  private providerFor(key: string): { provider: Eip1193; name: string; icon: string } | null {
    if (key === 'legacy' && this.legacy) {
      const w = walletFromFlags(this.legacy as never);
      return { provider: this.legacy, name: w?.name ?? 'Browser wallet', icon: w?.logo ?? '' };
    }
    const a = this.announced.get(key);
    if (!a) return null;
    // the catalog's name and logo for known wallets, so the dialog and the header match
    const w: WalletInfo | undefined = walletByRdns(a.info.rdns);
    return { provider: a.provider, name: w?.name ?? a.info.name, icon: w?.logo ?? a.info.icon };
  }

  private onAccounts = (accounts: unknown) => {
    const a = firstAddress(accounts);
    if (a) this.set((s) => void (s.address = a));
    else this.disconnect();
  };

  /** Installed Solana wallets, for signing in with Solana alone. */
  solanaOptions(): WalletOption[] {
    return (this.solana?.wallets ?? []).map((w) => {
      const known = WALLETS.find(
        (c) => c.name.toLowerCase().split(' ')[0] === w.name.toLowerCase().split(' ')[0],
      );
      return { key: `sol:${w.name}`, name: w.name, icon: w.icon || known?.logo || '', installed: true };
    });
  }

  /** What the header shows: the Solana address for a Solana sign-in, else the 0x address. */
  label(): string {
    if (this.kind === 'solana' && this.solAddress) return shortSol(this.solAddress);
    return this.address ? shortAddr(this.address) : '';
  }

  private attach(key: string, p: { provider: Eip1193; name: string; icon: string }, address: Address) {
    this.detach();
    this.kind = 'evm';
    this.solAddress = null;
    this.active = p.provider;
    p.provider.on?.('accountsChanged', this.onAccounts as never);
    safeStorage.set(SAVED, key);
    this.set((s) => {
      s.status = 'connected';
      s.address = address;
      s.name = p.name;
      s.icon = p.icon;
      s.error = '';
      s.dialog = null;
    });
  }

  private attachSolana(name: string, icon: string, sol: string, address: Address) {
    this.detach();
    safeStorage.set(SAVED, `sol:${name}`);
    this.set((s) => {
      s.kind = 'solana';
      s.status = 'connected';
      s.address = address;
      s.solAddress = sol;
      s.name = name;
      s.icon = icon;
      s.error = '';
      s.step = null;
      s.dialog = null;
    });
  }

  /** The connected wallet's provider, for signing (trading). */
  provider(): Eip1193 | null {
    return this.active;
  }

  /** The account can sign actions now: a 0x wallet, or a Solana wallet that can sign messages. */
  canSign(): boolean {
    if (!this.address) return false;
    return this.kind === 'solana' ? !!this.solana?.canSignMessage() : !!this.active;
  }

  /**
   * The signer for account actions (approve a trading key, move funds). A 0x wallet signs them itself; for a
   * Solana sign-in, the Solana wallet signs the sign-in message again (one prompt) and the account key is derived
   * from it, checked against the account's address, and kept in memory for two minutes only.
   */
  async signer(): Promise<AbstractViemJsonRpcAccount | PrivateKeyAccount> {
    if (!this.address) throw new Error('Connect a wallet first.');
    if (this.kind !== 'solana') {
      if (!this.active) throw new Error('Connect a wallet first.');
      return walletSigner(this.active, this.address);
    }
    if (this.master && Date.now() - this.master.at < KEY_TTL_MS) return privateKeyToAccount(this.master.key);
    if (!this.solana || !this.solAddress) throw new Error('Connect your Solana wallet first.');
    const sig = await this.solana.signMessage(signInBytes());
    const problem = signInProblem(this.solAddress, sig);
    if (problem) throw new Error(problem);
    const key = deriveKey(sig);
    if (keyAddress(key) !== this.address)
      throw new Error(
        `${this.name} signed differently than when this account was opened, so it can't act for it. Sign in again.`,
      );
    this.master = { key, at: Date.now() };
    return privateKeyToAccount(key);
  }

  /**
   * Sign in with a Solana wallet alone: connect it (its prompt), then, the first time, sign the sign-in message
   * twice (two prompts) to derive this wallet's Hyperliquid account and check the wallet signs the same way each
   * time. After that, the account's address is remembered on this device and reconnecting needs no signature.
   */
  private async connectSolana(name: string) {
    const sol = this.solana;
    if (!sol) return;
    this.set((s) => {
      s.status = 'connecting';
      s.step = 'connect';
      s.error = '';
    });
    const fail = (error: string) =>
      this.set((s) => {
        s.status = 'idle';
        s.step = null;
        s.error = error;
      });
    await sol.connect(name);
    const solAddress = sol.address;
    const w = sol.wallets.find((x) => x.name === name);
    const icon = w?.icon || this.solanaOptions().find((o) => o.key === `sol:${name}`)?.icon || '';
    if (!solAddress) return fail(sol.error || `${name} couldn't connect. Unlock it and try again.`);
    const saved = safeStorage.get(DERIVED(solAddress));
    if (saved && ADDRESS.test(saved)) return this.attachSolana(name, icon, solAddress, saved as Address);
    try {
      this.set((s) => void (s.step = 'sign'));
      const first = await sol.signMessage(signInBytes());
      const bad = signInProblem(solAddress, first);
      if (bad) return fail(bad);
      this.set((s) => void (s.step = 'check'));
      const second = await sol.signMessage(signInBytes());
      const differs = signInProblem(solAddress, first, second);
      if (differs) return fail(differs);
      const key = deriveKey(first);
      const address = keyAddress(key);
      safeStorage.set(DERIVED(solAddress), address);
      this.master = { key, at: Date.now() };
      this.attachSolana(name, icon, solAddress, address);
    } catch (e) {
      fail(connectError(name, e).replace("Try again when you're ready.", 'Nothing was signed.'));
    }
  }

  private detach() {
    this.active?.removeListener?.('accountsChanged', this.onAccounts as never);
    this.active = null;
  }

  /** Ask the wallet for its address (the wallet shows its own prompt). */
  async connect(key: string) {
    if (key.startsWith('sol:')) return this.connectSolana(key.slice(4));
    const p = this.providerFor(key);
    if (!p) return;
    this.set((s) => {
      s.status = 'connecting';
      s.error = '';
    });
    try {
      const address = firstAddress(await p.provider.request({ method: 'eth_requestAccounts' }));
      if (!address) throw new Error('no account');
      this.attach(key, p, address);
    } catch (e) {
      this.set((s) => {
        s.status = 'idle';
        s.error = connectError(p.name, e);
      });
    }
  }

  /** Forget the wallet on this site. (The wallet's own permission stays until revoked in the wallet.) */
  disconnect() {
    this.detach();
    if (this.kind === 'solana') this.solana?.disconnect();
    this.master = null;
    safeStorage.set(SAVED, null);
    this.set((s) => {
      s.status = 'idle';
      s.kind = null;
      s.solAddress = null;
      s.step = null;
      s.address = null;
      s.name = '';
      s.icon = '';
      s.dialog = null;
    });
  }

  /** Reconnect the wallet used last time, without a prompt, if it still allows this site. */
  async restore() {
    const key = safeStorage.get(SAVED);
    if (key?.startsWith('sol:') && this.solana && this.status === 'idle') {
      // a Solana sign-in: reconnect the wallet silently, and use the account address remembered on this device
      const name = key.slice(4);
      await this.solana.connect(name, true);
      const sol = this.solana.address;
      const saved = sol ? safeStorage.get(DERIVED(sol)) : null;
      if (sol && saved && ADDRESS.test(saved) && this.status === 'idle') {
        const icon = this.solanaOptions().find((o) => o.key === key)?.icon ?? '';
        this.attachSolana(name, icon, sol, saved as Address);
      }
      return;
    }
    const p = key ? this.providerFor(key) : null;
    if (!key || !p || this.status !== 'idle') return;
    try {
      const address = firstAddress(await p.provider.request({ method: 'eth_accounts' }));
      if (address) this.attach(key, p, address);
    } catch {
      // the wallet is locked or gone: stay disconnected
    }
  }

  /** Listen for wallets (EIP-6963) and reconnect last time's. Returns a function that stops listening. */
  start(): () => void {
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Announced>).detail;
      if (!d?.info?.rdns || typeof d.provider?.request !== 'function') return;
      this.announced.set(d.info.rdns, d);
      this.emit();
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const injected = (window as { ethereum?: Eip1193 }).ethereum;
    if (injected && typeof injected.request === 'function') this.legacy = injected;
    // wallets announce within a moment of being asked
    const t = setTimeout(() => void this.restore(), 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      this.detach();
    };
  }
}

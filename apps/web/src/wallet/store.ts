'use client';

import { WALLETS, walletByRdns, walletFromFlags, type WalletInfo } from './catalog';

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
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** What to tell someone when their wallet says no, in words that say what happened and what to do. */
export function connectError(name: string, e: unknown): string {
  const code = (e as { code?: number } | null)?.code;
  if (code === 4001) return `You closed the request in ${name}. Try again when you're ready.`;
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
  address: Address | null = null;
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

  private attach(key: string, p: { provider: Eip1193; name: string; icon: string }, address: Address) {
    this.detach();
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

  private detach() {
    this.active?.removeListener?.('accountsChanged', this.onAccounts as never);
    this.active = null;
  }

  /** Ask the wallet for its address (the wallet shows its own prompt). */
  async connect(key: string) {
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
    safeStorage.set(SAVED, null);
    this.set((s) => {
      s.status = 'idle';
      s.address = null;
      s.name = '';
      s.icon = '';
      s.dialog = null;
    });
  }

  /** Reconnect the wallet used last time, without a prompt, if it still allows this site. */
  async restore() {
    const key = safeStorage.get(SAVED);
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

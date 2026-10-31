'use client';

/**
 * The Solana side of the person's wallet, where their SOL is. Phantom, Bitget, Backpack, OKX and most Solana
 * wallets announce themselves over the Wallet Standard (the Solana equivalent of EIP-6963); Coinside finds
 * them the way @wallet-standard/app does, connects the one the person uses (which only shares its address) and
 * reads its SOL balance through our own server (GET /solana/balance/<address>).
 */

export interface StdAccount {
  address: string;
}

export interface StdWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  features: Record<string, unknown>;
  accounts: readonly StdAccount[];
}

type ConnectFeature = {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly StdAccount[] }>;
};

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** A wallet that holds Solana accounts and can connect. */
export const isSolanaWallet = (w: StdWallet) =>
  Array.isArray(w.chains) &&
  w.chains.some((c) => c.startsWith('solana:')) &&
  !!w.features &&
  'standard:connect' in w.features;

/** "7xKX…AsU": a Solana address, short. */
export const shortSol = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Lamports as SOL for display, up to 4 decimals, never rounded up. */
export function solText(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').slice(0, 4).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Wallet Standard discovery: listen for wallets registering, and tell the ones already loaded we're ready. */
export function discover(onRegister: (ws: StdWallet[]) => void): () => void {
  const api = Object.freeze({
    register: (...ws: StdWallet[]) => {
      onRegister(ws);
      return () => {};
    },
  });
  const listener = (e: Event) => {
    const cb = (e as CustomEvent).detail;
    if (typeof cb === 'function')
      try {
        cb(api);
      } catch {
        // a broken wallet doesn't stop the others
      }
  };
  window.addEventListener('wallet-standard:register-wallet', listener);
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch {
    // nothing listening
  }
  return () => window.removeEventListener('wallet-standard:register-wallet', listener);
}

/** A wallet's older injected Solana provider (window.bitkeep.solana and the like), Phantom's API. */
interface LegacySol {
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | void>;
  publicKey?: { toString(): string } | null;
}

/** Where wallets put their older injected Solana provider, for wallets that don't announce over the standard. */
type Injected = Record<string, { solana?: unknown; isSolflare?: boolean } | undefined>;
const LEGACY: Array<[name: string, get: (w: Injected) => unknown]> = [
  ['Bitget Wallet', (w) => w.bitkeep?.solana ?? w.bitget?.solana],
  ['Phantom', (w) => w.phantom?.solana],
  ['OKX Wallet', (w) => w.okxwallet?.solana],
  ['Backpack', (w) => w.backpack?.solana],
  ['Solflare', (w) => (w.solflare?.isSolflare ? w.solflare : undefined)],
];

/**
 * An older injected provider wrapped as a standard wallet. Its silent connect reads an address the wallet
 * already shares (publicKey), else asks with onlyIfTrusted, which answers only for a site the person allowed
 * before. Coinside only tries that silently for a wallet this person connected before (see restore()).
 */
export function legacyWallet(name: string, p: LegacySol, icon = ''): StdWallet {
  const accounts: StdAccount[] = [];
  const connect = async (input?: { silent?: boolean }) => {
    let pk = p.publicKey?.toString();
    if (!pk) {
      const r = await p.connect(input?.silent ? { onlyIfTrusted: true } : undefined);
      pk = (r && r.publicKey?.toString()) || p.publicKey?.toString();
    }
    if (pk && !accounts.length) accounts.push({ address: pk });
    return { accounts: pk ? [{ address: pk }] : [] };
  };
  return {
    name,
    icon,
    chains: ['solana:mainnet'],
    features: { 'standard:connect': { connect }, 'coinside:legacy': true },
    accounts,
  };
}

const firstWord = (s: string) => s.toLowerCase().split(' ')[0] ?? '';

/** How long a wallet has to answer a connect request before Coinside stops waiting. */
export const CONNECT_TIMEOUT_MS = 90_000;

const REMEMBER = (owner: string) => `coinside.sol.${owner.toLowerCase()}`;
const ASKED = 'coinside.sol.asked';

/** The connected Solana wallet and its SOL balance, as an external store. */
export class SolanaStore {
  wallets: StdWallet[] = [];
  address: string | null = null;
  name = '';
  lamports: bigint | null = null;
  balanceFailed = false;
  connecting = false;
  /** More than one Solana wallet and none matches: the person picks. */
  picking = false;
  error = '';

  private owner: string | null = null;
  private evmName = '';
  private evmIcon = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  version = 0;
  private listeners = new Set<() => void>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  /** Add wallets, skipping a second entry for the same wallet (the standard one wins over the older one). */
  private add(ws: StdWallet[]) {
    for (const w of ws)
      if (isSolanaWallet(w) && !this.wallets.some((x) => firstWord(x.name) === firstWord(w.name)))
        this.wallets = [...this.wallets, w];
  }

  /** Older injected providers, for wallets that haven't announced themselves over the standard. */
  private addLegacy() {
    const win = window as unknown as Injected;
    for (const [name, get] of LEGACY) {
      const p = get(win) as LegacySol | undefined;
      if (
        p &&
        typeof p.connect === 'function' &&
        !this.wallets.some((x) => firstWord(x.name) === firstWord(name))
      ) {
        const icon = firstWord(name) === firstWord(this.evmName) ? this.evmIcon : '';
        this.wallets = [...this.wallets, legacyWallet(name, p, icon)];
      }
    }
  }

  start() {
    const stop = discover((ws) => {
      // a standard wallet replaces an older entry for the same wallet
      this.wallets = this.wallets.filter((x) => !ws.some((w) => firstWord(w.name) === firstWord(x.name)));
      this.add(ws);
      this.emit();
      void this.restore();
    });
    // wallets that only inject an older provider: look once the standard ones have had their turn
    const later = setTimeout(() => {
      this.addLegacy();
      this.emit();
      void this.restore();
    }, 300);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      clearTimeout(later);
      document.removeEventListener('visibilitychange', onVisible);
      this.stopPolling();
    };
  }

  /** Follow the connected EVM wallet: its owner keys what we remember, its name picks the Solana side. */
  follow(owner: string | null, evmName: string, evmIcon = '') {
    this.evmName = evmName;
    this.evmIcon = evmIcon;
    if (owner === this.owner) return;
    this.owner = owner;
    this.reset();
    void this.restore();
  }

  private reset() {
    this.address = null;
    this.name = '';
    this.lamports = null;
    this.balanceFailed = false;
    this.picking = false;
    this.error = '';
    this.stopPolling();
    this.emit();
  }

  /** The Solana wallet that goes with the connected wallet: same name, or the only one there is. */
  match(): StdWallet | null {
    const key = firstWord(this.evmName);
    const named = key ? this.wallets.find((w) => firstWord(w.name) === key) : undefined;
    return named ?? (this.wallets.length === 1 ? this.wallets[0]! : null);
  }

  /**
   * Without a prompt: the wallet this owner connected before, else the one that matches the connected wallet,
   * if it already shares its Solana address with this site.
   */
  private async restore() {
    if (!this.owner || this.address || this.connecting) return;
    let saved: { name: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(REMEMBER(this.owner)) ?? 'null');
    } catch {
      saved = null;
    }
    // a wallet connected before; else the matching one, if it can be asked without any chance of a prompt
    const matched = this.match();
    const w =
      (saved && this.wallets.find((x) => x.name === saved.name)) ||
      (matched && !matched.features['coinside:legacy'] ? matched : null);
    if (w) await this.connect(w.name, true);
  }

  /**
   * Ask the matching wallet once per browser session, for a person who came to deposit: Deposit calls this when
   * the account is empty, so the SOL shows without hunting for a button. Never asks twice in a session.
   */
  async askOnce() {
    if (!this.owner || this.address || this.connecting) return;
    try {
      if (sessionStorage.getItem(ASKED)) return;
      sessionStorage.setItem(ASKED, '1');
    } catch {
      return;
    }
    if (!this.wallets.length) this.addLegacy();
    if (this.match()) await this.connect();
  }

  /** Connect a Solana wallet (by name, or the one that matches). Only its address is shared. */
  async connect(name?: string, silent = false) {
    if (!this.wallets.length && typeof window !== 'undefined') this.addLegacy();
    const w = name ? this.wallets.find((x) => x.name === name) : this.match();
    if (!w) {
      this.picking = this.wallets.length > 1;
      this.error = this.wallets.length
        ? ''
        : 'No Solana wallet found in this browser. Open Phantom, Bitget or Backpack and try again.';
      return this.emit();
    }
    this.connecting = true;
    this.error = '';
    this.emit();
    try {
      const feature = w.features['standard:connect'] as ConnectFeature;
      const asked = feature.connect(silent ? { silent: true } : undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const { accounts } = await Promise.race([
        asked,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));
      const address = accounts[0]?.address ?? w.accounts[0]?.address;
      if (!address) throw new Error('no account');
      this.address = address;
      this.name = w.name;
      this.picking = false;
      try {
        if (this.owner) localStorage.setItem(REMEMBER(this.owner), JSON.stringify({ name: w.name }));
      } catch {
        // remembered for this visit only
      }
      this.startPolling();
      void this.refresh();
    } catch (e) {
      if (!silent) {
        const code = (e as { code?: number })?.code;
        const message = String((e as Error)?.message);
        this.error =
          code === 4001 || /reject|denied|cancel/i.test(message)
            ? `You closed the request in ${w.name}. Nothing was shared.`
            : message === 'timeout'
              ? `${w.name} didn't answer. Open it, unlock it and approve, then try again.`
              : `${w.name} couldn't connect its Solana account. Unlock it and try again.`;
      }
    } finally {
      this.connecting = false;
      this.emit();
    }
  }

  disconnect() {
    try {
      if (this.owner) localStorage.removeItem(REMEMBER(this.owner));
    } catch {
      // nothing stored
    }
    this.reset();
  }

  async refresh() {
    const address = this.address;
    if (!address) return;
    try {
      const res = await fetch(`/solana/balance/${address}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const { lamports } = (await res.json()) as { lamports: string };
      if (address !== this.address) return;
      this.lamports = BigInt(lamports);
      this.balanceFailed = false;
    } catch {
      if (address === this.address) this.balanceFailed = true;
    }
    this.emit();
  }

  private startPolling() {
    this.stopPolling();
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, 15_000);
  }

  private stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

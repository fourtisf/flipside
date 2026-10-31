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

const REMEMBER = (owner: string) => `coinside.sol.${owner.toLowerCase()}`;

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

  start() {
    const stop = discover((ws) => {
      for (const w of ws)
        if (isSolanaWallet(w) && !this.wallets.some((x) => x.name === w.name))
          this.wallets = [...this.wallets, w];
      this.emit();
      void this.restore();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      this.stopPolling();
    };
  }

  /** Follow the connected EVM wallet: its owner keys what we remember, its name picks the Solana side. */
  follow(owner: string | null, evmName: string) {
    this.evmName = evmName;
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
    const key = this.evmName.toLowerCase().split(' ')[0] ?? '';
    const named = key ? this.wallets.find((w) => w.name.toLowerCase().split(' ')[0] === key) : undefined;
    return named ?? (this.wallets.length === 1 ? this.wallets[0]! : null);
  }

  /** Reconnect silently to the wallet this owner connected before, if it is here. */
  private async restore() {
    if (!this.owner || this.address || this.connecting) return;
    let saved: { name: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(REMEMBER(this.owner)) ?? 'null');
    } catch {
      saved = null;
    }
    const w = saved && this.wallets.find((x) => x.name === saved.name);
    if (w) await this.connect(w.name, true);
  }

  /** Connect a Solana wallet (by name, or the one that matches). Only its address is shared. */
  async connect(name?: string, silent = false) {
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
      const { accounts } = await feature.connect(silent ? { silent: true } : undefined);
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
        this.error =
          code === 4001 || /reject|denied|cancel/i.test(String((e as Error)?.message))
            ? `You closed the request in ${w.name}. Nothing was shared.`
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

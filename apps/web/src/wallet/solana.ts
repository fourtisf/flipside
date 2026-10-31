'use client';

import { base58Encode, transferTx } from './solana-tx';

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
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
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
  const features: Record<string, unknown> = { 'standard:connect': { connect }, 'coinside:legacy': true };
  if (typeof p.signMessage === 'function')
    features['solana:signMessage'] = {
      signMessage: async ({ message }: { message: Uint8Array }) => {
        const r = await p.signMessage!(message, 'utf8');
        const signature = r instanceof Uint8Array ? r : r?.signature;
        return [{ signedMessage: message, signature: Uint8Array.from(signature ?? []) }];
      },
    };
  return { name, icon, chains: ['solana:mainnet'], features, accounts };
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
  /** The wallet's account object for that address, which signing requests name. */
  private account: StdAccount | null = null;
  private wallet: StdWallet | null = null;
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
    // wallets that only inject an older provider (injected before this page's code runs), now and again once
    // slower standard wallets have had their turn; a standard wallet that registers later replaces the older entry
    this.addLegacy();
    this.emit();
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
    // the same wallet, now with its account known (a Solana sign-in): keep the connection, remember it
    if (owner && this.address && firstWord(this.name) === firstWord(evmName)) {
      this.remember();
      return this.emit();
    }
    this.reset();
    void this.restore();
  }

  private remember() {
    try {
      if (this.owner && this.name)
        localStorage.setItem(REMEMBER(this.owner), JSON.stringify({ name: this.name }));
    } catch {
      // remembered for this visit only
    }
  }

  private reset() {
    this.address = null;
    this.account = null;
    this.wallet = null;
    this.name = '';
    this.lamports = null;
    this.balanceFailed = false;
    this.picking = false;
    this.error = '';
    this.stopPolling();
    this.emit();
  }

  /**
   * The Solana side of the connected wallet: the Solana wallet with the same name. Never another brand's wallet
   * (Phantom installed next to Bitget must not stand in for Bitget); with no match the person picks.
   */
  match(): StdWallet | null {
    const key = firstWord(this.evmName);
    return (key && this.wallets.find((w) => firstWord(w.name) === key)) || null;
  }

  /** Every wallet there is, the older injected ones included (they may not have been looked for yet). */
  private look() {
    if (typeof window !== 'undefined') this.addLegacy();
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
    this.look();
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
    await this.settled();
    if (!this.owner || this.address || this.connecting) return;
    try {
      if (sessionStorage.getItem(ASKED)) return;
      sessionStorage.setItem(ASKED, '1');
    } catch {
      return;
    }
    await this.connectMatching();
  }

  /**
   * Right after the person connects their wallet: ask for its Solana side in the same go, so one "Connect wallet"
   * covers both accounts of a wallet like Bitget or Phantom. Nothing happens for a wallet with no Solana side.
   */
  async connectMatching() {
    await this.settled();
    if (!this.owner || this.address || this.connecting) return;
    try {
      sessionStorage.setItem(ASKED, '1');
    } catch {
      // asked anyway
    }
    this.look();
    const w = this.match();
    if (w) await this.connect(w.name);
  }

  /** Wait for a connect already under way (a silent reconnect on load), so a prompt never races it. */
  private async settled() {
    while (this.pending) await this.pending.catch(() => {});
  }

  private pending: Promise<void> | null = null;

  /** Connect a Solana wallet (by name, or the one that matches). Only its address is shared. */
  async connect(name?: string, silent = false) {
    const run = this.connectNow(name, silent);
    this.pending = run;
    try {
      await run;
    } finally {
      if (this.pending === run) this.pending = null;
    }
  }

  private async connectNow(name?: string, silent = false) {
    this.look();
    const w = name ? this.wallets.find((x) => x.name === name) : this.match();
    if (!w) {
      this.picking = this.wallets.length > 0;
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
      const account = accounts[0] ?? w.accounts[0];
      const address = account?.address;
      if (!address) throw new Error('no account');
      this.address = address;
      this.account = account;
      this.wallet = w;
      this.name = w.name;
      this.picking = false;
      this.remember();
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

  /** The connected wallet can sign a message (for the Solana sign-in). */
  canSignMessage(): boolean {
    return !!this.wallet && 'solana:signMessage' in this.wallet.features;
  }

  /** The connected wallet signs `message`; the person approves it in the wallet. Returns the 64-byte signature. */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const w = this.wallet;
    if (!w || !this.account) throw new Error('Connect your Solana wallet first.');
    const feature = w.features['solana:signMessage'] as
      | {
          signMessage: (
            ...inputs: Array<{ account: StdAccount; message: Uint8Array }>
          ) => Promise<ReadonlyArray<{ signature: Uint8Array }>>;
        }
      | undefined;
    if (!feature) throw new Error(`${w.name} can't sign messages. Update ${w.name} or try Phantom.`);
    const out = await feature.signMessage({ account: this.account, message });
    const sig = out[0]?.signature;
    if (!sig) throw new Error(`${w.name} returned no signature.`);
    return Uint8Array.from(sig);
  }

  /** The connected wallet can sign and send a transaction from Coinside (the standard's signAndSendTransaction). */
  canSend(): boolean {
    return !!this.wallet && 'solana:signAndSendTransaction' in this.wallet.features;
  }

  /**
   * Send `lamports` of SOL to `to`: the wallet shows the transfer and the person approves it there. Returns the
   * transaction signature. Coinside never holds a Solana key; the wallet signs and broadcasts.
   */
  async send(to: string, lamports: bigint): Promise<string> {
    const w = this.wallet;
    const from = this.address;
    if (!w || !from || !this.account) throw new Error('Connect your Solana wallet first.');
    const feature = w.features['solana:signAndSendTransaction'] as
      | {
          signAndSendTransaction: (
            ...inputs: Array<{ account: StdAccount; chain: string; transaction: Uint8Array }>
          ) => Promise<ReadonlyArray<{ signature: Uint8Array }>>;
        }
      | undefined;
    if (!feature) throw new Error(`${w.name} can't send from Coinside. Update ${w.name} and try again.`);
    const res = await fetch('/solana/blockhash', { cache: 'no-store' });
    if (!res.ok) throw new Error("Couldn't reach Solana. Try again in a moment.");
    const { blockhash } = (await res.json()) as { blockhash: string };
    const transaction = transferTx(from, to, lamports, blockhash);
    let out: ReadonlyArray<{ signature: Uint8Array }>;
    try {
      out = await feature.signAndSendTransaction({
        account: this.account,
        chain: 'solana:mainnet',
        transaction,
      });
    } catch (e) {
      const code = (e as { code?: number })?.code;
      throw new Error(
        code === 4001 || /reject|denied|cancel/i.test(String((e as Error)?.message))
          ? `You closed the request in ${w.name}. Nothing was sent.`
          : `${w.name} couldn't send it: ${(e as Error)?.message ?? 'unknown error'}`,
      );
    }
    const sig = out[0]?.signature;
    if (!sig)
      throw new Error(`${w.name} didn't say whether it sent. Check its activity before trying again.`);
    void this.refresh();
    return base58Encode(sig);
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

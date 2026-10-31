/**
 * A pretend browser wallet for tests: announces itself over EIP-6963 like a real extension and answers the
 * two requests Coinside makes (eth_requestAccounts to connect, eth_accounts to reconnect). It never signs.
 */
import type { Page } from '@playwright/test';
import { ed25519 } from '@noble/curves/ed25519';
import { SIGN_IN_MESSAGE, deriveKey, keyAddress, signInBytes } from '../src/wallet/derive';
import { base58Encode } from '../src/wallet/solana-tx';

/**
 * A Solana test wallet with a real ed25519 key: its address, its signature over Coinside's sign-in message (what
 * the pretend wallet answers, since ed25519 always signs a message the same way), and the Hyperliquid account
 * Coinside derives from it.
 */
export function testSolanaWallet(seedByte = 7) {
  const seed = new Uint8Array(32).fill(seedByte);
  const address = base58Encode(ed25519.getPublicKey(seed));
  const sig = ed25519.sign(signInBytes(), seed);
  return {
    address,
    signature: Buffer.from(sig).toString('hex'),
    account: keyAddress(deriveKey(sig)),
  };
}

export const PHANTOM_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#AB9FF2"/></svg>',
  );

export interface FakeWallet {
  /** How many times the Solana side signed a message on this page. */
  solanaSigns: () => Promise<number>;
  /** Make the next Solana message signature fail as if the person closed the prompt. */
  rejectSign: () => Promise<void>;
  /** Make the next connect request fail as if the person closed the prompt. */
  reject: () => Promise<void>;
  /** Switch account inside the wallet. */
  switchTo: (address: string) => Promise<void>;
  /** The typed data the wallet was asked to sign, in order. */
  signed: () => Promise<
    Array<{ primaryType: string; domain: { chainId: number }; message: Record<string, unknown> }>
  >;
}

export async function fakeWallet(
  page: Page,
  {
    address,
    name = 'Phantom',
    rdns = 'app.phantom',
    icon = PHANTOM_ICON,
    solana,
    legacySolana,
    solanaSignature = '',
  } = {} as {
    address: string;
    name?: string;
    rdns?: string;
    icon?: string;
    /** Also a Solana account with this address, announced over the Wallet Standard as real wallets do. */
    solana?: string;
    /** Instead, only an older injected provider at window[legacySolana].solana, as Bitget's window.bitkeep. */
    legacySolana?: string;
    /** Hex signature the Solana side answers for Coinside's sign-in message (see testSolanaWallet). */
    solanaSignature?: string;
  },
): Promise<FakeWallet> {
  await page.addInitScript(
    ({ address, name, rdns, icon, solana, legacySolana, solanaSignature, message }) => {
      const signMessage = async (m: Uint8Array) => {
        if (w.__rejectSign) {
          w.__rejectSign = false;
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        }
        w.__solSigns = ((w.__solSigns as number) ?? 0) + 1;
        if (new TextDecoder().decode(m) !== message || !solanaSignature)
          throw new Error('unexpected message');
        return Uint8Array.from(solanaSignature.match(/../g)!.map((h) => parseInt(h, 16)));
      };
      const listeners: Record<string, Array<(v: unknown) => void>> = {};
      const w = window as unknown as Record<string, unknown>;
      let current = address;
      const provider = {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          if (method === 'eth_requestAccounts') {
            if (w.__rejectNext) {
              w.__rejectNext = false;
              throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            }
            localStorage.setItem('fake-wallet-allowed', '1');
            return [current];
          }
          if (method === 'eth_accounts') return localStorage.getItem('fake-wallet-allowed') ? [current] : [];
          if (method === 'eth_chainId') return '0xa4b1';
          if (method === 'eth_signTypedData_v4') {
            if (w.__rejectNext) {
              w.__rejectNext = false;
              throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            }
            ((w.__signed as unknown[]) ??= []).push(JSON.parse(String(params?.[1])));
            // a well-formed signature; the pretend Hyperliquid doesn't check it
            return '0x' + '11'.repeat(32) + '22'.repeat(32) + '1b';
          }
          throw Object.assign(new Error(`${method} is not supported in tests`), { code: 4200 });
        },
        on(event: string, fn: (v: unknown) => void) {
          (listeners[event] ??= []).push(fn);
        },
        removeListener(event: string, fn: (v: unknown) => void) {
          listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
        },
      };
      w.__switchAccount = (a: string) => {
        current = a;
        (listeners.accountsChanged ?? []).forEach((f) => f([a]));
      };
      const detail = Object.freeze({ info: { uuid: 'test-wallet', name, icon, rdns }, provider });
      const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
      window.addEventListener('eip6963:requestProvider', announce);
      announce();

      if (solana && legacySolana) {
        // Phantom's older API: connect() opens the prompt; publicKey is set once the site is allowed
        const pk = { toString: () => solana };
        // like Phantom's: no publicKey until connect(); onlyIfTrusted answers only for an allowed site
        const p: {
          publicKey: typeof pk | null;
          connect: (o?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: typeof pk }>;
          signMessage: (m: Uint8Array) => Promise<{ signature: Uint8Array }>;
        } = {
          publicKey: null,
          signMessage: async (m: Uint8Array) => ({ signature: await signMessage(m) }),
          async connect(o) {
            const allowed = !!localStorage.getItem('fake-solana-allowed');
            if (o?.onlyIfTrusted && !allowed)
              throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            if (!o?.onlyIfTrusted) w.__solanaPrompts = ((w.__solanaPrompts as number) ?? 0) + 1;
            localStorage.setItem('fake-solana-allowed', '1');
            p.publicKey = pk;
            return { publicKey: pk };
          },
        };
        w[legacySolana] = { solana: p };
      } else if (solana) {
        const accounts: Array<{ address: string }> = [];
        const std = {
          version: '1.0.0',
          name,
          icon,
          chains: ['solana:mainnet'],
          get accounts() {
            return accounts;
          },
          features: {
            'standard:connect': {
              version: '1.0.0',
              async connect(input?: { silent?: boolean }) {
                const allowed = localStorage.getItem('fake-solana-allowed');
                if (input?.silent && !allowed) return { accounts: [] };
                if (w.__rejectNext) {
                  w.__rejectNext = false;
                  throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
                }
                localStorage.setItem('fake-solana-allowed', '1');
                if (!accounts.length) accounts.push({ address: solana });
                return { accounts };
              },
            },
            'standard:events': { version: '1.0.0', on: () => () => {} },
            'solana:signMessage': {
              version: '1.0.0',
              async signMessage({ message: m }: { message: Uint8Array }) {
                return [{ signedMessage: m, signature: await signMessage(m) }];
              },
            },
          },
        };
        const register = (api: { register: (w: unknown) => void }) => api.register(std);
        window.addEventListener('wallet-standard:app-ready', (e) =>
          register((e as CustomEvent).detail as { register: (w: unknown) => void }),
        );
        window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
      }
    },
    { address, name, rdns, icon, solana, legacySolana, solanaSignature, message: SIGN_IN_MESSAGE },
  );
  return {
    rejectSign: () =>
      page.evaluate(() => void ((window as unknown as Record<string, unknown>).__rejectSign = true)),
    solanaSigns: () =>
      page.evaluate(() => ((window as unknown as { __solSigns?: number }).__solSigns ?? 0) as number),
    reject: () =>
      page.evaluate(() => void ((window as unknown as Record<string, unknown>).__rejectNext = true)),
    signed: () =>
      page.evaluate(() => ((window as unknown as { __signed?: never[] }).__signed ?? []) as never),
    switchTo: (a) =>
      page.evaluate(
        (a) => (window as unknown as { __switchAccount: (a: string) => void }).__switchAccount(a),
        a,
      ),
  };
}

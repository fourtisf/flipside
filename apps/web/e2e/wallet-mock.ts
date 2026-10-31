/**
 * A pretend browser wallet for tests: announces itself over EIP-6963 like a real extension and answers the
 * two requests Coinside makes (eth_requestAccounts to connect, eth_accounts to reconnect). It never signs.
 */
import type { Page } from '@playwright/test';

export const PHANTOM_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#AB9FF2"/></svg>',
  );

export interface FakeWallet {
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
  { address, name = 'Phantom', rdns = 'app.phantom', icon = PHANTOM_ICON, solana } = {} as {
    address: string;
    name?: string;
    rdns?: string;
    icon?: string;
    /** Also a Solana account with this address, announced over the Wallet Standard as real wallets do. */
    solana?: string;
  },
): Promise<FakeWallet> {
  await page.addInitScript(
    ({ address, name, rdns, icon, solana }) => {
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

      if (solana) {
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
          },
        };
        const register = (api: { register: (w: unknown) => void }) => api.register(std);
        window.addEventListener('wallet-standard:app-ready', (e) =>
          register((e as CustomEvent).detail as { register: (w: unknown) => void }),
        );
        window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
      }
    },
    { address, name, rdns, icon, solana },
  );
  return {
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

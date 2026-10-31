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
}

export async function fakeWallet(
  page: Page,
  { address, name = 'Phantom', rdns = 'app.phantom', icon = PHANTOM_ICON } = {} as {
    address: string;
    name?: string;
    rdns?: string;
    icon?: string;
  },
): Promise<FakeWallet> {
  await page.addInitScript(
    ({ address, name, rdns, icon }) => {
      const listeners: Record<string, Array<(v: unknown) => void>> = {};
      const w = window as unknown as Record<string, unknown>;
      let current = address;
      const provider = {
        async request({ method }: { method: string }) {
          if (method === 'eth_requestAccounts') {
            if (w.__rejectNext) {
              w.__rejectNext = false;
              throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            }
            localStorage.setItem('fake-wallet-allowed', '1');
            return [current];
          }
          if (method === 'eth_accounts') return localStorage.getItem('fake-wallet-allowed') ? [current] : [];
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
    },
    { address, name, rdns, icon },
  );
  return {
    reject: () =>
      page.evaluate(() => void ((window as unknown as Record<string, unknown>).__rejectNext = true)),
    switchTo: (a) =>
      page.evaluate(
        (a) => (window as unknown as { __switchAccount: (a: string) => void }).__switchAccount(a),
        a,
      ),
  };
}

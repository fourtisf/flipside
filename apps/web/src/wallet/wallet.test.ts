import { describe, expect, it } from 'vitest';
import { CLEARINGHOUSE, EMPTY_CLEARINGHOUSE, EMPTY_SPOT, FILLS, ORDERS, SPOT } from '../../e2e/hl-fixtures';
import { isEmpty, mergeFills, toFills, toOrders, toPerps, toSpot } from './account';
import { WALLETS, shortAddr, walletByRdns, walletFromFlags } from './catalog';
import { WalletStore, connectError, type Eip1193 } from './store';

const ADDR = '0x1234567890ABCDEF1234567890abcdef12345678';

/** A wallet that answers like a real one; `fail` makes eth_requestAccounts throw that error. */
function provider(opts: { accounts?: string[]; fail?: unknown } = {}): Eip1193 & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async request({ method }) {
      calls.push(method);
      if (method === 'eth_requestAccounts' && opts.fail) throw opts.fail;
      return opts.accounts ?? [ADDR];
    },
    on() {},
    removeListener() {},
  };
}

const announce = (s: WalletStore, rdns: string, name: string, p: Eip1193) =>
  s.announced.set(rdns, { info: { uuid: rdns, name, icon: 'data:image/svg+xml,x', rdns }, provider: p });

describe('wallet catalog', () => {
  it('has a logo, an install page and an EIP-6963 id for every wallet', () => {
    expect(WALLETS.map((w) => w.id)).toEqual([
      'phantom',
      'backpack',
      'metamask',
      'rabby',
      'okx',
      'coinbase',
      'rainbow',
      'trust',
      'zerion',
    ]);
    for (const w of WALLETS) {
      expect(w.logo).toBe(`/wallets/${w.id}.svg`);
      expect(w.install).toMatch(/^https:\/\//);
      expect(w.rdns.length).toBeGreaterThan(0);
    }
    expect(walletByRdns('io.metamask')?.name).toBe('MetaMask');
  });

  it('recognizes old-style wallets by their flags, MetaMask last because others pretend to be it', () => {
    expect(walletFromFlags({ isMetaMask: true })?.id).toBe('metamask');
    expect(walletFromFlags({ isMetaMask: true, isRabby: true })?.id).toBe('rabby');
    expect(walletFromFlags({ isMetaMask: true, isPhantom: true })?.id).toBe('phantom');
    expect(walletFromFlags({})).toBeUndefined();
  });

  it('opens Coinside inside mobile wallet apps', () => {
    const url = 'https://coinside.fun/trade/SOL';
    expect(WALLETS.find((w) => w.id === 'phantom')!.open!(url)).toBe(
      'https://phantom.app/ul/browse/https%3A%2F%2Fcoinside.fun%2Ftrade%2FSOL?ref=https%3A%2F%2Fcoinside.fun',
    );
    expect(WALLETS.find((w) => w.id === 'metamask')!.open!(url)).toBe(
      'https://metamask.app.link/dapp/coinside.fun/trade/SOL',
    );
  });

  it('shortens addresses', () => {
    expect(shortAddr('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
  });
});

describe('wallet store', () => {
  it('lists installed wallets first, with the catalog logo, and other announced wallets after the catalog', () => {
    const s = new WalletStore();
    announce(s, 'io.metamask', 'MetaMask', provider());
    announce(s, 'xyz.other', 'Other Wallet', provider());
    const rows = s.options();
    expect(rows[0]).toMatchObject({
      key: 'io.metamask',
      name: 'MetaMask',
      icon: '/wallets/metamask.svg',
      installed: true,
    });
    expect(rows[1]).toMatchObject({ key: 'xyz.other', name: 'Other Wallet', installed: true });
    expect(rows.filter((r) => !r.installed)).toHaveLength(8);
    expect(rows.find((r) => r.name === 'Phantom')).toMatchObject({ key: 'phantom', installed: false });
  });

  it('connects, lower-cases the address and remembers the wallet', async () => {
    const s = new WalletStore();
    const p = provider();
    announce(s, 'app.phantom', 'Phantom', p);
    await s.connect('app.phantom');
    expect(s.status).toBe('connected');
    expect(s.address).toBe(ADDR.toLowerCase());
    expect(s.name).toBe('Phantom');
    expect(s.icon).toBe('/wallets/phantom.svg');
    expect(p.calls).toEqual(['eth_requestAccounts']);
    s.disconnect();
    expect(s.address).toBeNull();
    expect(s.status).toBe('idle');
  });

  it('says what happened when the wallet says no, and never connects without an address', async () => {
    const s = new WalletStore();
    announce(s, 'app.phantom', 'Phantom', provider({ fail: { code: 4001 } }));
    await s.connect('app.phantom');
    expect(s.status).toBe('idle');
    expect(s.error).toBe("You closed the request in Phantom. Try again when you're ready.");

    announce(s, 'app.backpack', 'Backpack', provider({ accounts: ['not-an-address'] }));
    await s.connect('app.backpack');
    expect(s.address).toBeNull();
    expect(s.error).toMatch(/Backpack couldn't connect/);
  });

  it('words each wallet error plainly', () => {
    expect(connectError('Rabby', { code: -32002 })).toBe(
      'Rabby is already asking you to connect. Open Rabby to answer.',
    );
    expect(connectError('Rabby', new Error('boom'))).toBe(
      "Rabby couldn't connect. Unlock it and try again, or pick another wallet.",
    );
  });
});

describe('account', () => {
  it('knows an account that has never deposited, and never guesses before it has read one', () => {
    const empty = toPerps(EMPTY_CLEARINGHOUSE);
    expect(isEmpty(empty.summary, empty.positions, toSpot(EMPTY_SPOT))).toBe(true);
    // a balance only on spot (SOL deposited as USOL) is not empty
    const usol = toSpot({
      balances: [{ coin: 'USOL', token: 254, total: '0.5', hold: '0.0', entryNtl: '90' }],
    });
    expect(isEmpty(empty.summary, empty.positions, usol)).toBe(false);
    const full = toPerps(CLEARINGHOUSE);
    expect(isEmpty(full.summary, full.positions, toSpot(EMPTY_SPOT))).toBe(false);
    // not read yet, or the read failed: don't block anything
    expect(isEmpty(null, [], null)).toBe(false);
    expect(isEmpty(empty.summary, empty.positions, null)).toBe(false);
  });

  it('reads positions and the summary from the clearinghouse state', () => {
    const { summary, positions } = toPerps(CLEARINGHOUSE);
    expect(summary).toEqual({ value: 1234.56, withdrawable: 744.26, marginUsed: 490.3, pnl: 74.66 - 11.24 });
    expect(positions.map((p) => [p.coin, p.side, p.size, p.lev, p.margin])).toEqual([
      ['SOL', 'long', 10.5, 5, 'cross'],
      ['BTC', 'short', 0.01, 10, 'isolated'],
    ]);
    expect(positions[1]!.liq).toBe(105000);
  });

  it('lists spot balances with USDC first and leaves empty ones out', () => {
    expect(toSpot(SPOT).map((b) => b.coin)).toEqual(['USDC', 'USOL']);
  });

  it('reads open orders and fills, newest first', () => {
    expect(toOrders(ORDERS)[0]).toMatchObject({
      coin: 'SOL',
      side: 'buy',
      type: 'Limit',
      px: 170.5,
      trigger: null,
    });
    const fills = toFills(FILLS);
    expect(fills.map((f) => f.tid)).toEqual([1, 2]);
    expect(fills[1]).toMatchObject({ dir: 'Close Long', closedPnl: 12.5, side: 'sell' });
  });

  it('merges new fills without listing one twice', () => {
    const fills = toFills(FILLS);
    expect(mergeFills(fills, fills)).toBe(fills);
    const next = { ...fills[0]!, tid: 99, time: fills[0]!.time + 1 };
    expect(mergeFills(fills, [next]).map((f) => f.tid)).toEqual([99, 1, 2]);
  });
});

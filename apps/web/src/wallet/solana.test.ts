import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolanaStore, isSolanaWallet, legacyWallet, shortSol, solText, type StdWallet } from './solana';

const ADDR = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

function stdWallet(
  name: string,
  connect = vi.fn(async () => ({ accounts: [{ address: ADDR }] })),
): StdWallet {
  return {
    name,
    icon: '',
    chains: ['solana:mainnet'],
    features: { 'standard:connect': { connect } },
    accounts: [],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('the Solana side of the wallet', () => {
  it('formats SOL without rounding up, and shortens addresses', () => {
    expect(solText(200_000_000n)).toBe('0.2');
    expect(solText(1_999_999_999n)).toBe('1.9999');
    expect(solText(5_000_000_000n)).toBe('5');
    expect(solText(0n)).toBe('0');
    expect(shortSol(ADDR)).toBe('7xKX…gAsU');
  });

  it('knows a Solana wallet from an EVM-only or broken one', () => {
    expect(isSolanaWallet(stdWallet('Phantom'))).toBe(true);
    expect(isSolanaWallet({ ...stdWallet('X'), chains: ['sui:mainnet'] })).toBe(false);
    expect(isSolanaWallet({ ...stdWallet('X'), features: {} })).toBe(false);
  });

  it('connects the Solana wallet with the same name as the connected wallet, then reads its balance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ lamports: '200000000' }))),
    );
    const s = new SolanaStore();
    s.wallets = [stdWallet('Phantom'), stdWallet('Bitget Wallet')];
    s.follow('0xe614', 'Bitget Wallet');
    expect(s.match()?.name).toBe('Bitget Wallet');
    await s.connect();
    expect(s.address).toBe(ADDR);
    expect(s.name).toBe('Bitget Wallet');
    await s.refresh();
    expect(s.lamports).toBe(200_000_000n);
    expect(fetch).toHaveBeenCalledWith(`/solana/balance/${ADDR}`, { cache: 'no-store' });
    s.disconnect();
    expect(s.address).toBeNull();
  });

  it("never stands in another brand's wallet: with no match the person picks, and says so when there is none", async () => {
    const s = new SolanaStore();
    s.wallets = [stdWallet('Phantom')];
    s.follow('0xe614', 'Bitget Wallet');
    expect(s.match()).toBeNull();
    await s.connect();
    expect(s.address).toBeNull();
    expect(s.picking).toBe(true);
    s.wallets = [];
    await s.connect();
    expect(s.error).toMatch(/No Solana wallet found/);
  });

  it('says plainly when the person closes the prompt', async () => {
    const s = new SolanaStore();
    const reject = vi.fn(async () => {
      throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
    });
    s.wallets = [stdWallet('Phantom', reject)];
    s.follow('0xe614', 'Phantom');
    await s.connect();
    expect(s.address).toBeNull();
    expect(s.error).toBe('You closed the request in Phantom. Nothing was shared.');
  });

  it("wraps a wallet's older injected provider (Bitget's window.bitkeep.solana) as a standard wallet", async () => {
    const pk = { toString: () => ADDR };
    const connect = vi.fn(async (o?: { onlyIfTrusted?: boolean }) => {
      if (o?.onlyIfTrusted) throw Object.assign(new Error('not trusted'), { code: 4001 });
      return { publicKey: pk };
    });
    const w = legacyWallet('Bitget Wallet', { connect, publicKey: null });
    expect(isSolanaWallet(w)).toBe(true);
    const c = w.features['standard:connect'] as { connect: (i?: { silent?: boolean }) => Promise<unknown> };
    // silent never opens a prompt: it asks only "if trusted"
    await expect(c.connect({ silent: true })).rejects.toThrow('not trusted');
    expect(connect).toHaveBeenLastCalledWith({ onlyIfTrusted: true });
    expect(await c.connect()).toEqual({ accounts: [{ address: ADDR }] });
    // an address the wallet already shares is read without calling connect at all
    const shared = legacyWallet('Phantom', { connect: vi.fn(), publicKey: pk });
    const sc = shared.features['standard:connect'] as {
      connect: (i?: { silent?: boolean }) => Promise<unknown>;
    };
    expect(await sc.connect({ silent: true })).toEqual({ accounts: [{ address: ADDR }] });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_RPC, SolBalances, isSolAddress, rpcUrlFromEnv } from './solana-rpc';

const ADDR = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('Solana balance on the server', () => {
  it('accepts only Solana addresses', () => {
    expect(isSolAddress(ADDR)).toBe(true);
    expect(isSolAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(false);
    expect(isSolAddress('../../etc/passwd')).toBe(false);
    expect(isSolAddress('O0Il'.repeat(10))).toBe(false); // not base58
  });

  it('asks the node for getBalance only, and keeps the answer for a few seconds', async () => {
    const fetcher = answer({ jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: 200_000_000 } });
    let now = 1_000;
    const b = new SolBalances('https://rpc.example', fetcher, () => now);
    expect(await b.get(ADDR)).toBe('200000000');
    const [url, init] = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe('https://rpc.example');
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: 'getBalance',
      params: [ADDR, { commitment: 'confirmed' }],
    });
    now += 4_000;
    await b.get(ADDR);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 2_000;
    await b.get(ADDR);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fails plainly on a bad address, an HTTP error or an RPC error', async () => {
    await expect(new SolBalances('x', answer({})).get('nope')).rejects.toThrow(/not a Solana address/);
    await expect(new SolBalances('x', answer({}, 429)).get(ADDR)).rejects.toThrow(/429/);
    await expect(
      new SolBalances('x', answer({ error: { code: -32602, message: 'Invalid param' } })).get(ADDR),
    ).rejects.toThrow(/Invalid param/);
  });

  it("uses the server's Helius mainnet key, never a devnet URL, and Solana's public node without one", () => {
    const H = 'https://mainnet.helius-rpc.com/?api-key=k-123';
    expect(rpcUrlFromEnv({ HELIUS_RPC_URL: H, HELIUS_API_KEY: 'k-123' })).toBe(H);
    expect(
      rpcUrlFromEnv({
        HELIUS_RPC_URL: 'https://devnet.helius-rpc.com/?api-key=k-123',
        HELIUS_API_KEY: 'k-123',
      }),
    ).toBe(H);
    expect(rpcUrlFromEnv({ HELIUS_RPC_URL: 'https://mainnet.helius-rpc.com/?api-key=' })).toBe(PUBLIC_RPC);
    expect(rpcUrlFromEnv({ SOLANA_RPC_URL: 'https://rpc.example', HELIUS_RPC_URL: H })).toBe(
      'https://rpc.example',
    );
    expect(rpcUrlFromEnv({})).toBe('https://api.mainnet-beta.solana.com');
  });
});

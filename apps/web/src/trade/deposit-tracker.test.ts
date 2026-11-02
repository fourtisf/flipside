import { afterEach, describe, expect, it, vi } from 'vitest';
import { unitOperations } from '@/lib/unit';
import { DepositTracker, SLOW_MS, stateText } from './deposit-tracker';

afterEach(() => vi.unstubAllGlobals());

describe('following a deposit', () => {
  it('knows it arrived when the account USOL goes up, and says what Unit says on the way', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ operations: [] }))),
    );
    const t = new DepositTracker();
    t.follow('0x1234567890abcdef1234567890abcdef12345678');
    t.begin('sig1', '0.12', 'unitaddr', [{ coin: 'USOL', total: 0.5, hold: 0 }]);
    expect(t.pending).toMatchObject({ sol: '0.12', usolBefore: 0.5, arrived: false, state: null });
    t.observe([{ coin: 'USOL', total: 0.5, hold: 0 }]);
    expect(t.pending!.arrived).toBe(false);
    expect(t.slow(t.pending!.at + SLOW_MS + 1)).toBe(true);
    t.observe([{ coin: 'USOL', total: 0.6065, hold: 0 }]);
    expect(t.pending!.arrived).toBe(true);
    // what arrived, so the panel can show Unit's fee
    expect(t.pending!.received).toBeCloseTo(0.1065);
    expect(t.slow(Date.now() + SLOW_MS * 2)).toBe(false);
    t.dismiss();
    expect(t.pending).toBeNull();
  });

  it("puts Unit's states in plain words, and shows unknown ones as they come", () => {
    expect(stateText(null)).toMatch(/Waiting for Unit/);
    expect(stateText('waitForSrcTxFinalization')).toBe('Waiting for Solana to finalize the transfer.');
    expect(stateText('signTx')).toBe('Unit is crediting your account.');
    expect(stateText('failure')).toMatch(/problem/);
    expect(stateText('somethingNew')).toBe('Unit says: somethingNew.');
  });

  it("reads Unit's operations defensively", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            operations: [{ state: 'done', sourceTxHash: 'abc:0', extra: { x: 1 } }, null, 7],
          }),
        ),
    ) as unknown as typeof fetch;
    const ops = await unitOperations(
      '0x1234567890abcdef1234567890abcdef12345678',
      fetcher,
      'https://u.example',
    );
    expect(ops[0]).toEqual({
      state: 'done',
      sourceTxHash: 'abc:0',
      destinationTxHash: '',
      sourceAmount: '',
      asset: '',
      sourceChain: '',
      destinationChain: '',
      destinationAddress: '',
      createdAt: '',
    });
    expect(ops).toHaveLength(3);
    await expect(unitOperations('nope', fetcher)).rejects.toThrow();
  });
});

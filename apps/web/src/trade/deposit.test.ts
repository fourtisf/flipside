import { describe, expect, it, vi } from 'vitest';
import { UnitAddresses } from '@/lib/unit';
import {
  MAX_DEPOSIT_LAMPORTS,
  MIN_DEPOSIT_LAMPORTS,
  minDepositLamports,
  planDeposit,
  toLamports,
} from './deposit';

const HL = '0x1234567890abcdef1234567890abcdef12345678';
const UNIT_SOL = '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn';

describe('deposit amounts', () => {
  it('reads SOL text exactly, in lamports', () => {
    expect(toLamports('0.15')).toBe(150_000_000n);
    expect(toLamports('1')).toBe(1_000_000_000n);
    expect(toLamports('.5')).toBe(500_000_000n);
    expect(toLamports('0.123456789')).toBe(123_456_789n);
    expect(toLamports('0.1234567891')).toBeNull();
    expect(toLamports('1e3')).toBeNull();
    expect(toLamports('-1')).toBeNull();
    expect(toLamports('')).toBeNull();
  });

  it("keeps to Unit's minimum, the cap while deposits are new, and the fee reserve", () => {
    expect(MIN_DEPOSIT_LAMPORTS).toBe(120_000_000n);
    expect(MAX_DEPOSIT_LAMPORTS).toBe(1_000_000_000n);
    expect(planDeposit('0.15', 201_900_000n)).toEqual({ ok: true, lamports: 150_000_000n });
    expect(planDeposit('', 1n)).toMatchObject({ ok: false, reason: 'Enter an amount of SOL.' });
    expect(planDeposit('0.1', 10n ** 9n)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('0.12 SOL'),
    });
    expect(planDeposit('1.5', 10n ** 10n)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('at most 1 SOL'),
    });
    expect(planDeposit('0.2', 201_000_000n)).toMatchObject({
      ok: false,
      reason: 'You have 0.201 SOL. Keep 0.002 SOL for the network fee.',
    });
  });
});

describe('Unit deposit address, on the server', () => {
  const answer = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("asks Unit for the account's Solana deposit address and keeps it", async () => {
    const fetcher = answer({ address: UNIT_SOL, signatures: {}, status: 'OK' });
    const u = new UnitAddresses(fetcher, () => 0, 'https://unit.example');
    expect(await u.depositAddress(HL.toUpperCase().replace('0X', '0x'))).toBe(UNIT_SOL);
    expect((fetcher as unknown as { mock: { calls: [string][] } }).mock.calls[0]![0]).toBe(
      `https://unit.example/gen/solana/hyperliquid/sol/${HL}`,
    );
    await u.depositAddress(HL);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refuses a bad account, a bad answer, and an address that changes', async () => {
    await expect(new UnitAddresses(answer({})).depositAddress('0xnope')).rejects.toThrow(/not a Hyperliquid/);
    await expect(new UnitAddresses(answer({}, 500)).depositAddress(HL)).rejects.toThrow(/500/);
    await expect(new UnitAddresses(answer({ address: '0xabc' })).depositAddress(HL)).rejects.toThrow(
      /no Solana address/,
    );
    let now = 0;
    let addr = UNIT_SOL;
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ address: addr })),
    ) as unknown as typeof fetch;
    const u = new UnitAddresses(fetcher, () => now);
    await u.depositAddress(HL);
    now += 11 * 60_000;
    addr = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    await expect(u.depositAddress(HL)).rejects.toThrow(/different address/);
  });
});

describe('the smallest deposit worth making', () => {
  it("covers Unit's fee and Hyperliquid's $10 order at today's price, never under Unit's own minimum", () => {
    // ALFA's case: 0.12 SOL at about $95 arrived as 0.1065 USOL, too close to $10 to sell
    expect(minDepositLamports(95.3)).toBe(140_000_000n);
    expect(minDepositLamports(187.23)).toBe(120_000_000n);
    expect(minDepositLamports(0)).toBe(120_000_000n);
    expect(planDeposit('0.13', 10n ** 10n, 95.3)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Deposit at least 0.14 SOL'),
    });
    expect(planDeposit('0.14', 10n ** 10n, 95.3)).toEqual({ ok: true, lamports: 140_000_000n });
  });
});

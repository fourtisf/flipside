import { describe, expect, it } from 'vitest';
import { describeLedger, type LedgerUpdate } from './ledger';

const ME = '0x1111111111111111111111111111111111111111';
const UNIT = '0x5a1e5a1e5a1e5a1e5a1e5a1e5a1e5a1e5a1e5a1e';
const at = (delta: unknown) => ({ time: 1, hash: '0xab', delta }) as unknown as LedgerUpdate;

describe('the account activity, in words', () => {
  it('says where the money went: moves, sends to Unit, and their fees', () => {
    expect(
      describeLedger(at({ type: 'accountClassTransfer', usdc: '22.81', toPerp: false }), ME),
    ).toMatchObject({
      what: 'Trading balance → spot',
      amount: '$22.81',
    });
    expect(
      describeLedger(
        at({
          type: 'spotTransfer',
          token: 'USOL',
          amount: '0.24',
          usdcValue: '22.8',
          user: ME,
          destination: UNIT,
          fee: '0.0001',
        }),
        ME.toUpperCase(),
      ),
    ).toMatchObject({ what: 'Sent to 0x5a1e…5a1e', amount: '−0.24 SOL', detail: 'fee 0.0001 SOL' });
    expect(
      describeLedger(
        at({
          type: 'spotTransfer',
          token: 'USOL',
          amount: '0.1065',
          usdcValue: '10',
          user: UNIT,
          destination: ME,
          fee: '0',
        }),
        ME,
      ),
    ).toMatchObject({ what: 'Received from 0x5a1e…5a1e', amount: '+0.1065 SOL', detail: '' });
    expect(describeLedger(at({ type: 'withdraw', usdc: '20', nonce: 1, fee: '1' }), ME)).toMatchObject({
      what: 'Withdrawal (USDC)',
      amount: '−$20.00',
      detail: 'fee $1.00',
    });
    expect(describeLedger(at({ type: 'vaultDeposit', vault: UNIT, usdc: '5' }), ME).what).toBe(
      'vault deposit',
    );
  });
});

'use client';

import { DEFAULT_RULES } from '@coinside/core/rules';
import { PROTOCOL } from '@/mock/fixtures';
import { fixed, shortA, sol } from '@/lib/format';
import { useSim } from '@/mock/provider';
import { Shield } from './ui';

const STALE_S = DEFAULT_RULES.emergencyStaleHours * 3600;

/**
 * /emergency (new in the port, same design system). Explains and stages the Merkle-proof withdraw
 * from CLAUDE.md section 5: it only becomes active after 72 hours without a balance root. P3 wires
 * it to GET /api/proof/:wallet and the vault program's emergency_withdraw.
 */
export function EmergencyView() {
  const sim = useSim();
  const real = sim.mode === 'real';
  const age = Math.floor(((sim.t === 0 ? sim.bootAt : Date.now()) - sim.auditAt) / 1000) + 41;
  const left = Math.max(0, STALE_S - age);
  const open = left === 0;
  const positions = sim.positions
    .filter((p) => p.mode === 'real')
    .reduce((s, p) => s + sim.posValue(p).value, 0n);
  const claimable = sim.balance.real + positions + sim.myPoolValue();
  const proofLen = 11;

  return (
    <section id="v-emergency" className="wrap page" aria-labelledby="h-em">
      <div className="ph">
        <div>
          <h1 id="h-em">Emergency withdraw</h1>
          <p>
            If the engine stops posting balance proofs for 72 hours, you can withdraw your full balance
            straight from the vault program, profits included. You don&apos;t need us online to do it.
          </p>
        </div>
      </div>
      <dl className="metrics">
        <div>
          <dt>Last balance proof</dt>
          <dd>
            {age}
            <small>s ago</small>
          </dd>
          <dd className="s2">Epoch {PROTOCOL.balanceRootEpoch.toLocaleString('en-US')}, posted on-chain</dd>
        </div>
        <div>
          <dt>Opens in</dt>
          <dd>
            {Math.floor(left / 3600)}
            <small>h</small> {Math.floor((left % 3600) / 60)}
            <small>m</small>
          </dd>
          <dd className="s2">Only if no new proof is posted before then</dd>
        </div>
        <div>
          <dt>Your claimable balance</dt>
          <dd>
            {real && sim.wallet ? fixed(claimable) : '0.00'}
            <small>SOL</small>
          </dd>
          <dd className="s2">Free SOL, open positions at mark and your pool share</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{open ? <span className="up">Open</span> : <span className="t3">Not needed</span>}</dd>
          <dd className="s2">
            {open ? 'Proofs stopped. Withdraw below.' : 'The engine is posting proofs on time'}
          </dd>
        </div>
      </dl>
      <div className="pgrid">
        <div className="pn">
          <div className="pn-h">
            <h2 className="h3">Your balance proof</h2>
            <span className="c">epoch {PROTOCOL.balanceRootEpoch}</span>
          </div>
          {!real ? (
            <div className="empty">
              <b>Emergency withdraw is for real SOL</b>Practice balances are paper and never touch the vault
              program.
            </div>
          ) : !sim.wallet ? (
            <div className="empty">
              <b>Connect the wallet that deposited</b>Your proof is that wallet&apos;s leaf in the latest
              balance root.
            </div>
          ) : (
            <div style={{ padding: '4px 16px 16px' }}>
              <dl className="sum">
                {(
                  [
                    ['Wallet', shortA(sim.wallet)],
                    ['Epoch', String(PROTOCOL.balanceRootEpoch)],
                    ['Claimable', `${sol(claimable)} SOL`],
                    [
                      'Root on-chain',
                      `${PROTOCOL.balanceRootHex.slice(0, 8)}…${PROTOCOL.balanceRootHex.slice(-8)}`,
                    ],
                    ['Proof', `${proofLen} hashes`],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="hint">
                Anyone can check it: the leaf is sha256 of your wallet, amount and epoch, and it has to hash
                up to the root the program stores.
              </p>
            </div>
          )}
        </div>
        <form className="pn lp" onSubmit={(e) => e.preventDefault()}>
          <h2 className="h3">Withdraw from the program</h2>
          <p className="hint" style={{ marginTop: 8 }}>
            The program pays your full claimable balance from the last proof, once per epoch, and only to the
            wallet that signs.
          </p>
          <dl className="sum">
            <div>
              <dt>You receive</dt>
              <dd>{real && sim.wallet ? fixed(claimable) : '0.00'} SOL</dd>
            </div>
            <div>
              <dt>Goes to</dt>
              <dd>{sim.wallet ? shortA(sim.wallet) : 'Your wallet'}</dd>
            </div>
          </dl>
          <button className="cta w" type="submit" disabled={!open}>
            {open ? 'Withdraw with my proof' : 'Opens after 72 hours without a proof'}
          </button>
          <p className="ogd">
            <Shield c="#6E6E6E" s={13} style={{ flex: 'none', marginTop: 3 }} />
            While proofs keep arriving, withdraw from Portfolio instead. It&apos;s instant and needs no proof.
          </p>
        </form>
      </div>
      <section className="dsec" style={{ marginTop: 56 }} aria-labelledby="h-em-how">
        <h2 id="h-em-how">How it works</h2>
        <p>The escape hatch pays balances, not just deposits.</p>
        <ol className="steps">
          <li>
            <b>Proofs every 5 minutes</b>
            <p>The engine posts a Merkle root of every wallet&apos;s balance to the vault program.</p>
          </li>
          <li>
            <b>72 hours of silence</b>
            <p>If no new root arrives for 72 hours, the program opens emergency withdrawals.</p>
          </li>
          <li>
            <b>Bring your proof</b>
            <p>Your leaf and proof are public. Download them now or from any mirror of the last root.</p>
          </li>
          <li>
            <b>Sign and withdraw</b>
            <p>The program checks the proof and sends your full balance to your wallet.</p>
          </li>
        </ol>
      </section>
    </section>
  );
}

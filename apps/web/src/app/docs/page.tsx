import { DEFAULT_RULES } from '@coinside/core/rules';
import type { Metadata } from 'next';
import { docsCopy } from '@/lib/docs-copy';
import { PRELAUNCH } from '@/lib/edition';

export const metadata: Metadata = { title: 'How it works' };

export default function DocsPage() {
  // Every number on this page comes from the rules the engine enforces. P1: the live GET /api/rules.
  const copy = docsCopy(DEFAULT_RULES);
  return (
    <section id="v-docs" className="wrap page" aria-labelledby="h-docs">
      <div className="ph">
        <div>
          <h1 id="h-docs">How Coinside works</h1>
          <p>Everything you need to trade, and everything we do to keep the pool from being drained.</p>
        </div>
      </div>
      <div className="docs">
        <nav className="toc" aria-label="On this page">
          <a href="#d-start">Getting started</a>
          <a href="#d-rules">The rules</a>
          <a href="#d-guards">Pool protection</a>
          <a href="#d-risks">Risks</a>
        </nav>
        <div>
          <section className="dsec" id="d-start" aria-labelledby="d-start-h">
            <h2 id="d-start-h">Getting started</h2>
            <p>Four steps from wallet to first trade.</p>
            <ol className="steps">
              <li>
                <b>Deposit SOL</b>
                <p>
                  Send SOL to the vault program from Portfolio. Only the wallet that deposited can withdraw
                  it.{PRELAUNCH ? '' : ' Or switch to Practice for free paper SOL.'}
                </p>
              </li>
              <li>
                <b>Pick a coin</b>
                <p>
                  Paste a contract address or pick one from Markets. pump.fun, PumpSwap, Raydium, Meteora and
                  StonkFun coins open once they pass the checks.
                </p>
              </li>
              <li>
                <b>Choose a side</b>
                <p>
                  Long if you think it goes up, short if it&apos;s heading to zero. {copy.leverageChoice}, and
                  add a take profit or stop loss.
                </p>
              </li>
              <li>
                <b>Close when you want</b>
                <p>{copy.minHold} The SOL is back in your balance at once.</p>
              </li>
            </ol>
          </section>
          <section className="dsec" id="d-rules" aria-labelledby="d-rules-h">
            <h2 id="d-rules-h">The rules</h2>
            <p>The same rules apply to every trader and every coin.</p>
            <dl className="pn rules">
              {copy.rules.map(([dt, dd]) => (
                <div key={dt}>
                  <dt>{dt}</dt>
                  <dd>{dd}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="dsec" id="d-guards" aria-labelledby="d-guards-h">
            <h2 id="d-guards-h">Pool protection</h2>
            <p>
              The pool pays every winner, so it&apos;s what attackers go after. These are the checks between
              them and it.
            </p>
            <div className="guards" id="guards">
              {copy.guards.map(([b, p]) => (
                <div className="gd" key={b}>
                  <b>{b}</b>
                  <p>{p}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="dsec" id="d-risks" aria-labelledby="d-risks-h">
            <h2 id="d-risks-h">Risks</h2>
            <p>Plainly, before you deposit.</p>
            <ul className="pn risks">
              <li>Memecoins move fast. {copy.maxLeverageRisk}</li>
              <li>
                Prices come from each coin&apos;s own pool. The guards make manipulation expensive and
                unprofitable in every case we know of, not impossible.
              </li>
              <li>
                Trades are matched by our engine and settled to the vault program. Between balance proofs
                you&apos;re trusting the engine&apos;s book.
              </li>
              <li>Pool depositors lose money when traders win more than they lose.</li>
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}

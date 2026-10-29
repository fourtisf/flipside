import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'How it works' };

const GUARDS: Array<[string, string]> = [
  [
    "Pulled liquidity can't pay a short",
    'If a coin loses 30% of its pool liquidity within 5 minutes, every position on it settles at its average price from before the drop. A dev who shorts and then pulls liquidity earns nothing.',
  ],
  [
    "Insiders can't short their own coin",
    "The deployer, wallets it funded and the coin's top 20 holders at the moment you open are blocked from shorting it.",
  ],
  [
    'The crowded side pays',
    'When one side of a coin outweighs the other by more than 2 to 1, that side pays the other an hourly fee. Wallets piling into one short together pay for it.',
  ],
  [
    'Hourly loss breaker',
    'If the pool loses 3% in an hour, new trades pause for 15 minutes. Open positions keep running and can still be closed.',
  ],
  [
    'Verified, with a 72-hour timelock',
    "The vault program is verified on-chain. Any upgrade is published 72 hours before it can run, so you can withdraw first if you don't like it.",
  ],
  [
    'Your full balance, even if we go dark',
    'Every 5 minutes the engine posts a balance proof on-chain. If it stops for 72 hours, you can withdraw your whole balance, profits included, straight from the program.',
  ],
];

const RULES: Array<[string, string]> = [
  [
    'Leverage',
    '2x below 150 SOL of liquidity, 5x from 150 SOL, 10x from 500 SOL. Each coin shows what it allows.',
  ],
  [
    'Fees',
    '1% of your stake to open and 1% of what comes back to close. No spread, no fee on profits, nothing on deposits or withdrawals.',
  ],
  [
    'Fills',
    "You get the worse of the live price and the 60-second average, both on the way in and on the way out. A one-second pump can't be farmed.",
  ],
  [
    'Wins and losses',
    'A position can win up to +200% of its stake while the pool is under 100 SOL, rising to +400% at 100 SOL, +600% at 250 SOL and +1000% at 500 SOL. You never lose more than your stake.',
  ],
  [
    'Which coins open',
    'At least $30K market cap (checked on every trade), 100 holders, 7 SOL paid in trading fees and 24 hours of trading history.',
  ],
  ['New wallets', "A wallet first funded less than 24 hours ago can't trade yet."],
];

export default function DocsPage() {
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
                  it. Or switch to Practice for free paper SOL.
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
                  Long if you think it goes up, short if it&apos;s heading to zero. Pick 2x, 5x or 10x, and
                  add a take profit or stop loss.
                </p>
              </li>
              <li>
                <b>Close when you want</b>
                <p>After 10 seconds you can close any time. The SOL is back in your balance at once.</p>
              </li>
            </ol>
          </section>
          <section className="dsec" id="d-rules" aria-labelledby="d-rules-h">
            <h2 id="d-rules-h">The rules</h2>
            <p>The same rules apply to every trader and every coin.</p>
            <dl className="pn rules">
              {RULES.map(([dt, dd]) => (
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
              {GUARDS.map(([b, p]) => (
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
              <li>Memecoins move fast. At 10x, a 10% move against you takes your whole stake.</li>
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

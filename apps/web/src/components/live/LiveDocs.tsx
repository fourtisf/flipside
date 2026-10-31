import { MAX_ORDER_USD } from '@/trade/config';

/**
 * How Coinside works as a Hyperliquid builder (PLAN-HYPERLIQUID.md). Every claim here is either Hyperliquid's
 * or Unit's documented behavior, or a rule Coinside sets. Coinside charges no fee (ALFA, 31 Oct 2026); the
 * fees named here are Hyperliquid's and the bridges', which Coinside doesn't set or receive.
 */
const STEPS: Array<[string, string]> = [
  [
    'Connect your wallet',
    'Phantom, Backpack, MetaMask, Rabby or another wallet with an EVM account. Hyperliquid accounts use Ethereum-style addresses, so your wallet may say Ethereum, but no ETH is needed. Only your wallet can move money out.',
  ],
  [
    'Deposit SOL or USDC',
    'Hyperliquid needs a deposit before your first trade. Deposits from Solana are coming to Coinside; until then, deposit on Hyperliquid with the same wallet and the balance shows here.',
  ],
  [
    'Choose a side',
    "Long if you think it goes up, short if you think it goes down. Pick your leverage, up to the market's maximum, and add a take profit or stop loss.",
  ],
  [
    'Close when you want',
    'Close all or part of a position at any time, and withdraw back to your Solana wallet whenever you like.',
  ],
];

const RULES: Array<[string, string]> = [
  [
    'Markets',
    'Every perpetual market Hyperliquid lists, from BTC and SOL to the biggest memecoins. A "k" in front of a name, as in kPEPE, means the price and size count 1,000 coins.',
  ],
  ['Leverage', 'Each market has its own maximum, shown next to it on every page.'],
  [
    'Orders',
    'Market orders fill at once against the order book. Limit orders wait for your price. Take profit and stop loss close a position for you.',
  ],
  [
    'Fees',
    "Coinside charges no fee. You pay only Hyperliquid's own trading fee, which goes to Hyperliquid. Each trade's fee shows in your Portfolio.",
  ],
  [
    'Funding',
    'Every hour one side pays the other a small funding payment, which keeps the price close to the spot price. When the rate is positive, longs pay shorts.',
  ],
  [
    'Liquidation',
    "If losses leave less than the maintenance margin, Hyperliquid closes the position. Maintenance margin is half the margin needed at the market's maximum leverage. The order panel shows the estimated liquidation price before you trade.",
  ],
];

const SAFETY: Array<[string, string]> = [
  [
    'In your own account',
    'Coinside never holds your funds. They sit in your Hyperliquid account, which only your wallet controls.',
  ],
  [
    "A trading key that can't withdraw",
    'To trade without a wallet pop-up on every order, you approve a trading key once. It can place and cancel orders, never withdraw.',
  ],
  [
    'No Coinside fee',
    'Coinside adds nothing on top: no fee on trades, deposits or withdrawals. Hyperliquid charges its own trading fee, and bridges charge network fees.',
  ],
  [
    'A public order book',
    'Every order and trade is on Hyperliquid, so you can check each fill on Hyperliquid itself.',
  ],
];

const RISKS = [
  'Leverage magnifies losses. At 20x, a move of less than 5% against you can liquidate a position.',
  'Funding can cost money every hour a position is open.',
  'Deposits and withdrawals go through bridges: Unit for SOL, Across for USDC. A bridge can be slow, and recovering a failed transfer can take days.',
  'Hyperliquid is a young exchange. An outage or a bug there affects every position on it.',
  'This is leveraged trading. Only trade what you can afford to lose.',
];

export function LiveDocs() {
  return (
    <section id="v-docs" className="wrap page" aria-labelledby="h-docs">
      <div className="ph">
        <div>
          <h1 id="h-docs">How Coinside works</h1>
          <p>
            Coinside lets you trade on Hyperliquid from your Solana wallet. Trading is in beta, so one order
            can open at most a ${MAX_ORDER_USD.toLocaleString('en-US')} position for now.
          </p>
        </div>
      </div>
      <div className="docs">
        <nav className="toc" aria-label="On this page">
          <a href="#d-start">Getting started</a>
          <a href="#d-rules">The rules</a>
          <a href="#d-safety">Where your money is</a>
          <a href="#d-risks">Risks</a>
        </nav>
        <div>
          <section className="dsec" id="d-start" aria-labelledby="d-start-h">
            <h2 id="d-start-h">Getting started</h2>
            <p>Four steps from wallet to first trade.</p>
            <ol className="steps">
              {STEPS.map(([b, p]) => (
                <li key={b}>
                  <b>{b}</b>
                  <p>{p}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="dsec" id="d-rules" aria-labelledby="d-rules-h">
            <h2 id="d-rules-h">The rules</h2>
            <p>Orders go to Hyperliquid&apos;s order book, so its rules apply to every trade.</p>
            <dl className="pn rules">
              {RULES.map(([dt, dd]) => (
                <div key={dt}>
                  <dt>{dt}</dt>
                  <dd>{dd}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="dsec" id="d-safety" aria-labelledby="d-safety-h">
            <h2 id="d-safety-h">Where your money is</h2>
            <p>Coinside is an app on top of Hyperliquid. It never takes the other side of your trade.</p>
            <div className="guards">
              {SAFETY.map(([b, p]) => (
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
              {RISKS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}

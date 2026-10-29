'use client';

import { sgn, shortA, sol } from '@/lib/format';
import { useSim } from '@/mock/provider';
import { SideChip, Tok } from './ui';

export function LeaderboardView() {
  const sim = useSim();
  const L = sim.leaders[sim.range];
  return (
    <section id="v-leaders" className="wrap page" aria-labelledby="h-ld">
      <div className="ph">
        <div>
          <h1 id="h-ld">Leaderboard</h1>
          <p id="prize">
            {sim.range === 'week'
              ? `The top three this week split a ${sol(sim.competitionPot)} SOL prize pot on Sunday at 23:59 UTC. Copy anyone with a fixed amount a trade.`
              : "Today's most profitable traders. The weekly prize goes to the top three on This week."}
          </p>
        </div>
        <div className="seg" role="group" aria-label="Range" id="ldSeg">
          {(['day', 'week'] as const).map((r) => (
            <button
              key={r}
              data-r={r}
              aria-pressed={sim.range === r}
              onClick={() => sim.set((s) => void (s.range = r))}
            >
              {r === 'day' ? 'Today' : 'This week'}
            </button>
          ))}
        </div>
      </div>
      <div className="podium" id="podium">
        {L.slice(0, 3).map((l, i) => (
          <div className="pn pod" key={l.w + i}>
            <div className="who">
              <span className={`rk r${i + 1}`}>{i + 1}</span>
              <b>{shortA(l.w)}</b>
              <button className="btn sm o" style={{ marginLeft: 'auto' }} onClick={() => sim.copyTrader(l.w)}>
                Copy
              </button>
            </div>
            <div className="big up">{sgn(l.pnl, 2)} SOL</div>
            <div className="s2">
              <span>{l.trades} trades</span>
              <span>{Math.round(l.win * 100)}% won</span>
              <span>
                Best {l.best.side} on{' '}
                <Tok s={l.best.sym} logo={sim.bySym[l.best.sym]?.logo} size={16} inline />${l.best.sym}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="pn">
        <div id="leaders">
          <div className="tr hd t-lead">
            <span>Rank</span>
            <span>Trader</span>
            <span className="c3">Trades</span>
            <span className="c4">Win rate</span>
            <span>P&amp;L</span>
            <span className="c6">Best trade</span>
            <span></span>
          </div>
          {L.slice(3).map((l, i) => (
            <div className="tr t-lead" key={l.w + i}>
              <span className="n t3">{i + 4}</span>
              <span className="n">{shortA(l.w)}</span>
              <span className="c3 n">{l.trades}</span>
              <span className="c4 n">{Math.round(l.win * 100)}%</span>
              <span className="n up">{sgn(l.pnl, 2)} SOL</span>
              <span className="c6">
                <SideChip side={l.best.side} lev={l.best.lev} />{' '}
                <Tok s={l.best.sym} logo={sim.bySym[l.best.sym]?.logo} size={16} inline />${l.best.sym}{' '}
                <span className="n up">{sgn(l.best.pnl, 2)}</span>
              </span>
              <span className="r">
                <button className="btn sm o" onClick={() => sim.copyTrader(l.w)}>
                  Copy
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

'use client';

import { useMemo, useRef } from 'react';
import { pct } from '@/lib/format';
import { chg1h, solF, type Coin } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { useOpenTrade } from '../nav';
import { layoutTiles, logoSpot, mix, tileFont, useBoxSize } from '../treemap';
import { Tok } from '../ui';

/** 1-hour move clamped to ±30%, interpolating #5A1A1E → #161616 → #0F4A30. */
export function tileColor(c: Coin) {
  if (c.status !== 'open') return '#101010';
  const t = Math.max(-1, Math.min(1, chg1h(c) / 0.3));
  return t >= 0 ? mix('#161616', '#0F4A30', t) : mix('#161616', '#5A1A1E', -t);
}

export function MarketMap() {
  const sim = useSim();
  const openTrade = useOpenTrade();
  const box = useRef<HTMLDivElement>(null);
  const { size, fonts } = useBoxSize(box);

  // Laid out on mount and resize only, like the prototype; colors and labels update every tick.
  const rects = useMemo(
    () =>
      size && size.W
        ? layoutTiles(
            sim.coins.map((c) => ({ key: c.sym, v: solF(c.v24) })),
            size.W,
            size.H,
          ).map((r) => {
            const fs = tileFont(r);
            return { ...r, fs, spot: logoSpot(r, '$' + r.key, fs) };
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size, fonts],
  );

  return (
    <div className="map" id="map" ref={box}>
      {rects.map((r) => {
        const c = sim.bySym[r.key]!;
        const fs = r.fs;
        const logo = r.spot && <Tok s={c.sym} logo={c.logo} size={Math.round(fs * 1.15)} />;
        const show = r.w > 54 && r.h > 40;
        const paused = c.status !== 'open';
        const style = { left: r.x, top: r.y, width: r.w, height: r.h, background: tileColor(c) };
        // Slivers under 24px are too small to hit (WCAG target size): keep them as color only.
        // Those coins stay reachable from search and the markets table.
        if (r.w < 24 || r.h < 24)
          return (
            <span key={r.key} className={`tile${paused ? ' paused' : ''}`} style={style} aria-hidden="true" />
          );
        return (
          <button
            key={r.key}
            className={`tile${paused ? ' paused' : ''}`}
            style={style}
            aria-label={show ? undefined : `Trade $${r.key}`}
            onClick={() => openTrade(r.key)}
          >
            {show && (
              <>
                <span className="vh">Trade </span>
                {r.spot === 'above' && logo}
                <b style={{ fontSize: `${fs.toFixed(1)}px` }}>
                  {r.spot === 'inline' && logo}${r.key}
                </b>
                <span style={{ fontSize: `${Math.max(10.5, fs * 0.62).toFixed(1)}px` }}>
                  {paused ? 'Paused' : pct(chg1h(c))}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

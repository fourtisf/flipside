'use client';

import Link from 'next/link';
import { useMemo, useRef } from 'react';
import { change24h, marketHref, type Market } from '@/hl/markets';
import { useHl } from '@/hl/provider';
import { pct } from '@/lib/format';
import { layoutTiles, logoSpot, mix, tileFont, useBoxSize } from '../treemap';

import { statusText } from './status';
import { CoinTok } from './CoinTok';

/** How many markets the map shows: the most traded. The rest are in the table. */
const TILES = 40;
/** The 24h move that gets the strongest color. */
export const MAP_RANGE = 0.1;

/** 24h move clamped to ±10%, on the prototype's scale #5A1A1E → #161616 → #0F4A30. */
export function liveTileColor(m: Market) {
  const t = Math.max(-1, Math.min(1, change24h(m) / MAP_RANGE));
  return t >= 0 ? mix('#161616', '#0F4A30', t) : mix('#161616', '#5A1A1E', -t);
}

/** Squarified treemap of the most traded markets, sized by 24h volume and colored by the 24h move. */
export function LiveMap() {
  const hl = useHl();
  const box = useRef<HTMLDivElement>(null);
  const { size, fonts } = useBoxSize(box);

  // Laid out again on resize and on each snapshot (volumes move slowly); colors update with prices.
  const rects = useMemo(() => {
    if (!size?.W) return [];
    const top = [...hl.markets].sort((a, b) => b.volume - a.volume).slice(0, TILES);
    return layoutTiles(
      top.filter((m) => m.volume > 0).map((m) => ({ key: m.name, v: m.volume })),
      size.W,
      size.H,
    ).map((r) => {
      const fs = tileFont(r);
      return { ...r, fs, spot: logoSpot(r, r.key, fs) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, fonts, hl.rowsKey]);

  return (
    <div className="map" id="map" ref={box} aria-busy={hl.status === 'loading'}>
      {rects.map((r) => {
        const m = hl.byName[r.key];
        if (!m) return null;
        const fs = r.fs;
        const logo = r.spot && <CoinTok name={m.name} size={Math.round(fs * 1.15)} />;
        const show = r.w > 54 && r.h > 40;
        const style = { left: r.x, top: r.y, width: r.w, height: r.h, background: liveTileColor(m) };
        // Slivers under 24px are too small to hit (WCAG target size): color only, like the prototype.
        if (r.w < 24 || r.h < 24)
          return <span key={r.key} className="tile" style={style} aria-hidden="true" />;
        return (
          <Link
            key={r.key}
            className="tile"
            style={style}
            href={marketHref(m.name)}
            aria-label={show ? undefined : `Trade ${m.name}`}
          >
            {show && (
              <>
                <span className="vh">Trade </span>
                {r.spot === 'above' && logo}
                <b style={{ fontSize: `${fs.toFixed(1)}px` }}>
                  {r.spot === 'inline' && logo}
                  {m.name}
                </b>
                <span style={{ fontSize: `${Math.max(10.5, fs * 0.62).toFixed(1)}px` }}>
                  {pct(change24h(m))}
                </span>
              </>
            )}
          </Link>
        );
      })}
      {!hl.markets.length && (
        <p className="map-msg" role="status">
          {statusText(hl.status)}
        </p>
      )}
    </div>
  );
}

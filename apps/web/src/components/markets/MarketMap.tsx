'use client';

import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pct } from '@/lib/format';
import { chg1h, solF, type Coin } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { useOpenTrade } from '../nav';

const mix = (a: string, b: string, t: number) => {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

/** 1-hour move clamped to ±30%, interpolating #5A1A1E → #161616 → #0F4A30. */
export function tileColor(c: Coin) {
  if (c.status !== 'open') return '#101010';
  const t = Math.max(-1, Math.min(1, chg1h(c) / 0.3));
  return t >= 0 ? mix('#161616', '#0F4A30', t) : mix('#161616', '#5A1A1E', -t);
}

interface Rect {
  sym: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap (d3-hierarchy, ratio 1 like the prototype) sized by 24h volume. */
function layout(coins: Coin[], W: number, H: number): Rect[] {
  const items = [...coins].sort((a, b) => (b.v24 > a.v24 ? 1 : b.v24 < a.v24 ? -1 : 0));
  const root = hierarchy<{ sym?: string; v?: number; children?: unknown[] }>({
    children: items.map((c) => ({ sym: c.sym, v: solF(c.v24) })),
  })
    .sum((d) => d.v ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap<{ sym?: string; v?: number }>().tile(treemapSquarify.ratio(1)).size([W, H]).round(false)(root);
  return root.leaves().map((l) => {
    const n = l as unknown as { x0: number; y0: number; x1: number; y1: number; data: { sym: string } };
    return { sym: n.data.sym, x: n.x0, y: n.y0, w: n.x1 - n.x0, h: n.y1 - n.y0 };
  });
}

export function MarketMap() {
  const sim = useSim();
  const openTrade = useOpenTrade();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Laid out on mount and resize only, like the prototype; colors and labels update every tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rects = useMemo(() => (size && size.W ? layout(sim.coins, size.W, size.H) : []), [size]);

  return (
    <div className="map" id="map" ref={box}>
      {rects.map((r) => {
        const c = sim.bySym[r.sym]!;
        const fs = Math.max(11, Math.min(22, Math.sqrt(r.w * r.h) / 9));
        const show = r.w > 54 && r.h > 40;
        const paused = c.status !== 'open';
        const style = { left: r.x, top: r.y, width: r.w, height: r.h, background: tileColor(c) };
        // Slivers under 24px are too small to hit (WCAG target size): keep them as color only.
        // Those coins stay reachable from search and the markets table.
        if (r.w < 24 || r.h < 24)
          return (
            <span key={r.sym} className={`tile${paused ? ' paused' : ''}`} style={style} aria-hidden="true" />
          );
        return (
          <button
            key={r.sym}
            className={`tile${paused ? ' paused' : ''}`}
            style={style}
            aria-label={show ? undefined : `Trade $${r.sym}`}
            onClick={() => openTrade(r.sym)}
          >
            {show && (
              <>
                <span className="vh">Trade </span>
                <b style={{ fontSize: `${fs.toFixed(1)}px` }}>${r.sym}</b>
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

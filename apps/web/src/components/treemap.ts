'use client';

/**
 * The market map's layout, shared by the prototype's coin map (markets/MarketMap.tsx) and the Hyperliquid
 * map (live/LiveMap.tsx): a squarified treemap, ticker sizes, logo placement and the color scale.
 */
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { useEffect, useState, type RefObject } from 'react';

export const mix = (a: string, b: string, t: number) => {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

export interface Rect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

let measure: CanvasRenderingContext2D | null = null;

/** Rendered width of a tile's ticker (Inter 600 with -0.02em tracking, as styled by `.tile b`). */
function tickerWidth(text: string, fs: number): number {
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return text.length * fs * 0.62;
  measure.font = `600 ${fs}px ${getComputedStyle(document.documentElement).getPropertyValue('--sans')}`;
  return measure.measureText(text).width - 0.02 * fs * text.length;
}

/**
 * Where a tile's logo goes: beside the ticker if both fit on one line, above it if the tile is tall
 * enough, or nowhere on tiles too small for both (the ticker is never clipped to make room).
 */
export function logoSpot(r: Rect, label: string, fs: number): 'inline' | 'above' | null {
  const logo = Math.round(fs * 1.15);
  const room = r.w - 22;
  const text = tickerWidth(label, fs);
  if (text + logo + fs * 0.35 <= room) return 'inline';
  const lines = fs * 1.1 + Math.max(10.5, fs * 0.62) * 1.5;
  if (text <= room && logo + 5 + lines <= r.h - 20) return 'above';
  return null;
}

/** Squarified treemap (d3-hierarchy, ratio 1 like the prototype), each tile sized by its `v`. */
export function layoutTiles(items: Array<{ key: string; v: number }>, W: number, H: number): Rect[] {
  // with no items the root itself would be the only leaf
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.v - a.v);
  const root = hierarchy<{ key?: string; v?: number; children?: unknown[] }>({ children: sorted })
    .sum((d) => d.v ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap<{ key?: string; v?: number }>().tile(treemapSquarify.ratio(1)).size([W, H]).round(false)(root);
  return root.leaves().map((l) => {
    const n = l as unknown as { x0: number; y0: number; x1: number; y1: number; data: { key: string } };
    return { key: n.data.key, x: n.x0, y: n.y0, w: n.x1 - n.x0, h: n.y1 - n.y0 };
  });
}

/** Font size for a tile's ticker, from its area. */
export const tileFont = (r: Rect) => Math.max(11, Math.min(22, Math.sqrt(r.w * r.h) / 9));

/** Track a box's size, and re-measure once the web fonts have loaded (tickers are measured for logos). */
export function useBoxSize(box: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    document.fonts?.ready.then(() => setFonts((n) => n + 1));
    return () => ro.disconnect();
  }, [box]);
  return { size, fonts };
}

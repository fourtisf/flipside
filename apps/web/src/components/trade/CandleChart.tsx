'use client';

import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { C, hexA, priceTxt } from '@/lib/format';
import { HIST, type Coin, type Position } from '@/mock/sim';
import { chartTheme, monoFont } from './chartTheme';

/** The newest candle sits on this hour boundary, so tick marks stay on the same candles every tick. */
const T0 = 1_699_999_200;
const PAD_R = 76;

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Candles exactly as the prototype builds them: n buckets of g one-second samples, open = prior close. */
export function buildCandles(coin: Coin, g: number, width: number) {
  const cw = Math.max(5, Math.min(11, (width - PAD_R) / 86));
  const n = Math.max(10, Math.min(Math.floor((width - PAD_R - 8) / cw), Math.floor(HIST / g)));
  const H = coin.hist;
  const V = coin.vols;
  const start = H.length - n * g;
  const cs: Candle[] = [];
  for (let k = 0; k < n; k++) {
    let o = H[start + k * g]!;
    let hi = o;
    let lo = o;
    let cl = o;
    let v = 0;
    for (let j = 0; j < g; j++) {
      const p = H[start + k * g + j]!;
      hi = Math.max(hi, p);
      lo = Math.min(lo, p);
      cl = p;
      v += V[start + k * g + j]!;
    }
    if (k > 0) o = cs[k - 1]!.c;
    cs.push({ o, h: Math.max(hi, o), l: Math.min(lo, o), c: cl, v });
  }
  const pre = [0];
  for (let i = 0; i < H.length; i++) pre.push(pre[i]! + H[i]!);
  const tw = cs.map((_, k) => {
    const end = start + (k + 1) * g;
    const s0 = Math.max(0, end - 60);
    return (pre[end]! - pre[s0]!) / (end - s0);
  });
  return { cs, tw, n };
}

const relLabel = (time: Time) => {
  const s = T0 - (time as number);
  return s === 0 ? 'now' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
};

/** Prototype layout: 14px top pad, a volume band of min(50, 12% of height), 8px gap above it. */
function margins(h: number) {
  const axis = 26;
  const plot = Math.max(1, h - axis);
  const volH = Math.min(50, h * 0.12);
  const ph = h - 14 - 24 - volH - 8;
  const pad = ph * (0.08 / 1.16);
  return {
    price: { top: (14 + pad) / plot, bottom: Math.max(0, (plot - (14 + ph - pad)) / plot) },
    vol: { top: Math.max(0, 1 - volH / plot), bottom: 0 },
  };
}

interface Ohlc {
  o: number;
  h: number;
  l: number;
  c: number;
}

export function CandleChart({
  coin,
  tf,
  flip,
  mine,
  version,
}: {
  coin: Coin;
  tf: number;
  flip: boolean;
  mine: Position[];
  version: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{
    chart: IChartApi;
    candles: ISeriesApi<'Candlestick'>;
    avg: ISeriesApi<'Line'>;
    vol: ISeriesApi<'Histogram'>;
    last: IPriceLine | null;
    entries: IPriceLine[];
    extra: number[];
  } | null>(null);
  const [ohlc, setOhlc] = useState<Ohlc | null>(null);
  const [labels, setLabels] = useState<Array<{ id: number; y: number; side: 'long' | 'short'; lev: number }>>(
    [],
  );

  useEffect(() => {
    const box = el.current;
    if (!box) return;
    const chart = createChart(box, {
      ...chartTheme(monoFont()),
      autoSize: true,
      // the prototype draws five evenly spaced price lines; a higher density keeps ticks that sparse
      rightPriceScale: {
        borderVisible: false,
        minimumWidth: PAD_R,
        entireTextOnly: true,
        tickMarkDensity: 5,
      },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
        timeVisible: true,
        secondsVisible: true,
        allowBoldLabels: false,
        tickMarkFormatter: relLabel,
      },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: priceTxt },
    });
    const fmt = { type: 'custom' as const, formatter: priceTxt, minMove: 1e-12 };
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const avg = chart.addSeries(LineSeries, {
      color: 'rgba(237,237,237,.45)',
      lineWidth: 1,
      lineStyle: LineStyle.LargeDashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: fmt,
    });
    const candles = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: fmt,
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const r = original();
        const extra = api.current?.extra ?? [];
        if (!r?.priceRange || !extra.length) return r;
        return {
          ...r,
          priceRange: {
            minValue: Math.min(r.priceRange.minValue, ...extra),
            maxValue: Math.max(r.priceRange.maxValue, ...extra),
          },
        };
      },
    });
    api.current = { chart, candles, avg, vol, last: null, entries: [], extra: [] };

    const onMove = (p: MouseEventParams) => {
      const d = p.point ? (p.seriesData.get(candles) as CandlestickData | undefined) : undefined;
      setOhlc(d && 'open' in d ? { o: d.open, h: d.high, l: d.low, c: d.close } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const a = api.current;
    const box = el.current;
    if (!a || !box || !box.clientWidth) return;
    const { cs, tw, n } = buildCandles(coin, tf, box.clientWidth);
    const good = (q: Candle) => (flip ? q.c < q.o : q.c >= q.o);
    const t = (k: number) => (T0 - (n - 1 - k) * tf) as UTCTimestamp;
    const m = margins(box.clientHeight);

    a.chart.applyOptions({ rightPriceScale: { invertScale: flip, scaleMargins: m.price } });
    a.chart.priceScale('vol').applyOptions({ scaleMargins: m.vol, visible: false });
    a.candles.applyOptions({
      upColor: flip ? C.short : C.long,
      downColor: flip ? C.long : C.short,
      wickUpColor: flip ? C.short : C.long,
      wickDownColor: flip ? C.long : C.short,
    });
    a.extra = mine.map((p) => p.entry);
    a.candles.setData(cs.map((q, k) => ({ time: t(k), open: q.o, high: q.h, low: q.l, close: q.c })));
    a.avg.setData(tw.map((v, k) => ({ time: t(k), value: v })));
    a.vol.setData(
      cs.map((q, k) => ({ time: t(k), value: q.v, color: hexA(good(q) ? C.long : C.short, 0.16) })),
    );
    a.chart.timeScale().fitContent();

    // last price: dotted line at half alpha, chip in the candle color with dark text
    const last = cs[cs.length - 1]!;
    const lc = good(last) ? C.long : C.short;
    const lastOpts = {
      price: last.c,
      color: hexA(lc, 0.5),
      lineWidth: 1 as const,
      lineStyle: LineStyle.SparseDotted,
      axisLabelVisible: true,
      axisLabelColor: lc,
      axisLabelTextColor: lc === C.long ? '#02140A' : '#1B0303',
      title: '',
    };
    if (a.last) a.last.applyOptions(lastOpts);
    else a.last = a.candles.createPriceLine(lastOpts);

    // entry lines for your positions on this coin
    a.entries.forEach((l) => a.candles.removePriceLine(l));
    a.entries = mine.map((p) => {
      const col = p.side === 'long' ? C.long : C.short;
      return a.candles.createPriceLine({
        price: p.entry,
        color: hexA(col, 0.7),
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        axisLabelColor: '#000',
        axisLabelTextColor: col,
        title: '',
      });
    });
    const id = requestAnimationFrame(() => {
      const ly = a.candles.priceToCoordinate(last.c);
      setLabels(
        mine.flatMap((p) => {
          const y = a.candles.priceToCoordinate(p.entry);
          if (y === null) return [];
          // hide the axis chip when it would collide with the last-price chip, like the prototype
          const near = ly !== null && Math.abs(y - ly) <= 20;
          a.entries[mine.indexOf(p)]?.applyOptions({ axisLabelVisible: !near });
          return [{ id: p.id, y, side: p.side, lev: p.lev }];
        }),
      );
    });
    return () => cancelAnimationFrame(id);
    // `version` changes every tick; coin and positions are mutable sim objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tf, flip, coin.sym, mine.length]);

  const good = (q: Ohlc) => (flip ? q.c < q.o : q.c >= q.o);
  return (
    <>
      <div className="tvc" ref={el} role="img" aria-label="Candle chart" />
      {labels.map((l) => (
        <span
          key={l.id}
          className={`entry ${l.side === 'long' ? 'l' : 's'}`}
          style={{ top: l.y }}
          aria-hidden="true"
        >
          Your {l.side} {l.lev}x
        </span>
      ))}
      <div className="ohlc" hidden={!ohlc} aria-hidden="true">
        {ohlc &&
          (['o', 'h', 'l', 'c'] as const).map((k) => (
            <span key={k} style={{ display: 'contents' }}>
              <b>{k.toUpperCase()}</b>
              <span style={{ color: good(ohlc) ? C.long : C.short }}>{priceTxt(ohlc[k])}</span>
            </span>
          ))}
      </div>
    </>
  );
}

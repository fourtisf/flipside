'use client';

import * as info from '@nktkas/hyperliquid/api/info';
import * as sub from '@nktkas/hyperliquid/api/subscription';
import {
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  TickMarkType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { httpConfig, wsConfig } from '@/hl/client';
import { pxText } from '@/hl/format';
import type { Market } from '@/hl/markets';
import { keepSubscribed } from '@/hl/store';
import { C, hexA } from '@/lib/format';
import { chartTheme, monoFont } from '../trade/chartTheme';

export const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Tf = (typeof TFS)[number];
const STEP: Record<Tf, number> = {
  '1m': 6e4,
  '5m': 3e5,
  '15m': 9e5,
  '1h': 3.6e6,
  '4h': 1.44e7,
  '1d': 8.64e7,
};
/** Candles loaded per timeframe, and how many are in view at first. */
const LOAD = 400;
const VIEW = 120;

interface Bar {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}
interface Ohlc {
  o: number;
  h: number;
  l: number;
  c: number;
}

const two = (n: number) => String(n).padStart(2, '0');
/** Axis and crosshair times in the visitor's own time zone. */
const timeLabel = (t: Time, type?: TickMarkType) => {
  const d = new Date((t as number) * 1000);
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (type === undefined) return `${md} ${hm}`;
  if (type === TickMarkType.Year) return String(d.getFullYear());
  if (type === TickMarkType.Month) return d.toLocaleDateString('en-US', { month: 'short' });
  if (type === TickMarkType.DayOfMonth) return md;
  return hm;
};

/**
 * Hyperliquid candles in the prototype's chart style: the last 400 from the info API, then the live candle
 * over the WebSocket. The Short view flips the price axis so up means a short is winning.
 */
export function LiveChart({ m, tf, flip }: { m: Market; tf: Tf; flip: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{
    chart: IChartApi;
    candles: ISeriesApi<'Candlestick'>;
    vol: ISeriesApi<'Histogram'>;
  } | null>(null);
  const [ohlc, setOhlc] = useState<Ohlc | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const flipRef = useRef(flip);
  flipRef.current = flip;
  /** Volume per candle time, so the Short view can recolor the bars. */
  const vols = useRef(new Map<number, number>());
  /** True once this market and timeframe's history is on the chart. */
  const loaded = useRef(false);
  const sz = m.szDecimals;

  useEffect(() => {
    const box = el.current;
    if (!box) return;
    const chart = createChart(box, {
      ...chartTheme(monoFont()),
      autoSize: true,
      rightPriceScale: { borderVisible: false, minimumWidth: 76, entireTextOnly: true },
      timeScale: {
        borderVisible: false,
        rightOffset: 4,
        timeVisible: true,
        secondsVisible: false,
        allowBoldLabels: false,
        tickMarkFormatter: timeLabel,
      },
      localization: { timeFormatter: (t: Time) => timeLabel(t) },
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.88, bottom: 0 }, visible: false });
    const candles = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
      priceLineStyle: LineStyle.SparseDotted,
    });
    api.current = { chart, candles, vol };
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

  // price format follows the market's decimals
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.chart.applyOptions({ localization: { priceFormatter: (p: number) => pxText(p, sz) } });
    a.candles.applyOptions({
      priceFormat: { type: 'custom', formatter: (p: number) => pxText(p, sz), minMove: 1e-9 },
    });
  }, [sz]);

  // colors and axis direction for the Short view
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const up = flip ? C.short : C.long;
    const down = flip ? C.long : C.short;
    a.chart.applyOptions({
      rightPriceScale: { invertScale: flip, scaleMargins: { top: 0.08, bottom: 0.16 } },
    });
    a.candles.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down });
    const bars = a.candles.data() as CandlestickData[];
    a.vol.setData(
      bars.map((b) => ({
        time: b.time,
        value: vols.current.get(b.time as number) ?? 0,
        color: hexA(b.close >= b.open ? up : down, 0.16),
      })),
    );
  }, [flip]);

  // history, then the live candle
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const coin = m.name;
    const ctl = new AbortController();
    let ready = false;
    loaded.current = false;
    const queued: Bar[] = [];
    setState('loading');
    setOhlc(null);
    a.candles.setData([]);
    a.vol.setData([]);
    vols.current.clear();

    const put = (b: Bar, live: boolean) => {
      const time = (b.t / 1000) as UTCTimestamp;
      const o = Number(b.o);
      const c = Number(b.c);
      const bar = { time, open: o, high: Number(b.h), low: Number(b.l), close: c };
      const color = hexA(c >= o !== flipRef.current ? C.long : C.short, 0.16);
      const v = { time, value: Number(b.v), color };
      vols.current.set(time, v.value);
      if (live) {
        // a late WebSocket message for an older candle would throw; the next one catches up
        const last = a.candles.data().at(-1);
        if (last && (last.time as number) > time) return;
        a.candles.update(bar);
        a.vol.update(v);
      }
      return { bar, v };
    };

    const stop = keepSubscribed((opts) =>
      sub.candle(
        wsConfig(),
        { coin, interval: tf },
        (b) => {
          // a candle still in flight for the previous market or timeframe must not land on this chart
          if (ctl.signal.aborted) return;
          if (ready) put(b, true);
          else queued.push(b);
        },
        opts,
      ),
    );

    const load = (attempt: number) => {
      const end = Date.now();
      info
        .candleSnapshot(
          httpConfig(),
          { coin, interval: tf, startTime: end - LOAD * STEP[tf], endTime: end },
          ctl.signal,
        )
        .then((cs) => {
          const rows = cs.map((b) => put(b, false)!);
          a.candles.setData(rows.map((r) => r.bar));
          a.vol.setData(rows.map((r) => r.v));
          ready = loaded.current = true;
          queued.splice(0).forEach((b) => put(b, true));
          const n = a.candles.data().length;
          a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - VIEW), to: n + 3 });
          setState('ready');
        })
        .catch(() => {
          if (ctl.signal.aborted) return;
          setState('error');
          setTimeout(() => !ctl.signal.aborted && load(attempt + 1), Math.min(30_000, 2_000 * 2 ** attempt));
        });
    };
    load(0);

    return () => {
      ctl.abort();
      stop();
    };
  }, [m.name, tf]);

  // Hyperliquid pushes the candle about every 5 seconds; the live price moves the last candle in between.
  useEffect(() => {
    const a = api.current;
    const last = a?.candles.data().at(-1) as CandlestickData | undefined;
    if (!a || !loaded.current || !last || !(m.px > 0)) return;
    if (Date.now() >= ((last.time as number) + STEP[tf] / 1000) * 1000) return; // that candle has closed
    a.candles.update({
      ...last,
      close: m.px,
      high: Math.max(last.high, m.px),
      low: Math.min(last.low, m.px),
    });
  }, [m.px, tf]);

  const good = (q: Ohlc) => (flip ? q.c < q.o : q.c >= q.o);
  return (
    <>
      <div className="tvc" ref={el} role="img" aria-label={`${m.name} candle chart, ${tf} candles`} />
      {state !== 'ready' && (
        <p className="cmsg" role="status">
          {state === 'loading' ? 'Loading candles from Hyperliquid.' : "Couldn't load candles. Retrying."}
        </p>
      )}
      <div className="ohlc" hidden={!ohlc} aria-hidden="true">
        {ohlc &&
          (['o', 'h', 'l', 'c'] as const).map((k) => (
            <span key={k} style={{ display: 'contents' }}>
              <b>{k.toUpperCase()}</b>
              <span style={{ color: good(ohlc) ? C.long : C.short }}>{pxText(ohlc[k], sz)}</span>
            </span>
          ))}
      </div>
    </>
  );
}

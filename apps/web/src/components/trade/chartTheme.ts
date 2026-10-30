import { ColorType, CrosshairMode, LineStyle, type DeepPartial, type ChartOptions } from 'lightweight-charts';
import { C } from '@/lib/format';

/** The page's mono font (Geist Mono), for axis labels. */
export const monoFont = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'ui-monospace, monospace';

/** The prototype's chart look, shared by the simulated chart and the Hyperliquid chart. */
export const chartTheme = (mono: string): DeepPartial<ChartOptions> => ({
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: C.t3,
    fontFamily: mono,
    fontSize: 10.5,
    attributionLogo: false,
  },
  grid: { vertLines: { visible: false }, horzLines: { color: '#151515' } },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: 'rgba(237,237,237,.25)', style: LineStyle.Dashed, width: 1, labelVisible: false },
    horzLine: {
      color: 'rgba(237,237,237,.25)',
      style: LineStyle.Dashed,
      width: 1,
      labelBackgroundColor: '#2A2A2A',
    },
  },
});

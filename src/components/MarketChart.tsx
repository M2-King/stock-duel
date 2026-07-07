import { useEffect, useMemo, useRef, useState, useCallback, type WheelEvent, type PointerEvent } from 'react';
import { useGameStore, type IndicatorSeries } from '../store/gameStore';
import './MarketChart.css';

type Period = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
type IndicatorId = 'MA' | 'BOLL' | 'KDJ' | 'WR' | 'DMI' | 'VR';

interface MarketChartProps {
  symbol?: string;
  compact?: boolean;
  showPeriodSelector?: boolean;
  showIndicatorSelector?: boolean;
  height?: number | string;
}

interface IndicatorMeta {
  id: IndicatorId;
  label: string;
  color: string;
  /** main = price pane | osc = oscillator (own sub-pane, 0..100 / -100..0) | volumeStyle = own sub-pane */
  scope: 'main' | 'osc-kdj' | 'osc-wr' | 'osc-dmi' | 'osc-vr';
}

const ALL_INDICATORS: IndicatorMeta[] = [
  { id: 'MA',   label: 'MA  均线',  color: '#fbbf24', scope: 'main' },
  { id: 'BOLL', label: 'BOLL 布林',  color: '#a78bfa', scope: 'main' },
  { id: 'KDJ',  label: 'KDJ 随机',  color: '#f472b6', scope: 'osc-kdj' },
  { id: 'WR',   label: 'WR  威廉',  color: '#22d3ee', scope: 'osc-wr'  },
  { id: 'DMI',  label: 'DMI 趋向',  color: '#fb923c', scope: 'osc-dmi' },
  { id: 'VR',   label: 'VR  容量',  color: '#34d399', scope: 'osc-vr'  },
];

const ZOOM_LEVELS = [1, 2, 3, 5, 8, 12];

function formatCompact(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}

function generateMockCandles(count: number, basePrice: number, seedKey: string) {
  let seed = 0;
  for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xfffffff) / 0xfffffff; };
  const candles = [];
  let price = basePrice * 0.985;
  const drift = (basePrice - price) / count;
  for (let i = 0; i < count; i++) {
    const open = price;
    const noise = (rand() - 0.5) * basePrice * 0.012;
    const reversion = (basePrice - price) * 0.06;
    let close = open + noise + reversion + drift;
    const body = Math.abs(close - open);
    const wick = body * (0.3 + rand() * 0.7) + basePrice * 0.002;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    candles.push({ timestamp: i, open, high, low, close, volume: rand() * 1000000 });
    price = close;
  }
  if (candles.length) {
    const last = candles[candles.length - 1];
    const delta = basePrice - last.close;
    last.close = basePrice;
    last.high = Math.max(last.high, basePrice);
    last.low = Math.min(last.low, basePrice);
    for (let i = Math.max(0, candles.length - 3); i < candles.length - 1; i++) candles[i].close += delta * 0.25;
  }
  return candles;
}

/** Intraday indicators computed directly from timeline price points (not klines). */
interface IntradayIndicatorData {
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  avgPrice: number[];
  boll: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
  macd: { diff: (number | null)[]; dea: (number | null)[]; bar: (number | null)[] };
  rsi: (number | null)[];
  kdj: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] };
  wr: (number | null)[];
  dmi: { pdi: (number | null)[]; mdi: (number | null)[]; adx: (number | null)[] };
  vr: (number | null)[];
  vol: number[];
}

function computeIntradayIndicators(points: number[]): IntradayIndicatorData {
  const n = points.length;
  const sma = (arr: number[], period: number): (number | null)[] => {
    const out: (number | null)[] = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) {
      if (i + 1 < period) continue;
      let s = 0;
      for (let j = i + 1 - period; j <= i; j++) s += arr[j];
      out[i] = s / period;
    }
    return out;
  };
  const ema = (arr: (number | null)[], period: number): (number | null)[] => {
    const k = 2 / (period + 1);
    const out: (number | null)[] = new Array(arr.length).fill(null);
    let e: number | null = null;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v === null) continue;
      if (e === null) e = v;
      else e = v * k + e * (1 - k);
      out[i] = e;
    }
    return out;
  };

  const ma5 = sma(points, 5);
  const ma10 = sma(points, 10);
  const ma20 = sma(points, 20);

  let sum = 0;
  const avgPrice = points.map((v, i) => { sum += v; return sum / (i + 1); });

  const bollUpper: (number | null)[] = new Array(n).fill(null);
  const bollMid: (number | null)[] = new Array(n).fill(null);
  const bollLower: (number | null)[] = new Array(n).fill(null);
  for (let i = 19; i < n; i++) {
    const slice = points.slice(i - 19, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / 20;
    const std = Math.sqrt(variance);
    bollUpper[i] = mean + 2 * std;
    bollMid[i] = mean;
    bollLower[i] = mean - 2 * std;
  }

  const ema12 = ema(points, 12);
  const ema26 = ema(points, 26);
  const diffSeries = ema12.map((v, i) => v !== null && ema26[i] !== null ? v - (ema26[i] as number) : null);
  const deaSeries = ema(diffSeries, 9);
  const barSeries = diffSeries.map((v, i) => v !== null && deaSeries[i] !== null ? (v - (deaSeries[i] as number)) * 2 : null);

  const rsi: (number | null)[] = new Array(n).fill(null);
  for (let i = 14; i < n; i++) {
    let gains = 0, losses = 0;
    for (let j = i - 13; j <= i; j++) {
      const d = points[j] - points[j - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  const highs = points.map((_, i) => Math.max(...points.slice(Math.max(0, i - 8), i + 1)));
  const lows = points.map((_, i) => Math.min(...points.slice(Math.max(0, i - 8), i + 1)));

  const kdjK: (number | null)[] = new Array(n).fill(null);
  const kdjD: (number | null)[] = new Array(n).fill(null);
  const kdjJ: (number | null)[] = new Array(n).fill(null);
  let prevK = 50, prevD = 50;
  for (let i = 0; i < n; i++) {
    if (i + 1 < 9) continue;
    const start = i + 1 - 9;
    const sliceHigh = Math.max(...highs.slice(start, i + 1));
    const sliceLow = Math.min(...lows.slice(start, i + 1));
    const rsv = sliceHigh === sliceLow ? 50 : ((points[i] - sliceLow) / (sliceHigh - sliceLow)) * 100;
    const kVal = (2 * prevK + rsv) / 3;
    const dVal = (2 * prevD + kVal) / 3;
    const jVal = 3 * kVal - 2 * dVal;
    kdjK[i] = kVal; kdjD[i] = dVal; kdjJ[i] = jVal;
    prevK = kVal; prevD = dVal;
  }

  const wr: (number | null)[] = new Array(n).fill(null);
  for (let i = 13; i < n; i++) {
    const start = i + 1 - 14;
    const hh = Math.max(...highs.slice(start, i + 1));
    const ll = Math.min(...lows.slice(start, i + 1));
    wr[i] = hh === ll ? 0 : ((hh - points[i]) / (hh - ll)) * -100;
  }

  const pdi: (number | null)[] = new Array(n).fill(null);
  const mdi: (number | null)[] = new Array(n).fill(null);
  const adx: (number | null)[] = new Array(n).fill(null);
  if (n >= 15) {
    const tr: number[] = new Array(n).fill(0);
    const plusDM: number[] = new Array(n).fill(0);
    const minusDM: number[] = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const up = highs[i] - highs[i - 1];
      const dn = lows[i - 1] - lows[i];
      plusDM[i] = up > dn && up > 0 ? up : 0;
      minusDM[i] = dn > up && dn > 0 ? dn : 0;
      tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - points[i - 1]), Math.abs(lows[i] - points[i - 1]));
    }
    const period = 14;
    const smooth = (arr: number[]) => {
      const out: (number | null)[] = new Array(n).fill(null);
      let acc = 0;
      for (let i = 1; i <= period && i < n; i++) acc += arr[i];
      if (period < n) out[period] = acc;
      for (let i = period + 1; i < n; i++) {
        acc = acc - acc / period + arr[i];
        out[i] = acc;
      }
      return out;
    };
    const trS = smooth(tr);
    const pdmS = smooth(plusDM);
    const mdmS = smooth(minusDM);
    for (let i = period; i < n; i++) {
      const t = trS[i] as number;
      if (t === 0) continue;
      pdi[i] = (pdmS[i] as number) / t * 100;
      mdi[i] = (mdmS[i] as number) / t * 100;
    }
    const dxArr: (number | null)[] = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      const p = pdi[i] as number;
      const m = mdi[i] as number;
      dxArr[i] = p + m === 0 ? 0 : (Math.abs(p - m) / (p + m)) * 100;
    }
    let adxAcc = 0;
    for (let i = period; i < 2 * period && i < n; i++) adxAcc += (dxArr[i] as number);
    if (2 * period <= n - 1) {
      adx[2 * period] = adxAcc / period;
      for (let i = 2 * period + 1; i < n; i++) {
        adx[i] = ((adx[i - 1] as number) * (period - 1) + (dxArr[i] as number)) / period;
      }
    }
  }

  const vol = points.map((p, i) => (i === 0 ? 1 : Math.abs(p - points[i - 1]) + 0.001));
  const vr: (number | null)[] = new Array(n).fill(null);
  for (let i = 23; i < n; i++) {
    let upVol = 0, dnVol = 0, eqVol = 0;
    for (let j = i - 23; j <= i; j++) {
      const d = j === 0 ? 0 : points[j] - points[j - 1];
      const v = vol[j];
      if (d > 0) upVol += v;
      else if (d < 0) dnVol += v;
      else eqVol += v;
    }
    const denom = dnVol + eqVol / 2;
    vr[i] = denom === 0 ? null : ((upVol + eqVol / 2) / denom) * 100;
  }

  return {
    ma5, ma10, ma20, avgPrice,
    boll: { upper: bollUpper, middle: bollMid, lower: bollLower },
    macd: { diff: diffSeries, dea: deaSeries, bar: barSeries },
    rsi, kdj: { k: kdjK, d: kdjD, j: kdjJ },
    wr, dmi: { pdi, mdi, adx }, vr, vol,
  };
}

function xAxisLabels(period: Period, count: number) {
  const labels: { idx: number; label: string }[] = [];
  if (period === '1D') {
    const times = ['09:30', '10:30', '11:30', '13:00', '14:00', '15:00'];
    times.forEach((t, i) => labels.push({ idx: Math.floor((i / (times.length - 1)) * Math.max(count - 1, 0)), label: t }));
  } else if (period === '1W') {
    const days = ['一', '二', '三', '四', '五'];
    days.forEach((d, i) => labels.push({ idx: Math.floor((i / (days.length - 1)) * Math.max(count - 1, 0)), label: `周${d}` }));
  } else if (period === '1M') {
    for (let i = 0; i < 5; i++) labels.push({ idx: Math.floor((i / 4) * Math.max(count - 1, 0)), label: `${i * 7 + 1}日` });
  } else if (period === '3M') {
    const months = ['10月', '11月', '12月', '1月'];
    months.forEach((m, i) => labels.push({ idx: Math.floor((i / (months.length - 1)) * Math.max(count - 1, 0)), label: m }));
  } else if (period === '1Y') {
    const months = ['1月', '3月', '5月', '7月', '9月', '11月'];
    months.forEach((m, i) => labels.push({ idx: Math.floor((i / (months.length - 1)) * Math.max(count - 1, 0)), label: m }));
  } else {
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => labels.push({ idx: Math.floor((i / 3) * Math.max(count - 1, 0)), label: q }));
  }
  return labels;
}

export default function MarketChart({
  symbol,
  compact = false,
  showPeriodSelector = true,
  showIndicatorSelector = true,
  height,
}: MarketChartProps) {
  const { currentQuote, klines, timelineData } = useGameStore();
  const activeSymbol = symbol ?? currentQuote.symbol;
  const isCurrentSymbol = activeSymbol === currentQuote.symbol;
  const price = currentQuote.price;
  const [period, setPeriod] = useState<Period>('1D');
  const [enabledIndicators, setEnabledIndicators] = useState<Set<IndicatorId>>(
    new Set(['MA', 'BOLL', 'KDJ']),
  );
  // zoom: visible candle count = total / zoomLevel (1 = all, 12 = most zoomed in)
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  // anchor index: the right-most visible candle index; 0 = leftmost, max = default
  const [anchorIdx, setAnchorIdx] = useState<number>(-1); // -1 = "follow right"

  const isIntraday = period === '1D';

  const intradayPoints = useMemo(() => {
    if (!isIntraday) return null;
    if (isCurrentSymbol && timelineData.length > 0) return timelineData;
    const seed = `${activeSymbol}-1D-intraday`;
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xfffffff) / 0xfffffff; };
    const points: number[] = [];
    let p = price * 0.99;
    const n = 120;
    for (let i = 0; i < n; i++) {
      const noise = (rand() - 0.5) * price * 0.0035;
      const drift = ((price - p) / (n - i)) * 0.5;
      p += noise + drift;
      points.push(p);
    }
    points[points.length - 1] = price;
    return points;
  }, [isIntraday, isCurrentSymbol, timelineData, activeSymbol, price]);

  const periodCount: Record<Period, number> = { '1D': 0, '1W': 30, '1M': 60, '3M': 90, '1Y': 120, 'ALL': 180 };
  const mockCount = periodCount[period];
  const mockCandles = useMemo(
    () => mockCount > 0 ? generateMockCandles(mockCount, price, `${activeSymbol}-${period}`) : [],
    [mockCount, price, activeSymbol, period],
  );

  const candleSource = useMemo(() => [...mockCandles, ...klines], [mockCandles, klines]);
  const totalCandles = candleSource.length;
  // For intraday 1D, zoom is disabled — the chart already fits a 120-window.
  // For K-line modes, zoomLevel controls how many candles show.
  const effectiveZoom = isIntraday ? 1 : zoomLevel;
  const visibleCount = isIntraday
    ? 120
    : Math.max(20, Math.floor(totalCandles / effectiveZoom));
  const defaultAnchor = Math.max(0, totalCandles - visibleCount);
  const resolvedAnchor = anchorIdx < 0 ? defaultAnchor : Math.min(Math.max(0, anchorIdx), defaultAnchor);
  const visibleFrom = Math.max(0, resolvedAnchor);
  const visibleTo = isIntraday
    ? (intradayPoints?.length ?? 0)
    : Math.min(totalCandles, visibleFrom + visibleCount);

  // Reset zoom + anchor when period or symbol changes
  useEffect(() => {
    setZoomLevel(1);
    setAnchorIdx(-1);
  }, [period, activeSymbol]);

  const visibleCandles = useMemo(() => {
    if (isIntraday) return [];
    return candleSource.slice(visibleFrom, visibleTo).map((k, i) => ({
      x: i,
      y: [k.open, k.close, k.low, k.high] as [number, number, number, number],
    }));
  }, [candleSource, visibleFrom, visibleTo, isIntraday]);

  const visibleLineData = useMemo(() => {
    if (isIntraday) return null;
    return candleSource.slice(visibleFrom, visibleTo).map((k, i) => ({ x: i, y: k.close }));
  }, [candleSource, visibleFrom, visibleTo, isIntraday]);

  // Indicator series in the visible window (offset is the absolute index in the full series)
  // Indicator series are aligned to the klines tail (1 entry per K-line).
  // The visible candle window may include mockCandles + a slice of klines.
  // Translate the visibleFrom index (in merged candleSource) into the klines-aligned index.
  const indicatorOffset = isIntraday
    ? 0
    : Math.max(0, visibleFrom - mockCandles.length);
  const rawSeries = useGameStore(s => s.indicatorSeries);
  const fullSeries: IndicatorSeries | null = isIntraday ? null : rawSeries;

  const toggleIndicator = (id: IndicatorId) => {
    setEnabledIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const zoomIn  = () => {
    const i = ZOOM_LEVELS.findIndex(z => z === zoomLevel);
    if (i >= 0 && i < ZOOM_LEVELS.length - 1) setZoomLevel(ZOOM_LEVELS[i + 1]);
    else if (i < 0) setZoomLevel(ZOOM_LEVELS[1]);
    setAnchorIdx(-1);
  };
  const zoomOut = () => {
    const i = ZOOM_LEVELS.findIndex(z => z === zoomLevel);
    if (i > 0) setZoomLevel(ZOOM_LEVELS[i - 1]);
    else if (i < 0) setZoomLevel(1);
  };
  const zoomReset = () => { setZoomLevel(1); setAnchorIdx(-1); };

  return (
    <div className="market-chart" style={height ? { height } : undefined}>
      {!compact && (
        <div className="mc-header">
          <div className="mc-quote">
            <span className="mc-symbol mono">{activeSymbol}</span>
            <span className={`mc-price mono ${currentQuote.change >= 0 ? 'up' : 'down'}`}>
              {price.toFixed(2)}
            </span>
            <span className={`mc-change mono ${currentQuote.change >= 0 ? 'up' : 'down'}`}>
              {currentQuote.change >= 0 ? '+' : ''}{currentQuote.change.toFixed(2)} ({currentQuote.changePercent >= 0 ? '+' : ''}{currentQuote.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="mc-stats">
            <span><span className="mc-stat-label">高</span> {currentQuote.high.toFixed(2)}</span>
            <span><span className="mc-stat-label">低</span> {currentQuote.low.toFixed(2)}</span>
            <span><span className="mc-stat-label">量</span> {formatCompact(currentQuote.volume)}</span>
          </div>
        </div>
      )}

      {(showPeriodSelector || showIndicatorSelector) && (
        <div className="mc-toolbar">
          {showPeriodSelector && (
            <div className="mc-periods">
              {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as Period[]).map((p) => (
                <button
                  key={p}
                  className={`mc-pill ${p === period ? 'active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="mc-toolbar-spacer" />
          <div className="mc-zoom" title="缩放级别 (滚轮 / 双指捏合)">
            <button className="mc-zoom-btn" onClick={zoomOut} disabled={effectiveZoom <= 1} aria-label="Zoom out">−</button>
            <button className="mc-zoom-label" onClick={zoomReset} title="点击重置缩放">
              {effectiveZoom === 1 ? '适配' : `${effectiveZoom}×`}
            </button>
            <button className="mc-zoom-btn" onClick={zoomIn} disabled={effectiveZoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} aria-label="Zoom in">+</button>
          </div>
          {showIndicatorSelector && (
            <div className="mc-indicators">
              {ALL_INDICATORS.map((ind) => {
                const on = enabledIndicators.has(ind.id);
                return (
                  <button
                    key={ind.id}
                    className={`mc-ind-chip ${on ? 'on' : ''}`}
                    onClick={() => toggleIndicator(ind.id)}
                    style={on ? { borderColor: ind.color, color: ind.color } : undefined}
                    title={ind.label}
                  >
                    <span className="mc-ind-dot" style={{ background: on ? ind.color : 'transparent' }}></span>
                    {ind.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={`mc-body ${compact ? 'compact' : ''}`}>
        <CandlestickChart
          data={visibleCandles}
          lineData={visibleLineData}
          intradayPoints={isIntraday ? intradayPoints : null}
          currentPrice={price}
          period={period}
          indicatorSeries={fullSeries}
          seriesOffset={indicatorOffset}
          enabledIndicators={enabledIndicators}
          effectiveZoom={effectiveZoom}
          totalCandles={totalCandles}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onPanOffset={(dx) => {
            if (isIntraday) return;
            const spanPerCandle = Math.max(1, totalCandles - visibleCount);
            const newAnchor = Math.min(Math.max(0, resolvedAnchor - dx), spanPerCandle);
            setAnchorIdx(newAnchor);
          }}
        />
      </div>
    </div>
  );
}

/* ============== Pure SVG chart ============== */
function CandlestickChart({
  data, lineData, currentPrice, period, intradayPoints, indicatorSeries, seriesOffset = 0, enabledIndicators,
  onZoomIn, onZoomOut, onPanOffset,
}: {
  data: any[]; lineData: any[] | null; currentPrice: number; period: Period;
  intradayPoints: number[] | null;
  indicatorSeries: IndicatorSeries | null;
  seriesOffset?: number;
  enabledIndicators: Set<IndicatorId>;
  effectiveZoom: number;
  totalCandles: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanOffset: (delta: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom + drag pan
  const dragRef = useRef<{ active: boolean; startX: number }>({ active: false, startX: 0 });
  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (!data.length || intradayPoints) return;
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal trackpad pan
      e.preventDefault();
      const dir = e.deltaX > 0 ? 1 : -1;
      onPanOffset(dir * Math.max(1, Math.round(Math.abs(e.deltaX) / 8)));
    } else {
      // Vertical wheel = zoom
      e.preventDefault();
      if (e.deltaY < 0) onZoomIn(); else if (e.deltaY > 0) onZoomOut();
    }
  }, [data.length, intradayPoints, onZoomIn, onZoomOut, onPanOffset]);

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.startX = e.clientX;
    // 8px per candle
    if (Math.abs(dx) >= 8) onPanOffset(Math.round(-dx / 8));
  }, [onPanOffset]);
  const onPointerUp = useCallback(() => { dragRef.current.active = false; }, []);

  const width = size.w;
  const height = size.h;

  if (width <= 0 || height <= 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }

  const padding = { top: 16, right: 60, bottom: 26, left: 8 };
  const innerW = Math.max(0, width - padding.left - padding.right);
  const innerH = Math.max(0, height - padding.top - padding.bottom);

  // ============== Intraday branch ==============
  if (intradayPoints && intradayPoints.length > 0) {
    const WINDOW = 120;
    const points = intradayPoints.length >= WINDOW ? intradayPoints.slice(-WINDOW) : intradayPoints;
    const n = points.length;
    const intra = computeIntradayIndicators(points);

    const hasMA   = enabledIndicators.has('MA');
    const hasBOLL = enabledIndicators.has('BOLL');
    const hasKDJ  = enabledIndicators.has('KDJ');
    const hasWR   = enabledIndicators.has('WR');
    const hasDMI  = enabledIndicators.has('DMI');
    const hasVR   = enabledIndicators.has('VR');

    // MACD + VOL always shown on intraday (brokerage-style); oscillators follow toggles
    const subs: { kind: 'macd' | 'vol' | 'kdj' | 'wr' | 'dmi' | 'vr' }[] = [
      { kind: 'macd' },
      { kind: 'vol' },
    ];
    if (hasKDJ) subs.push({ kind: 'kdj' });
    if (hasWR)  subs.push({ kind: 'wr' });
    if (hasDMI) subs.push({ kind: 'dmi' });
    if (hasVR)  subs.push({ kind: 'vr' });

    const subCount = subs.length;
    const mainH = Math.floor(innerH * 0.55);
    const subTotalH = innerH - mainH - (subCount + 1) * 2;
    const subH = subCount > 0 ? Math.floor(subTotalH / subCount) : 0;
    const mainTop = padding.top;

    const subTops: Record<'macd' | 'vol' | 'kdj' | 'wr' | 'dmi' | 'vr', number> = {
      macd: 0, vol: 0, kdj: 0, wr: 0, dmi: 0, vr: 0,
    };
    subs.forEach((s, i) => { subTops[s.kind] = mainTop + mainH + 2 + i * (subH + 2); });

    const xScale = (i: number) => padding.left + (i / (WINDOW - 1)) * innerW;
    const open = points[0];
    let minVal = Math.min(...points);
    let maxVal = Math.max(...points);
    if (hasBOLL) {
      intra.boll.upper.forEach(v => { if (v !== null) maxVal = Math.max(maxVal, v); });
      intra.boll.lower.forEach(v => { if (v !== null) minVal = Math.min(minVal, v); });
    }
    if (hasMA) {
      [...intra.ma5, ...intra.ma10, ...intra.ma20, ...intra.avgPrice].forEach(v => {
        if (v !== null && typeof v === 'number') { minVal = Math.min(minVal, v); maxVal = Math.max(maxVal, v); }
      });
    }
    const padP = (maxVal - minVal) * 0.08 || maxVal * 0.005;
    minVal -= padP;
    maxVal += padP;
    const range = maxVal - minVal || 1;
    const yScale = (v: number) => mainTop + (1 - (v - minVal) / range) * mainH;

    const buildIntraPath = (series: (number | null)[], top: number, paneH: number, minV: number, maxV: number) => {
      let started = false;
      let path = '';
      const rng = maxV - minV || 1;
      const yMap = (v: number) => top + (1 - (v - minV) / rng) * paneH;
      series.forEach((v, i) => {
        if (v === null) return;
        const x = xScale(i);
        const y = yMap(v);
        path += `${started ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        started = true;
      });
      return path;
    };
    const buildPricePath = (series: (number | null)[]) => {
      let started = false;
      let path = '';
      series.forEach((v, i) => {
        if (v === null) return;
        const x = xScale(i);
        const y = yScale(v);
        path += `${started ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        started = true;
      });
      return path;
    };

    const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ');
    const lastDataX = xScale(n - 1);
    const areaPath = `${linePath} L ${lastDataX} ${mainTop + mainH} L ${xScale(0)} ${mainTop + mainH} Z`;
    const lastP = points[n - 1];
    const openY = yScale(open);
    const lineColor = lastP >= open ? 'var(--price-up)' : 'var(--price-down)';
    const areaGradId = 'intra-area-grad';
    const gridLevels = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => ({
      y: mainTop + t * mainH,
      price: maxVal - t * range,
    }));
    const timeLabels = [
      { ratio: 0, label: '09:30' }, { ratio: 0.25, label: '10:30' },
      { ratio: 0.5, label: '11:30' }, { ratio: 0.5, label: '13:00' },
      { ratio: 0.75, label: '14:00' }, { ratio: 1, label: '15:00' },
    ];

    const lastOf = <T,>(arr: T[]) => arr[n - 1];

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="candlestick-svg" width={width} height={height} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lastP >= open ? 'rgba(220, 38, 38, 0.18)' : 'rgba(22, 163, 74, 0.18)'} />
              <stop offset="100%" stopColor={lastP >= open ? 'rgba(220, 38, 38, 0)' : 'rgba(22, 163, 74, 0)'} />
            </linearGradient>
          </defs>

          {/* Main pane grid */}
          {gridLevels.map((g, i) => (
            <line key={`g-${i}`} x1={padding.left} x2={width - padding.right} y1={g.y} y2={g.y}
              stroke={i === 2 ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.05)'} strokeWidth={1} />
          ))}
          <line x1={padding.left} x2={width - padding.right} y1={openY} y2={openY}
            stroke="rgba(255, 255, 255, 0.4)" strokeWidth={0.8} strokeDasharray="4 4" />
          <text x={width - padding.right + 4} y={openY + 4} fill="rgba(255, 255, 255, 0.6)" fontSize={10}
            fontFamily="ui-monospace, monospace" textAnchor="start">开盘 {open.toFixed(2)}</text>

          {/* BOLL overlay */}
          {hasBOLL && (
            <g opacity={0.55}>
              <path d={buildPricePath(intra.boll.upper)} fill="none" stroke="#a78bfa" strokeWidth={0.8} strokeDasharray="2 2" />
              <path d={buildPricePath(intra.boll.middle)} fill="none" stroke="#a78bfa" strokeWidth={1} />
              <path d={buildPricePath(intra.boll.lower)} fill="none" stroke="#a78bfa" strokeWidth={0.8} strokeDasharray="2 2" />
            </g>
          )}

          {/* MA + 均价线 overlays */}
          {hasMA && (
            <g>
              <path d={buildPricePath(intra.ma5)} fill="none" stroke="#fbbf24" strokeWidth={1.5} />
              <path d={buildPricePath(intra.ma10)} fill="none" stroke="#e5e7eb" strokeWidth={1.5} />
              <path d={buildPricePath(intra.ma20)} fill="none" stroke="#c084fc" strokeWidth={1.5} />
              <path d={points.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(intra.avgPrice[i])}`).join(' ')}
                fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 2" />
            </g>
          )}

          <path d={areaPath} fill={`url(#${areaGradId})`} />
          <path d={linePath} stroke={lineColor} strokeWidth={1.5} fill="none"
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Current price crosshair */}
          <line x1={lastDataX} x2={lastDataX} y1={mainTop} y2={mainTop + mainH}
            stroke="rgba(255, 255, 255, 0.18)" strokeWidth={1} strokeDasharray="2 3" />
          {(() => {
            const y = yScale(currentPrice);
            if (y < mainTop || y > mainTop + mainH) return null;
            return (
              <g>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={lineColor} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
                <rect x={width - padding.right} y={y - 9} width={padding.right - 4} height={18} fill={lineColor} rx={2} />
                <text x={width - padding.right / 2} y={y + 4} fill="#fff" fontSize={11} fontWeight={600}
                  fontFamily="ui-monospace, monospace" textAnchor="middle">{currentPrice.toFixed(2)}</text>
              </g>
            );
          })()}

          {/* Main pane legend */}
          {hasMA && (() => {
            const lines: { color: string; text: string }[] = [
              { color: '#fbbf24', text: `MA5 ${intra.ma5[n - 1]?.toFixed(2) ?? '--'}` },
              { color: '#e5e7eb', text: `MA10 ${intra.ma10[n - 1]?.toFixed(2) ?? '--'}` },
              { color: '#c084fc', text: `MA20 ${intra.ma20[n - 1]?.toFixed(2) ?? '--'}` },
              { color: '#38bdf8', text: `均价 ${intra.avgPrice[n - 1]?.toFixed(2) ?? '--'}` },
            ];
            const lineH = 13;
            const boxH = lines.length * lineH + 8;
            return (
              <g>
                <rect x={padding.left + 4} y={mainTop + 4} width={150} height={boxH} fill="rgba(0,0,0,0.4)" rx={3} />
                {lines.map((l, i) => (
                  <text key={i} x={padding.left + 10} y={mainTop + 16 + i * lineH} fill={l.color} fontSize={10}
                    fontFamily="ui-monospace, monospace">{l.text}</text>
                ))}
              </g>
            );
          })()}

          {gridLevels.map((g, i) => (
            <text key={`yl-${i}`} x={width - padding.right + 4} y={g.y + 4} fill="rgba(255, 255, 255, 0.45)" fontSize={10}
              fontFamily="ui-monospace, monospace" textAnchor="start">{g.price.toFixed(2)}</text>
          ))}

          {/* Lunch break divider */}
          {(() => {
            const x = padding.left + 0.5 * innerW;
            return (
              <g>
                <line x1={x} x2={x} y1={mainTop} y2={mainTop + mainH} stroke="rgba(255, 255, 255, 0.18)" strokeWidth={1} strokeDasharray="2 4" />
                <rect x={x - 32} y={mainTop + 4} width={64} height={18} fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.1)" rx={3} />
                <text x={x} y={mainTop + 16} fill="rgba(255, 255, 255, 0.55)" fontSize={9}
                  fontFamily="ui-monospace, monospace" textAnchor="middle">午休 11:30-13:00</text>
              </g>
            );
          })()}

          {/* ========== MACD sub-pane ========== */}
          {(() => {
            const top = subTops.macd;
            const bars = intra.macd.bar;
            const barVals = bars.filter((v): v is number => v !== null);
            const maxBar = Math.max(...barVals.map(Math.abs), 0.001);
            const zeroY = top + subH / 2;
            const lastDiff = lastOf(intra.macd.diff);
            const lastDea = lastOf(intra.macd.dea);
            const lastBar = lastOf(intra.macd.bar);
            return (
              <g>
                <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 2" />
                <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">MACD</text>
                <text x={padding.left + 50} y={top + 11} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="ui-monospace, monospace">
                  {`DIF ${typeof lastDiff === 'number' ? lastDiff.toFixed(3) : '--'}  DEA ${typeof lastDea === 'number' ? lastDea.toFixed(3) : '--'}  MACD ${typeof lastBar === 'number' ? lastBar.toFixed(3) : '--'}`}
                </text>
                {bars.map((v, i) => {
                  if (v === null) return null;
                  const x = xScale(i);
                  const barH = (Math.abs(v) / maxBar) * (subH / 2 - 2);
                  const y = v >= 0 ? zeroY - barH : zeroY;
                  const color = v >= 0 ? 'var(--price-up)' : 'var(--price-down)';
                  const bw = Math.max(1, innerW / WINDOW * 0.6);
                  return <rect key={`mb-${i}`} x={x - bw / 2} y={y} width={bw} height={Math.max(1, barH)} fill={color} opacity={0.75} />;
                })}
                <path d={buildIntraPath(intra.macd.diff, top, subH, -maxBar, maxBar)} fill="none" stroke="#fbbf24" strokeWidth={1.2} />
                <path d={buildIntraPath(intra.macd.dea, top, subH, -maxBar, maxBar)} fill="none" stroke="#e5e7eb" strokeWidth={1.2} />
              </g>
            );
          })()}

          {/* ========== VOL sub-pane ========== */}
          {(() => {
            const top = subTops.vol;
            const maxVol = Math.max(...intra.vol, 0.001);
            return (
              <g>
                <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">VOL</text>
                {intra.vol.map((v, i) => {
                  const x = xScale(i);
                  const barH = (v / maxVol) * (subH - 4);
                  const isUp = i === 0 ? true : points[i] >= points[i - 1];
                  const color = isUp ? 'var(--price-up)' : 'var(--price-down)';
                  const bw = Math.max(1, innerW / WINDOW * 0.6);
                  return <rect key={`vb-${i}`} x={x - bw / 2} y={top + subH - barH} width={bw} height={Math.max(1, barH)} fill={color} opacity={0.7} />;
                })}
              </g>
            );
          })()}

          {/* ========== KDJ sub-pane ========== */}
          {hasKDJ && (() => {
            const top = subTops.kdj;
            const yMid = top + subH / 2;
            const yScaleKdj = (v: number) => top + (1 - v / 100) * subH;
            const lastK = lastOf(intra.kdj.k);
            const lastD = lastOf(intra.kdj.d);
            const lastJ = lastOf(intra.kdj.j);
            return (
              <g>
                <line x1={padding.left} x2={width - padding.right} y1={yMid} y2={yMid} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 2" />
                <line x1={padding.left} x2={width - padding.right} y1={yScaleKdj(80)} y2={yScaleKdj(80)} stroke="rgba(220,38,38,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
                <line x1={padding.left} x2={width - padding.right} y1={yScaleKdj(20)} y2={yScaleKdj(20)} stroke="rgba(22,163,74,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
                <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">KDJ</text>
                <path d={buildIntraPath(intra.kdj.k, top, subH, 0, 100)} fill="none" stroke="#f472b6" strokeWidth={1.2} />
                <path d={buildIntraPath(intra.kdj.d, top, subH, 0, 100)} fill="none" stroke="#fb7185" strokeWidth={1.2} />
                <path d={buildIntraPath(intra.kdj.j, top, subH, 0, 100)} fill="none" stroke="#fda4af" strokeWidth={1} strokeDasharray="3 2" />
                <text x={padding.left + 50} y={top + 11} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="ui-monospace, monospace">
                  {`K ${typeof lastK === 'number' ? lastK.toFixed(1) : '--'}  D ${typeof lastD === 'number' ? lastD.toFixed(1) : '--'}  J ${typeof lastJ === 'number' ? lastJ.toFixed(1) : '--'}`}
                </text>
              </g>
            );
          })()}

          {/* ========== WR sub-pane ========== */}
          {hasWR && (() => {
            const top = subTops.wr;
            const yScaleWr = (v: number) => top + (-v / 100) * subH;
            const lastWr = lastOf(intra.wr);
            return (
              <g>
                <line x1={padding.left} x2={width - padding.right} y1={yScaleWr(-20)} y2={yScaleWr(-20)} stroke="rgba(220,38,38,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
                <line x1={padding.left} x2={width - padding.right} y1={yScaleWr(-80)} y2={yScaleWr(-80)} stroke="rgba(22,163,74,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
                <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">WR(14)</text>
                <path d={buildIntraPath(intra.wr, top, subH, -100, 0)} fill="none" stroke="#22d3ee" strokeWidth={1.2} />
                <text x={padding.left + 60} y={top + 11} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="ui-monospace, monospace">
                  {`WR ${typeof lastWr === 'number' ? lastWr.toFixed(1) : '--'}`}
                </text>
              </g>
            );
          })()}

          {/* ========== DMI sub-pane ========== */}
          {hasDMI && (() => {
            const top = subTops.dmi;
            const yMid = top + subH / 2;
            return (
              <g>
                <line x1={padding.left} x2={width - padding.right} y1={yMid} y2={yMid} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 2" />
                <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">DMI/ADX</text>
                <path d={buildIntraPath(intra.dmi.pdi, top, subH, 0, 100)} fill="none" stroke="#22c55e" strokeWidth={1} />
                <path d={buildIntraPath(intra.dmi.mdi, top, subH, 0, 100)} fill="none" stroke="#ef4444" strokeWidth={1} />
                <path d={buildIntraPath(intra.dmi.adx, top, subH, 0, 100)} fill="none" stroke="#fb923c" strokeWidth={1} strokeDasharray="3 2" />
              </g>
            );
          })()}

          {/* ========== VR sub-pane ========== */}
          {hasVR && (() => {
            const top = subTops.vr;
            const arr = intra.vr.filter((v): v is number => v !== null && v > 0);
            const minV = Math.min(...arr, 0);
            const maxV = Math.max(...arr, 200);
            const yScaleVr = (v: number) => top + (1 - (v - minV) / Math.max(maxV - minV, 1)) * subH;
            const lastVr = lastOf(intra.vr);
            return (
              <g>
                <line x1={padding.left} x2={width - padding.right} y1={yScaleVr(100)} y2={yScaleVr(100)} stroke="rgba(251, 191, 36, 0.4)" strokeDasharray="2 2" strokeWidth={0.7} />
                <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">VR(24)</text>
                <path d={buildIntraPath(intra.vr, top, subH, minV, maxV)} fill="none" stroke="#34d399" strokeWidth={1.2} />
                <text x={padding.left + 50} y={top + 11} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="ui-monospace, monospace">
                  {`VR ${typeof lastVr === 'number' ? lastVr.toFixed(1) : '--'}`}
                </text>
              </g>
            );
          })()}

          {timeLabels.map((lbl, i) => {
            const x = padding.left + lbl.ratio * innerW;
            const dx = lbl.label === '13:00' ? 16 : 0;
            return (
              <text key={`xl-${i}`} x={x + dx} y={height - 8} fill="rgba(255, 255, 255, 0.4)" fontSize={10}
                fontFamily="ui-monospace, monospace" textAnchor="middle">{lbl.label}</text>
            );
          })}
        </svg>
      </div>
    );
  }

  // ============== Candle branch (1W+) ==============
  // Indicator scope resolution
  const hasMA   = enabledIndicators.has('MA');
  const hasBOLL = enabledIndicators.has('BOLL');
  const hasKDJ  = enabledIndicators.has('KDJ');
  const hasWR   = enabledIndicators.has('WR');
  const hasDMI  = enabledIndicators.has('DMI');
  const hasVR   = enabledIndicators.has('VR');

  // Sub-pane list (only enabled, in fixed vertical order)
  const subs: { kind: 'kdj' | 'wr' | 'dmi' | 'vr' }[] = [];
  if (hasKDJ) subs.push({ kind: 'kdj' });
  if (hasWR)  subs.push({ kind: 'wr' });
  if (hasDMI) subs.push({ kind: 'dmi' });
  if (hasVR)  subs.push({ kind: 'vr' });

  const hasAnySub = subs.length > 0;
  const subCount = subs.length;
  const mainH = hasAnySub ? Math.floor(innerH * 0.55) : innerH;
  const subTotalH = hasAnySub ? innerH - mainH - (subCount + 1) * 2 : 0;
  const subH = subCount > 0 ? Math.floor(subTotalH / subCount) : 0;
  const mainTop = padding.top;

  // Sub-pane top positions
  const subTops: Record<'kdj' | 'wr' | 'dmi' | 'vr', number> = {
    kdj: 0, wr: 0, dmi: 0, vr: 0,
  };
  subs.forEach((s, i) => { subTops[s.kind] = mainTop + mainH + 2 + i * (subH + 2); });

  // Price range: include OHLC of visible window + indicator extents
  const allValues = data.flatMap(d => [d.y[0], d.y[1], d.y[2], d.y[3]]);
  let minVal = Math.min(...allValues, currentPrice);
  let maxVal = Math.max(...allValues, currentPrice);
  if (hasBOLL && indicatorSeries) {
    indicatorSeries.boll.upper.forEach((v, i) => { if (v !== null && i >= seriesOffset && i < seriesOffset + data.length) maxVal = Math.max(maxVal, v); });
    indicatorSeries.boll.lower.forEach((v, i) => { if (v !== null && i >= seriesOffset && i < seriesOffset + data.length) minVal = Math.min(minVal, v); });
  }
  const span = maxVal - minVal || 1;
  minVal -= span * 0.05;
  maxVal += span * 0.05;
  const range = maxVal - minVal;

  const n = data.length;
  const xScale = (i: number) => padding.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yScale = (v: number) => mainTop + (1 - (v - minVal) / range) * mainH;
  const slotW = innerW / Math.max(n, 1);
  const candleW = Math.max(2, Math.min(slotW * 0.72, 16));

  const gridLevels = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => ({ y: mainTop + t * mainH, price: maxVal - t * range }));
  const currentY = yScale(currentPrice);
  const currentUp = currentPrice >= (data[0]?.y?.[0] ?? currentPrice);
  const currentColor = currentUp ? 'var(--price-up)' : 'var(--price-down)';

  const buildPath = (series: (number | null)[]) => {
    let started = false;
    let path = '';
    series.forEach((v, i) => {
      if (v === null) return;
      if (i < seriesOffset || i >= seriesOffset + n) return;
      const x = xScale(i - seriesOffset);
      const y = yScale(v);
      path += `${started ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      started = true;
    });
    return path;
  };

  const buildPathInPane = (series: (number | null)[], top: number, paneH: number, minV: number, maxV: number) => {
    let started = false;
    let path = '';
    const rng = maxV - minV || 1;
    series.forEach((v, i) => {
      if (v === null) return;
      if (i < seriesOffset || i >= seriesOffset + n) return;
      const x = xScale(i - seriesOffset);
      const y = top + (1 - (v - minV) / rng) * paneH;
      path += `${started ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      started = true;
    });
    return path;
  };

  // Last values (clipped to visible window) for the legend
  const lastInWindow = <T,>(arr: T[]) => arr[Math.min(arr.length - 1, seriesOffset + n - 1)];

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', cursor: 'grab' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="candlestick-svg" width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(96, 165, 250, 0.18)" />
            <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
          </linearGradient>
        </defs>

        {/* Main pane grid + content */}
        {gridLevels.map((g, i) => (
          <line key={`grid-${i}`} x1={padding.left} x2={width - padding.right} y1={g.y} y2={g.y}
            stroke="rgba(255, 255, 255, 0.06)" strokeWidth={1} />
        ))}

        {lineData && lineData.length > 1 && (() => {
          const path = lineData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.x)} ${yScale(d.y)}`).join(' ');
          const area = `${path} L ${xScale(lineData.length - 1)} ${mainTop + mainH} L ${xScale(0)} ${mainTop + mainH} Z`;
          return (
            <g>
              <path d={area} fill="url(#chart-area-grad)" />
              <path d={path} stroke="rgba(96, 165, 250, 0.55)" strokeWidth={1.25} fill="none"
                strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })()}

        {hasBOLL && indicatorSeries && (
          <g opacity={0.55}>
            <path d={buildPath(indicatorSeries.boll.upper)} fill="none" stroke="#a78bfa" strokeWidth={0.8} strokeDasharray="2 2" />
            <path d={buildPath(indicatorSeries.boll.middle)} fill="none" stroke="#a78bfa" strokeWidth={1} />
            <path d={buildPath(indicatorSeries.boll.lower)} fill="none" stroke="#a78bfa" strokeWidth={0.8} strokeDasharray="2 2" />
          </g>
        )}

        {hasMA && indicatorSeries && (
          <g>
            <path d={buildPath(indicatorSeries.ma5)} fill="none" stroke="#fbbf24" strokeWidth={1.5} />
            <path d={buildPath(indicatorSeries.ma10)} fill="none" stroke="#e5e7eb" strokeWidth={1.5} />
            <path d={buildPath(indicatorSeries.ma20)} fill="none" stroke="#c084fc" strokeWidth={1.5} />
          </g>
        )}

        {/* Candles */}
        {data.map((d, i) => {
          const x = xScale(d.x);
          const isUp = d.y[1] >= d.y[0];
          const color = isUp ? 'var(--price-up)' : 'var(--price-down)';
          const bodyTop = yScale(Math.max(d.y[0], d.y[1]));
          const bodyBottom = yScale(Math.min(d.y[0], d.y[1]));
          const wickTop = yScale(d.y[3]);
          const wickBottom = yScale(d.y[2]);
          const bodyH = Math.max(1, bodyBottom - bodyTop);
          return (
            <g key={i}>
              <line x1={x} y1={wickTop} x2={x} y2={wickBottom} stroke={color} strokeWidth={1} opacity={0.9} />
              <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                fill={color} fillOpacity={isUp ? 0.95 : 1} stroke={color} strokeWidth={0.5} rx={0.5} />
            </g>
          );
        })}

        {/* Current price tag in main pane */}
        {currentPrice > 0 && currentY >= mainTop && currentY <= mainTop + mainH && (
          <g>
            <line x1={padding.left} x2={width - padding.right} y1={currentY} y2={currentY}
              stroke={currentColor} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.7} />
            <rect x={width - padding.right} y={currentY - 9} width={padding.right - 4} height={18}
              fill={currentColor} rx={2} />
            <text x={width - padding.right / 2} y={currentY + 4} fill="#fff" fontSize={11} fontWeight={600}
              fontFamily="ui-monospace, monospace" textAnchor="middle">{currentPrice.toFixed(2)}</text>
          </g>
        )}

        {/* Legend in main pane */}
        {indicatorSeries && (() => {
          const lines: { color: string; text: string }[] = [];
          if (hasMA) {
            const last = lastInWindow(indicatorSeries.ma5);
            const last10 = lastInWindow(indicatorSeries.ma10);
            const last20 = lastInWindow(indicatorSeries.ma20);
            lines.push({ color: '#fbbf24', text: `MA5 ${typeof last === 'number' ? last.toFixed(2) : '--'}` },
              { color: '#e5e7eb', text: `MA10 ${typeof last10 === 'number' ? last10.toFixed(2) : '--'}` },
              { color: '#c084fc', text: `MA20 ${typeof last20 === 'number' ? last20.toFixed(2) : '--'}` });
          }
          if (hasBOLL) {
            const u = lastInWindow(indicatorSeries.boll.upper);
            const m = lastInWindow(indicatorSeries.boll.middle);
            const l = lastInWindow(indicatorSeries.boll.lower);
            lines.push({ color: '#a78bfa', text: `BOLL ${typeof l === 'number' ? l.toFixed(2) : '--'}/${typeof m === 'number' ? m.toFixed(2) : '--'}/${typeof u === 'number' ? u.toFixed(2) : '--'}` });
          }
          if (!lines.length) return null;
          const lineH = 13;
          const boxH = lines.length * lineH + 8;
          return (
            <g>
              <rect x={padding.left + 4} y={mainTop + 4} width={170} height={boxH} fill="rgba(0,0,0,0.4)" rx={3} />
              {lines.map((l, i) => (
                <text key={i} x={padding.left + 10} y={mainTop + 16 + i * lineH} fill={l.color} fontSize={10}
                  fontFamily="ui-monospace, monospace">{l.text}</text>
              ))}
            </g>
          );
        })()}

        {/* Y-axis price labels in main pane */}
        {gridLevels.map((g, i) => (
          <text key={`yl-${i}`} x={width - padding.right + 4} y={g.y + 4} fill="rgba(255, 255, 255, 0.45)" fontSize={10}
            fontFamily="ui-monospace, monospace" textAnchor="start">{g.price.toFixed(2)}</text>
        ))}

        {/* ========== KDJ sub-pane (0..100) ========== */}
        {hasKDJ && indicatorSeries && (() => {
          const top = subTops.kdj;
          const yMid = top + subH / 2;
          const yScaleKdj = (v: number) => top + (1 - v / 100) * subH;
          const lastK = lastInWindow(indicatorSeries.kdj.k);
          const lastD = lastInWindow(indicatorSeries.kdj.d);
          const lastJ = lastInWindow(indicatorSeries.kdj.j);
          return (
            <g>
              <line x1={padding.left} x2={width - padding.right} y1={yMid} y2={yMid} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 2" />
              <line x1={padding.left} x2={width - padding.right} y1={yScaleKdj(80)} y2={yScaleKdj(80)} stroke="rgba(220,38,38,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
              <line x1={padding.left} x2={width - padding.right} y1={yScaleKdj(20)} y2={yScaleKdj(20)} stroke="rgba(22,163,74,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
              <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">KDJ</text>
              <text x={width - padding.right + 4} y={yScaleKdj(20) + 3} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="ui-monospace, monospace">20</text>
              <text x={width - padding.right + 4} y={yScaleKdj(80) + 3} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="ui-monospace, monospace">80</text>
              <text x={width - padding.right + 4} y={yMid + 3} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="ui-monospace, monospace">50</text>
              <path d={buildPathInPane(indicatorSeries.kdj.k, top, subH, 0, 100)} fill="none" stroke="#f472b6" strokeWidth={1.2} />
              <path d={buildPathInPane(indicatorSeries.kdj.d, top, subH, 0, 100)} fill="none" stroke="#fb7185" strokeWidth={1.2} />
              <path d={buildPathInPane(indicatorSeries.kdj.j, top, subH, 0, 100)} fill="none" stroke="#fda4af" strokeWidth={1} strokeDasharray="3 2" />
              <text x={padding.left + 50} y={top + 11} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="ui-monospace, monospace">
                {`K ${typeof lastK === 'number' ? lastK.toFixed(1) : '--'}  D ${typeof lastD === 'number' ? lastD.toFixed(1) : '--'}  J ${typeof lastJ === 'number' ? lastJ.toFixed(1) : '--'}`}
              </text>
            </g>
          );
        })()}

        {/* ========== WR sub-pane (-100..0) ========== */}
        {hasWR && indicatorSeries && (() => {
          const top = subTops.wr;
          const yScaleWr = (v: number) => top + (-v / 100) * subH;
          const lastWr = lastInWindow(indicatorSeries.wr);
          return (
            <g>
              <line x1={padding.left} x2={width - padding.right} y1={yScaleWr(-20)} y2={yScaleWr(-20)} stroke="rgba(220,38,38,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
              <line x1={padding.left} x2={width - padding.right} y1={yScaleWr(-80)} y2={yScaleWr(-80)} stroke="rgba(22,163,74,0.5)" strokeDasharray="2 2" strokeWidth={0.6} />
              <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">WR(14)</text>
              <text x={width - padding.right + 4} y={yScaleWr(-20) + 3} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="ui-monospace, monospace">-20</text>
              <text x={width - padding.right + 4} y={yScaleWr(-80) + 3} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="ui-monospace, monospace">-80</text>
              <path d={buildPathInPane(indicatorSeries.wr, top, subH, -100, 0)} fill="none" stroke="#22d3ee" strokeWidth={1.2} />
              <text x={padding.left + 60} y={top + 11} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="ui-monospace, monospace">
                {`WR ${typeof lastWr === 'number' ? lastWr.toFixed(1) : '--'}`}
              </text>
            </g>
          );
        })()}

        {/* ========== DMI sub-pane (0..100) ========== */}
        {hasDMI && indicatorSeries && (() => {
          const top = subTops.dmi;
          const yMid = top + subH / 2;
          return (
            <g>
              <line x1={padding.left} x2={width - padding.right} y1={yMid} y2={yMid} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 2" />
              <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">DMI/ADX</text>
              <text x={width - padding.right + 4} y={top + subH - 3} fill="rgba(255,255,255,0.35)" fontSize={9} fontFamily="ui-monospace, monospace">0</text>
              <text x={width - padding.right + 4} y={top + 11} fill="rgba(255,255,255,0.35)" fontSize={9} fontFamily="ui-monospace, monospace">100</text>
              <path d={buildPathInPane(indicatorSeries.dmi.pdi, top, subH, 0, 100)} fill="none" stroke="#22c55e" strokeWidth={1} />
              <path d={buildPathInPane(indicatorSeries.dmi.mdi, top, subH, 0, 100)} fill="none" stroke="#ef4444" strokeWidth={1} />
              <path d={buildPathInPane(indicatorSeries.dmi.adx, top, subH, 0, 100)} fill="none" stroke="#fb923c" strokeWidth={1} strokeDasharray="3 2" />
            </g>
          );
        })()}

        {/* ========== VR sub-pane ========== */}
        {hasVR && indicatorSeries && (() => {
          const top = subTops.vr;
          const arr = indicatorSeries.vr.filter((v): v is number => v !== null && v > 0);
          const minV = Math.min(...arr, 0);
          const maxV = Math.max(...arr, 200);
          const yScaleVr = (v: number) => top + (1 - (v - minV) / Math.max(maxV - minV, 1)) * subH;
          const lastVr = lastInWindow(indicatorSeries.vr);
          return (
            <g>
              <line x1={padding.left} x2={width - padding.right} y1={yScaleVr(100)} y2={yScaleVr(100)} stroke="rgba(251, 191, 36, 0.4)" strokeDasharray="2 2" strokeWidth={0.7} />
              <text x={padding.left + 4} y={top + 11} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="ui-monospace, monospace">VR(24)</text>
              <text x={padding.left + 50} y={top + 11} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="ui-monospace, monospace">
                {`VR ${typeof lastVr === 'number' ? lastVr.toFixed(1) : '--'}`}
              </text>
              <path d={buildPathInPane(indicatorSeries.vr, top, subH, minV, maxV)} fill="none" stroke="#34d399" strokeWidth={1.2} />
            </g>
          );
        })()}

        {/* X-axis labels */}
        {(() => {
          const labels = xAxisLabels(period, n);
          return labels.map((lbl, i) => {
            const xRatio = lbl.idx / Math.max(n - 1, 1);
            const x = padding.left + xRatio * innerW;
            return (
              <text key={`xl-${i}`} x={x} y={height - 8} fill="rgba(255, 255, 255, 0.4)" fontSize={10}
                fontFamily="ui-monospace, monospace" textAnchor="middle">{lbl.label}</text>
            );
          });
        })()}
      </svg>

      {/* Zoom hint overlay (top-right) */}
      <div className="mc-zoom-hint">滚轮 / 拖动 · 缩放 / 平移</div>
    </div>
  );
}

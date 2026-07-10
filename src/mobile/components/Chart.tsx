/**
 * 移动端分时 / K 线图表 — 样式对齐桌面端 MarketChart：
 *  - 分时：单色线 + 渐变填充、开盘虚线、涨跌停虚线、成交量柱、十字线
 *  - K 线：红阳绿阴 + 影线、成交量柱、涨跌停虚线、十字线 + OHLC tooltip
 */

import {
  useMemo, useEffect, useState, useRef, useCallback,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useGameStore } from '../../store/gameStore';
import {
  priceLimitsFromPrevClose,
  resolveDayOpen,
  resolvePrevCloseForLimits,
} from '../../shared/priceLimits';

type Period = '1D' | '1W' | '1M';

interface Props {
  symbol?: string;
}

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const INTRA_WINDOW = 120;

function generateMockCandles(count: number, basePrice: number, seedKey: string): Candle[] {
  let seed = 0;
  for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xfffffff) / 0xfffffff;
  };
  const candles: Candle[] = [];
  let price = basePrice * 0.985;
  const drift = (basePrice - price) / count;
  for (let i = 0; i < count; i++) {
    const open = price;
    const noise = (rand() - 0.5) * basePrice * 0.012;
    const reversion = (basePrice - price) * 0.06;
    let close = open + noise + reversion + drift;
    const body = Math.abs(close - open);
    const wick = body * (0.3 + rand() * 0.7) + basePrice * 0.002;
    candles.push({
      timestamp: Date.now() - (count - i) * 86_400_000,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      volume: rand() * 1_000_000,
    });
    price = close;
  }
  if (candles.length) {
    const last = candles[candles.length - 1];
    last.close = basePrice;
    last.high = Math.max(last.high, basePrice);
    last.low = Math.min(last.low, basePrice);
  }
  return candles;
}

function intradayTimeFromIndex(index: number, windowSize = INTRA_WINDOW): string {
  const ratio = index / Math.max(windowSize - 1, 1);
  if (ratio <= 0.5) {
    const minutesFromOpen = ratio * 2 * 120;
    const total = 9 * 60 + 30 + minutesFromOpen;
    const hh = Math.floor(total / 60);
    const mm = Math.round(total % 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const afternoonRatio = (ratio - 0.5) * 2;
  const minutesFromPm = afternoonRatio * 120;
  const total = 13 * 60 + minutesFromPm;
  const hh = Math.floor(total / 60);
  const mm = Math.round(total % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function candleTimeLabel(c: Candle, period: Period, index: number): string {
  if (c.timestamp > 1_000_000_000_000) {
    const d = new Date(c.timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (period === '1W') {
    const days = ['一', '二', '三', '四', '五'];
    return `周${days[index % days.length]}`;
  }
  return `${index + 1}日`;
}

export default function MobileChart({ symbol: propSymbol }: Props) {
  const currentQuote = useGameStore((s) => s.currentQuote);
  const timelineData = useGameStore((s) => s.timelineData);
  const timelineBySymbol = useGameStore((s) => s.timelineBySymbol);
  const klines = useGameStore((s) => s.klines);
  const klinesBySymbol = useGameStore((s) => s.klinesBySymbol);
  const stockPrices = useGameStore((s) => s.stockPrices);
  const allStocks = useGameStore((s) => s.allStocks);

  const [period, setPeriod] = useState<Period>('1D');
  const isIntraday = period === '1D';

  const sym = propSymbol ?? currentQuote.symbol;
  const stock = allStocks.find((x) => x.symbol === sym);
  const currentDay = useGameStore((s) => s.currentDay);
  const currentPrice =
    sym === currentQuote.symbol
      ? currentQuote.price
      : (stockPrices[sym] ?? stock?.price ?? 0);

  const timeline =
    sym === currentQuote.symbol ? timelineData : (timelineBySymbol[sym] ?? []);
  const activeKlines =
    sym === currentQuote.symbol ? klines : (klinesBySymbol[sym] ?? []);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(320);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      if (wrapRef.current) setW(wrapRef.current.clientWidth);
    });
    ro.observe(wrapRef.current);
    setW(wrapRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 涨跌停基准 = 前收盘价（Day1 用初始开盘价；Day2+ 用 quote.prevClose 或昨日 K 线收盘）
  const limitBand = useMemo(() => {
    const quote = sym === currentQuote.symbol ? currentQuote : undefined;
    const prevClose = resolvePrevCloseForLimits({
      currentDay,
      quote,
      klines: activeKlines as Array<{ close?: number }>,
      seedPrice: stock?.price,
      seedChange: stock?.change,
    });
    return priceLimitsFromPrevClose(prevClose);
  }, [sym, currentQuote, currentDay, activeKlines, stock]);

  const { prevClose: limitPrevClose, limitUp, limitDown } = limitBand;

  const dayOpen = useMemo(() => {
    const firstPoint = timeline.length > 0 ? timeline[0] : undefined;
    return resolveDayOpen({
      quote: sym === currentQuote.symbol ? currentQuote : undefined,
      firstIntradayPoint: firstPoint,
      prevClose: limitPrevClose,
    });
  }, [sym, currentQuote, timeline, limitPrevClose]);

  const intradayPoints = useMemo(() => {
    if (!isIntraday) return [] as number[];
    if (timeline.length > 0) {
      return timeline.length >= INTRA_WINDOW ? timeline.slice(-INTRA_WINDOW) : [...timeline];
    }
    // lightweight mock when no live data yet
    const pts: number[] = [];
    let p = dayOpen;
    for (let i = 0; i < 40; i++) {
      p = Math.max(limitDown, Math.min(limitUp, p * (1 + (Math.random() - 0.48) * 0.004)));
      pts.push(p);
    }
    return pts;
  }, [isIntraday, timeline, dayOpen, limitUp, limitDown]);

  const candles = useMemo(() => {
    if (isIntraday) return [] as Candle[];
    const count = period === '1W' ? 30 : 60;
    const mock = generateMockCandles(count, currentPrice || dayOpen, `${sym}-${period}`);
    const live = (activeKlines as Candle[]).filter(
      (k) => Number.isFinite(k?.close) && k.close > 0,
    );
    return [...mock, ...live].slice(-count);
  }, [isIntraday, period, currentPrice, dayOpen, sym, activeKlines]);

  const layout = useMemo(() => {
    const W = Math.max(w, 280);
    const H = 240;
    const pad = { l: 8, r: 58, t: 14, b: 22 };
    const mainH = 150;
    const volH = 40;
    const gap = 6;
    const volTop = pad.t + mainH + gap;
    const innerW = W - pad.l - pad.r;
    return { W, H, pad, mainH, volH, volTop, innerW };
  }, [w]);

  const intraGeom = useMemo(() => {
    if (!isIntraday) return null;
    const { pad, mainH, volH, volTop, innerW } = layout;
    const points = intradayPoints;
    const n = Math.max(points.length, 1);
    const open = points[0] ?? dayOpen;

    // ⛳ Y 轴范围固定为 [跌停, 涨停]，与开盘价无关。
    //   这样涨跌停线永远贴在图表上下边缘，不管当前价格是高位还是低位都不会移动。
    //   价格会在这个固定区间内运动。
    const minVal = limitDown;
    const maxVal = limitUp;
    const range = maxVal - minVal || 1;

    const xScale = (i: number) => pad.l + (i / Math.max(INTRA_WINDOW - 1, 1)) * innerW;
    const yScale = (v: number) => pad.t + (1 - (v - minVal) / range) * mainH;

    const linePath = points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
      .join(' ');
    const lastX = xScale(Math.max(n - 1, 0));
    const areaPath = n >= 2
      ? `${linePath} L ${lastX.toFixed(1)} ${(pad.t + mainH).toFixed(1)} L ${xScale(0).toFixed(1)} ${(pad.t + mainH).toFixed(1)} Z`
      : '';

    const vols: number[] = [];
    for (let i = 1; i < n; i++) vols.push(Math.abs(points[i] - points[i - 1]));
    if (vols.length === 0) vols.push(0);
    const maxVol = Math.max(...vols, 1e-9);
    const bw = Math.max(1, (innerW / INTRA_WINDOW) * 0.6);
    const volBars = vols.map((v, i) => {
      const idx = i + 1;
      const barH = (v / maxVol) * (volH - 4);
      const up = points[idx] >= points[idx - 1];
      return {
        x: xScale(idx) - bw / 2,
        y: volTop + volH - barH,
        h: Math.max(1, barH),
        up,
      };
    });

    const lastP = points[n - 1] ?? open;
    const up = lastP >= open;

    return {
      points, n, open, minVal, maxVal, range,
      xScale, yScale, linePath, areaPath, volBars, bw,
      lastP, up,
    };
  }, [isIntraday, intradayPoints, layout, dayOpen, limitUp, limitDown]);

  const candleGeom = useMemo(() => {
    if (isIntraday || candles.length === 0) return null;
    const { pad, mainH, volH, volTop, innerW } = layout;
    const n = candles.length;
    const opens = candles.map((c) => c.open);
    const open0 = opens[0] ?? dayOpen;

    // ⛳ K 线 Y 轴同样固定为 [跌停, 涨停]。
    //   影线 / 实体超过涨跌停会被服务端/客户端 clamp 到涨跌停，
    //   所以 visual 范围与 limit 范围一致。
    const minVal = limitDown;
    const maxVal = limitUp;
    const range = maxVal - minVal || 1;

    const slotW = innerW / Math.max(n, 1);
    const candleW = Math.max(2, Math.min(slotW * 0.72, 14));
    const xScale = (i: number) => pad.l + (i + 0.5) * slotW;
    const yScale = (v: number) => pad.t + (1 - (v - minVal) / range) * mainH;

    const maxVol = Math.max(...candles.map((c) => c.volume), 1);
    const volBars = candles.map((c, i) => {
      const barH = (c.volume / maxVol) * (volH - 4);
      const up = c.close >= c.open;
      return {
        x: xScale(i) - candleW / 2,
        y: volTop + volH - barH,
        h: Math.max(1, barH),
        w: candleW,
        up,
      };
    });

    const bodies = candles.map((c, i) => {
      const up = c.close >= c.open;
      const bodyTop = yScale(Math.max(c.open, c.close));
      const bodyBottom = yScale(Math.min(c.open, c.close));
      return {
        i,
        x: xScale(i),
        up,
        bodyTop,
        bodyH: Math.max(1, bodyBottom - bodyTop),
        wickTop: yScale(c.high),
        wickBottom: yScale(c.low),
        candleW,
        ohlc: c,
      };
    });

    return {
      n, open0, minVal, maxVal, range,
      xScale, yScale, bodies, volBars, candleW,
    };
  }, [isIntraday, candles, layout, dayOpen, limitUp, limitDown]);

  const indexFromClientX = useCallback(
    (clientX: number, count: number, denom: number) => {
      const el = wrapRef.current;
      if (!el || count <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const svgPad = 8; // .m-chart-wrap padding
      const x = clientX - rect.left - svgPad;
      const { pad, innerW } = layout;
      const raw = ((x - pad.l) / Math.max(innerW, 1)) * denom;
      return Math.round(Math.max(0, Math.min(count - 1, raw)));
    },
    [layout],
  );

  const onPointer = useCallback(
    (e: ReactPointerEvent) => {
      if (isIntraday && intraGeom) {
        setHoverIdx(indexFromClientX(e.clientX, intraGeom.n, INTRA_WINDOW - 1));
      } else if (candleGeom) {
        setHoverIdx(indexFromClientX(e.clientX, candleGeom.n, Math.max(candleGeom.n - 1, 1)));
      }
    },
    [isIntraday, intraGeom, candleGeom, indexFromClientX],
  );

  const clearHover = useCallback(() => setHoverIdx(null), []);

  const { W, H, pad, mainH, volTop, innerW } = layout;
  const upColor = 'var(--price-up, #dc2626)';
  const downColor = 'var(--price-down, #16a34a)';

  const hover = useMemo(() => {
    if (hoverIdx === null) return null;
    if (isIntraday && intraGeom && hoverIdx < intraGeom.n) {
      const price = intraGeom.points[hoverIdx];
      return {
        index: hoverIdx,
        x: intraGeom.xScale(hoverIdx),
        y: intraGeom.yScale(price),
        price,
        time: intradayTimeFromIndex(hoverIdx, INTRA_WINDOW),
        ohlc: null as null | Candle,
      };
    }
    if (!isIntraday && candleGeom && hoverIdx < candleGeom.n) {
      const c = candles[hoverIdx];
      return {
        index: hoverIdx,
        x: candleGeom.xScale(hoverIdx),
        y: candleGeom.yScale(c.close),
        price: c.close,
        time: candleTimeLabel(c, period, hoverIdx),
        ohlc: c,
      };
    }
    return null;
  }, [hoverIdx, isIntraday, intraGeom, candleGeom, candles, period]);

  const lineColor = isIntraday && intraGeom
    ? (intraGeom.up ? upColor : downColor)
    : upColor;
  const areaTop = isIntraday && intraGeom
    ? (intraGeom.up ? 'rgba(220, 38, 38, 0.18)' : 'rgba(22, 163, 74, 0.18)')
    : 'rgba(220, 38, 38, 0.18)';
  const areaBot = isIntraday && intraGeom
    ? (intraGeom.up ? 'rgba(220, 38, 38, 0)' : 'rgba(22, 163, 74, 0)')
    : 'rgba(220, 38, 38, 0)';

  const yScaleActive = isIntraday ? intraGeom?.yScale : candleGeom?.yScale;
  const openY = yScaleActive?.(isIntraday ? (intraGeom?.open ?? dayOpen) : (candleGeom?.open0 ?? dayOpen));
  const upperY = yScaleActive?.(limitUp);
  const lowerY = yScaleActive?.(limitDown);

  return (
    <div className="m-chart-wrap" ref={wrapRef}>
      <div className="m-chart-periods" role="tablist" aria-label="图表周期">
        {([
          ['1D', '分时'],
          ['1W', '日K'],
          ['1M', '周K'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={period === id}
            className={`m-chart-period ${period === id ? 'active' : ''}`}
            onClick={() => { setPeriod(id); setHoverIdx(null); }}
          >
            {label}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="m-chart-svg"
        preserveAspectRatio="none"
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={clearHover}
        onPointerCancel={clearHover}
        onPointerLeave={clearHover}
      >
        <defs>
          <linearGradient id="m-intra-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={areaTop} />
            <stop offset="100%" stopColor={areaBot} />
          </linearGradient>
        </defs>

        {/* grid */}
        {[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => (
          <line
            key={t}
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + t * mainH}
            y2={pad.t + t * mainH}
            stroke={t === 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'}
            strokeWidth={1}
          />
        ))}

        {/* 开盘虚线 */}
        {openY !== undefined && (
          <g>
            <line
              x1={pad.l} x2={W - pad.r} y1={openY} y2={openY}
              stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} strokeDasharray="4 4"
            />
            <text
              x={W - pad.r + 4} y={openY + 4}
              fill="rgba(255,255,255,0.6)" fontSize={9}
              fontFamily="ui-monospace, monospace"
            >
              开盘 {(isIntraday ? intraGeom?.open : candleGeom?.open0)?.toFixed(2)}
            </text>
          </g>
        )}

        {/* 涨跌停虚线 + 半透明色带 */}
        {upperY !== undefined && lowerY !== undefined && (
          <g>
            <rect
              x={pad.l}
              y={Math.max(pad.t, upperY)}
              width={innerW}
              height={Math.max(0, pad.t + mainH - Math.max(pad.t, upperY))}
              fill="rgba(220, 38, 38, 0.08)"
            />
            <line
              x1={pad.l} x2={W - pad.r} y1={upperY} y2={upperY}
              stroke="rgba(220, 38, 38, 0.7)" strokeWidth={1} strokeDasharray="6 3"
            />
            <text
              x={W - pad.r + 4} y={upperY + 4}
              fill="rgba(220, 38, 38, 0.9)" fontSize={9} fontWeight={600}
              fontFamily="ui-monospace, monospace"
            >
              ↑ 涨停 {limitUp.toFixed(2)}
            </text>

            <rect
              x={pad.l}
              y={lowerY}
              width={innerW}
              height={Math.max(0, Math.min(pad.t + mainH, lowerY + 1) - lowerY)}
              fill="rgba(22, 163, 74, 0.08)"
            />
            <line
              x1={pad.l} x2={W - pad.r} y1={lowerY} y2={lowerY}
              stroke="rgba(22, 163, 74, 0.7)" strokeWidth={1} strokeDasharray="6 3"
            />
            <text
              x={W - pad.r + 4} y={lowerY + 4}
              fill="rgba(22, 163, 74, 0.9)" fontSize={9} fontWeight={600}
              fontFamily="ui-monospace, monospace"
            >
              ↓ 跌停 {limitDown.toFixed(2)}
            </text>
          </g>
        )}

        {/* ===== 分时 ===== */}
        {isIntraday && intraGeom && (
          <g>
            {intraGeom.areaPath && (
              <path d={intraGeom.areaPath} fill="url(#m-intra-area)" />
            )}
            <path
              d={intraGeom.linePath}
              stroke={lineColor}
              strokeWidth={1.5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* 最新价虚线 + 涨跌幅标签 */}
            {(() => {
              const yL = intraGeom.yScale(intraGeom.lastP);
              const pct = intraGeom.open > 0
                ? ((intraGeom.lastP - intraGeom.open) / intraGeom.open) * 100
                : 0;
              const sign = pct >= 0 ? '+' : '−';
              return (
                <g>
                  <line
                    x1={pad.l} x2={W - pad.r} y1={yL} y2={yL}
                    stroke={lineColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.7}
                  />
                  <rect
                    x={W - pad.r + 2} y={yL - 9} width={52} height={18}
                    fill={intraGeom.up ? 'rgba(220, 38, 38, 0.85)' : 'rgba(22, 163, 74, 0.85)'}
                    rx={2}
                  />
                  <text
                    x={W - pad.r + 28} y={yL + 4}
                    fill="#fff" fontSize={9} fontWeight={600}
                    fontFamily="ui-monospace, monospace" textAnchor="middle"
                  >
                    {`${sign}${Math.abs(pct).toFixed(2)}%`}
                  </text>
                </g>
              );
            })()}
            {/* VOL */}
            <line
              x1={pad.l} x2={W - pad.r} y1={volTop} y2={volTop}
              stroke="rgba(255,255,255,0.08)"
            />
            <text
              x={pad.l + 2} y={volTop + 10}
              fill="rgba(255,255,255,0.45)" fontSize={8}
              fontFamily="ui-monospace, monospace"
            >
              VOL
            </text>
            {intraGeom.volBars.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={intraGeom.bw}
                height={b.h}
                fill={b.up ? upColor : downColor}
                opacity={0.7}
              />
            ))}
            {/* time axis */}
            {[
              { r: 0, t: '09:30' },
              { r: 0.25, t: '10:30' },
              { r: 0.5, t: '11:30' },
              { r: 0.75, t: '14:00' },
              { r: 1, t: '15:00' },
            ].map((lbl) => (
              <text
                key={lbl.t}
                x={pad.l + lbl.r * innerW}
                y={H - 6}
                fill="rgba(255,255,255,0.4)"
                fontSize={8}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {lbl.t}
              </text>
            ))}
          </g>
        )}

        {/* ===== K 线 ===== */}
        {!isIntraday && candleGeom && (
          <g>
            {candleGeom.bodies.map((b) => {
              const color = b.up ? upColor : downColor;
              return (
                <g key={b.i}>
                  <line
                    x1={b.x} y1={b.wickTop} x2={b.x} y2={b.wickBottom}
                    stroke={color} strokeWidth={1} opacity={0.9}
                  />
                  <rect
                    x={b.x - b.candleW / 2}
                    y={b.bodyTop}
                    width={b.candleW}
                    height={b.bodyH}
                    fill={color}
                    fillOpacity={b.up ? 0.95 : 1}
                    stroke={color}
                    strokeWidth={0.5}
                    rx={0.5}
                  />
                </g>
              );
            })}
            <line
              x1={pad.l} x2={W - pad.r} y1={volTop} y2={volTop}
              stroke="rgba(255,255,255,0.08)"
            />
            <text
              x={pad.l + 2} y={volTop + 10}
              fill="rgba(255,255,255,0.45)" fontSize={8}
              fontFamily="ui-monospace, monospace"
            >
              VOL
            </text>
            {candleGeom.volBars.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill={b.up ? upColor : downColor}
                opacity={0.7}
              />
            ))}
          </g>
        )}

        {/* 十字线 + tooltip */}
        {hover && (
          <g className="m-crosshair" pointerEvents="none">
            <line
              x1={hover.x} x2={hover.x}
              y1={pad.t} y2={pad.t + mainH}
              stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="4 4"
            />
            <line
              x1={pad.l} x2={W - pad.r}
              y1={hover.y} y2={hover.y}
              stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="4 4"
            />
            <rect
              x={W - pad.r}
              y={hover.y - 9}
              width={pad.r - 4}
              height={18}
              fill={hover.ohlc
                ? (hover.ohlc.close >= hover.ohlc.open ? upColor : downColor)
                : (hover.price >= dayOpen ? upColor : downColor)}
              rx={2}
              opacity={0.92}
            />
            <text
              x={W - pad.r / 2}
              y={hover.y + 4}
              fill="#fff"
              fontSize={10}
              fontWeight={600}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {hover.price.toFixed(2)}
            </text>
            <rect
              x={Math.max(pad.l, hover.x - 28)}
              y={H - pad.b + 2}
              width={56}
              height={16}
              fill="rgba(0,0,0,0.55)"
              stroke="rgba(255,255,255,0.15)"
              rx={2}
            />
            <text
              x={Math.max(pad.l + 28, hover.x)}
              y={H - pad.b + 13}
              fill="rgba(255,255,255,0.75)"
              fontSize={9}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {hover.time}
            </text>

            {/* floating tip */}
            {(() => {
              const tipW = hover.ohlc ? 120 : 96;
              const tipH = hover.ohlc ? 62 : 34;
              const tipX = Math.min(hover.x + 10, W - tipW - pad.r - 4);
              const tipY = Math.max(pad.t + 4, hover.y - tipH - 8);
              const pc = hover.ohlc
                ? (hover.ohlc.close >= hover.ohlc.open ? upColor : downColor)
                : (hover.price >= dayOpen ? upColor : downColor);
              return (
                <g>
                  <rect
                    x={tipX} y={tipY} width={tipW} height={tipH}
                    fill="rgba(0,0,0,0.72)" stroke="rgba(255,255,255,0.12)" rx={3}
                  />
                  {hover.ohlc ? (
                    <>
                      {[
                        { l: '开', v: hover.ohlc.open, c: 'rgba(255,255,255,0.75)' },
                        { l: '高', v: hover.ohlc.high, c: upColor },
                        { l: '低', v: hover.ohlc.low, c: downColor },
                        { l: '收', v: hover.ohlc.close, c: pc },
                      ].map((row, i) => (
                        <text
                          key={row.l}
                          x={tipX + 8}
                          y={tipY + 14 + i * 12}
                          fill={row.c}
                          fontSize={9}
                          fontFamily="ui-monospace, monospace"
                        >
                          {`${row.l} ${row.v.toFixed(2)}`}
                        </text>
                      ))}
                    </>
                  ) : (
                    <>
                      <text
                        x={tipX + 8} y={tipY + 14}
                        fill={pc} fontSize={10} fontWeight={600}
                        fontFamily="ui-monospace, monospace"
                      >
                        {hover.price.toFixed(2)}
                      </text>
                      <text
                        x={tipX + 8} y={tipY + 26}
                        fill="rgba(255,255,255,0.65)" fontSize={9}
                        fontFamily="ui-monospace, monospace"
                      >
                        {hover.time}
                      </text>
                    </>
                  )}
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * 移动端轻量级内嵌分时/K 线图表（不引 recharts 等重库）。
 * - 24px main pane + 30px volume pane
 * - 涨跌停 + 开盘价参考线
 * - 自适应宽度
 */

import { useMemo, useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';

interface Props {
  symbol?: string;
}

const PRICE_LIMIT_PCT = 0.10;

export default function MobileChart({ symbol: propSymbol }: Props) {
  const currentQuote = useGameStore((s) => s.currentQuote);
  const timelineData = useGameStore((s) => s.timelineData);
  const timelineBySymbol = useGameStore((s) => s.timelineBySymbol);
  const klines = useGameStore((s) => s.klines);
  const klinesBySymbol = useGameStore((s) => s.klinesBySymbol);

  const sym = propSymbol ?? currentQuote.symbol;
  const points = sym === currentQuote.symbol ? timelineData : (timelineBySymbol[sym] ?? []);

  const stock = useGameStore((s) => s.allStocks.find((x) => x.symbol === sym));
  const stockPrices = useGameStore((s) => s.stockPrices);
  const currentPrice = sym === currentQuote.symbol ? currentQuote.price : (stockPrices[sym] ?? stock?.price ?? 0);

  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState<number>(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      if (ref.current) setW(ref.current.clientWidth);
    });
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cfg = useMemo(() => {
    const W = Math.max(w, 280);
    const H = 200;
    const pad = { l: 8, r: 56, t: 14, b: 22 };
    const mainH = 130;
    const volH = 36;
    const volTop = pad.t + mainH + 6;

    const closes = points.length > 0 ? points : [currentPrice];
    const open = closes[0] ?? currentPrice;
    const upper = open * (1 + PRICE_LIMIT_PCT);
    const lower = open * (1 - PRICE_LIMIT_PCT);

    let minV = Math.min(...closes, upper, lower);
    let maxV = Math.max(...closes, upper, lower);

    const n = closes.length;
    const innerW = W - pad.l - pad.r;
    const innerH = mainH;
    const xStep = innerW / Math.max(n - 1, 1);
    const yScale = (v: number) => pad.t + (1 - (v - minV) / Math.max(maxV - minV, 1e-9)) * innerH;
    const xScale = (i: number) => pad.l + i * xStep;

    // 价格变动（每对相邻点的差 → 颜色）
    const segs: { d: string; color: string }[] = [];
    for (let i = 1; i < n; i++) {
      const c0 = closes[i - 1], c1 = closes[i];
      const x0 = xScale(i - 1), y0 = yScale(c0);
      const x1 = xScale(i), y1 = yScale(c1);
      segs.push({
        d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`,
        color: c1 >= c0 ? 'var(--price-up)' : 'var(--price-down)',
      });
    }
    // 价格线下面积
    const lastX = xScale(n - 1);
    const lastY = yScale(closes[n - 1]);
    const areaD = n >= 2
      ? `${segs.map((s) => s.d).join(' L ').replace(/^M /, 'M ')} L ${lastX.toFixed(1)} ${(pad.t + mainH).toFixed(1)} L ${pad.l.toFixed(1)} ${(pad.t + mainH).toFixed(1)} Z`
      : '';

    // 成交量子图 — 用 |closes[i] - closes[i-1]|
    const vols: number[] = [];
    for (let i = 1; i < n; i++) vols.push(Math.abs(closes[i] - closes[i - 1]));
    const maxVol = Math.max(...vols, 1e-9);
    const barW = Math.max(2, Math.min(6, xStep * 0.7));
    const volSegs = vols.map((v, i) => {
      const x = xScale(i + 1) - barW / 2;
      const y = volTop + (1 - v / maxVol) * volH;
      const h = volTop + volH - y;
      const up = closes[i + 1] >= closes[i];
      return { x, y, h, color: up ? 'rgba(220,38,38,0.6)' : 'rgba(22,163,74,0.6)' };
    });

    return {
      W, H, pad, mainH, volH, volTop,
      open, upper, lower, closes,
      segs, areaD,
      yScale, xScale, innerW, volSegs,
      n, currentPrice,
    };
  }, [points, currentPrice, w, sym]);

  return (
    <div ref={ref} className="m-chart-wrap" style={{ margin: '12px 0 0' }}>
      <svg viewBox={`0 0 ${cfg.W} ${cfg.H}`} className="m-chart-svg" preserveAspectRatio="none">
        {/* 主面板网格 */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
            y1={cfg.pad.t + p * cfg.mainH} y2={cfg.pad.t + p * cfg.mainH}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1"
          />
        ))}
        {/* 开盘 / 涨 / 停 3 条参考线 */}
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.yScale(cfg.open)} y2={cfg.yScale(cfg.open)}
          stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" strokeWidth="0.8"
        />
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.yScale(cfg.upper)} y2={cfg.yScale(cfg.upper)}
          stroke="rgba(220,38,38,0.5)" strokeDasharray="5 4" strokeWidth="1"
        />
        <text x={cfg.W - cfg.pad.r + 4} y={cfg.yScale(cfg.upper) + 3} fontSize="9" fill="rgba(220,38,38,0.85)">
          ↑{cfg.upper.toFixed(2)}
        </text>
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.yScale(cfg.lower)} y2={cfg.yScale(cfg.lower)}
          stroke="rgba(22,163,74,0.5)" strokeDasharray="5 4" strokeWidth="1"
        />
        <text x={cfg.W - cfg.pad.r + 4} y={cfg.yScale(cfg.lower) + 3} fontSize="9" fill="rgba(22,163,74,0.85)">
          ↓{cfg.lower.toFixed(2)}
        </text>

        {/* 面积 + 主曲线 */}
        {cfg.areaD && <path d={cfg.areaD} fill="url(#m-chart-fill)" />}
        <defs>
          <linearGradient id="m-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cfg.closes[cfg.n - 1] >= cfg.open ? 'rgba(220,38,38,0.18)' : 'rgba(22,163,74,0.18)'} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        {cfg.segs.map((s, i) => (
          <path key={i} d={s.d} stroke={s.color} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
        ))}

        {/* 成交量子图 */}
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.volTop} y2={cfg.volTop}
          stroke="rgba(255,255,255,0.06)"
        />
        {cfg.volSegs.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={barW} height={b.h} fill={b.color} />
        ))}

        {/* 右轴价格标签 */}
        {[
          { v: cfg.upper, label: cfg.upper.toFixed(2) },
          { v: cfg.open, label: cfg.open.toFixed(2) },
          { v: cfg.lower, label: cfg.lower.toFixed(2) },
          { v: cfg.currentPrice, label: cfg.currentPrice.toFixed(2), hi: true },
        ].map((row, i) => (
          <text
            key={i}
            x={cfg.W - cfg.pad.r + 4}
            y={cfg.yScale(row.v) + 3}
            fontSize="9"
            fill={row.hi ? (cfg.currentPrice >= cfg.open ? 'rgba(220,38,38,0.95)' : 'rgba(22,163,74,0.95)') : 'rgba(255,255,255,0.55)'}
            fontFamily="ui-monospace, monospace"
          >
            {row.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

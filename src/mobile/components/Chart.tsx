/**
 * 移动端轻量级内嵌分时/K 线图表（不引 recharts 等重库）。
 * - 主面板 + 成交量子图
 * - 涨跌停 + 开盘价参考线
 * - 自适应宽度
 * - 主题感知：所有色值从 CSS 变量读取，跟随深/浅色模式自动切换
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

  const sym = propSymbol ?? currentQuote.symbol;
  const points = sym === currentQuote.symbol ? timelineData : (timelineBySymbol[sym] ?? []);

  const stock = useGameStore((s) => s.allStocks.find((x) => x.symbol === sym));
  const stockPrices = useGameStore((s) => s.stockPrices);
  const currentPrice = sym === currentQuote.symbol ? currentQuote.price : (stockPrices[sym] ?? stock?.price ?? 0);

  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState<number>(320);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document === 'undefined') return 'dark';
    const cur = document.documentElement.getAttribute('data-theme');
    return cur === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      if (ref.current) setW(ref.current.clientWidth);
    });
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 跟随 :root[data-theme] 变化
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      const v = document.documentElement.getAttribute('data-theme');
      setTheme(v === 'light' ? 'light' : 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const palette = useMemo(() => {
    const isLight = theme === 'light';
    return {
      grid:     isLight ? 'rgba(15,17,21,0.06)' : 'rgba(255,255,255,0.05)',
      openLine: isLight ? 'rgba(15,17,21,0.32)' : 'rgba(255,255,255,0.30)',
      upper:    isLight ? 'rgba(225,29,72,0.55)' : 'rgba(255,77,79,0.55)',
      lower:    isLight ? 'rgba(5,150,105,0.55)' : 'rgba(22,199,132,0.55)',
      upperFg:  isLight ? '#9f1239' : '#ff7882',
      lowerFg:  isLight ? '#047857' : '#3dd6a6',
      labelDim: isLight ? 'rgba(15,17,21,0.55)' : 'rgba(255,255,255,0.55)',
      volLine:  isLight ? 'rgba(15,17,21,0.06)' : 'rgba(255,255,255,0.06)',
      up:       isLight ? '#e11d48' : '#ff4d4f',
      down:     isLight ? '#059669' : '#16c784',
      upTinted: isLight ? 'rgba(225,29,72,0.18)' : 'rgba(255,77,79,0.18)',
      dnTinted: isLight ? 'rgba(5,150,105,0.18)' : 'rgba(22,199,132,0.18)',
    };
  }, [theme]);

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

    const segs: { d: string; color: string }[] = [];
    for (let i = 1; i < n; i++) {
      const c0 = closes[i - 1], c1 = closes[i];
      const x0 = xScale(i - 1), y0 = yScale(c0);
      const x1 = xScale(i), y1 = yScale(c1);
      segs.push({
        d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`,
        color: c1 >= c0 ? palette.up : palette.down,
      });
    }

    const lastX = xScale(n - 1);
    const areaD = n >= 2
      ? `${segs.map((s) => s.d).join(' L ').replace(/^M /, 'M ')} L ${lastX.toFixed(1)} ${(pad.t + mainH).toFixed(1)} L ${pad.l.toFixed(1)} ${(pad.t + mainH).toFixed(1)} Z`
      : '';

    const vols: number[] = [];
    for (let i = 1; i < n; i++) vols.push(Math.abs(closes[i] - closes[i - 1]));
    const maxVol = Math.max(...vols, 1e-9);
    const barW = Math.max(2, Math.min(6, xStep * 0.7));
    const volSegs = vols.map((v, i) => {
      const x = xScale(i + 1) - barW / 2;
      const y = volTop + (1 - v / maxVol) * volH;
      const h = volTop + volH - y;
      const up = closes[i + 1] >= closes[i];
      return {
        x, y, h,
        color: up ? `${palette.up}99` : `${palette.down}99`,
      };
    });

    return {
      W, H, pad, mainH, volH, volTop,
      open, upper, lower, closes,
      segs, areaD,
      yScale, xScale, innerW, volSegs, barW,
      n, currentPrice,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, currentPrice, w, sym, palette]);

  const trendUp = cfg.closes[cfg.n - 1] >= cfg.open;
  const lastLabelColor = trendUp ? palette.up : palette.down;
  const fillColor = trendUp ? palette.upTinted : palette.dnTinted;

  return (
    <div ref={ref} className="m-chart-wrap" style={{ margin: '12px 0 0' }}>
      <svg viewBox={`0 0 ${cfg.W} ${cfg.H}`} className="m-chart-svg" preserveAspectRatio="none">
        {/* 主面板网格 */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
            y1={cfg.pad.t + p * cfg.mainH} y2={cfg.pad.t + p * cfg.mainH}
            stroke={palette.grid} strokeWidth="1"
          />
        ))}

        {/* 开盘 / 涨停 / 跌停 3 条参考线 */}
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.yScale(cfg.open)} y2={cfg.yScale(cfg.open)}
          stroke={palette.openLine} strokeDasharray="4 4" strokeWidth="0.8"
        />
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.yScale(cfg.upper)} y2={cfg.yScale(cfg.upper)}
          stroke={palette.upper} strokeDasharray="5 4" strokeWidth="1"
        />
        <text x={cfg.W - cfg.pad.r + 4} y={cfg.yScale(cfg.upper) + 3} fontSize="9" fill={palette.upperFg}>
          ↑{cfg.upper.toFixed(2)}
        </text>
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.yScale(cfg.lower)} y2={cfg.yScale(cfg.lower)}
          stroke={palette.lower} strokeDasharray="5 4" strokeWidth="1"
        />
        <text x={cfg.W - cfg.pad.r + 4} y={cfg.yScale(cfg.lower) + 3} fontSize="9" fill={palette.lowerFg}>
          ↓{cfg.lower.toFixed(2)}
        </text>

        {/* 面积 + 主曲线 */}
        {cfg.areaD && <path d={cfg.areaD} fill="url(#m-chart-fill)" />}
        <defs>
          <linearGradient id="m-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        {cfg.segs.map((s, i) => (
          <path key={i} d={s.d} stroke={s.color} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
        ))}

        {/* 成交量子图分割线 */}
        <line
          x1={cfg.pad.l} x2={cfg.W - cfg.pad.r}
          y1={cfg.volTop} y2={cfg.volTop}
          stroke={palette.volLine}
        />
        {cfg.volSegs.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={cfg.barW} height={b.h} fill={b.color} />
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
            fill={row.hi ? lastLabelColor : palette.labelDim}
            fontFamily="ui-monospace, monospace"
            fontWeight={row.hi ? 700 : 400}
          >
            {row.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
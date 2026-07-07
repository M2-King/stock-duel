import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './Dashboard.css';

export default function Dashboard() {
  const { currentQuote, klines, holdings, news, players, currentTick, timelineData } = useGameStore();

  const [period, setPeriod] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('1D');

  // Map period -> number of mock candles to use as history baseline
  const periodCount: Record<string, number> = { '1D': 0, '1W': 30, '1M': 60, '3M': 90, '1Y': 120, 'ALL': 180 };
  const mockCount = periodCount[period] ?? 0;

  // Stable mock candles seeded by symbol & period
  const mockCandles = useMemo(
    () => (mockCount > 0 ? generateMockCandles(mockCount, currentQuote.price, `${currentQuote.symbol}-${period}`) : []),
    [currentQuote.symbol, period, mockCount]
  );

  // Calculate total portfolio stats
  const totalAssets = holdings.reduce((sum, h) => sum + h.shares * h.marketPrice, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.shares * h.avgPrice, 0);
  const totalPnL = totalAssets - totalCost;
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const cash = 82292000 - totalAssets;
  const portfolioPercent = totalAssets / (cash + totalAssets) * 100;
  
  // Mock market overview data
  const indices = [
    { name: 'S&P 500', value: '5,212.34', change: '+0.12%', up: true },
    { name: 'NASDAQ', value: '16,823.17', change: '-0.78%', up: false },
    { name: 'DOW', value: '39,456.78', change: '+0.34%', up: true },
  ];
  
  const fearGreed = 62;
  
  // ============== Chart source dispatch ==============
  // 1D: intraday timeline (1 point per tick)
  // 1W+: candlesticks (real klines + mock history)
  const intradayData = useMemo(() => {
    if (timelineData.length === 0) {
      // Pre-game: synthesize an intraday trend leading to current price
      const seed = `${currentQuote.symbol}-1D-intraday`;
      let s = 0;
      for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
      const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xfffffff) / 0xfffffff; };
      const points: number[] = [];
      let price = currentQuote.price * 0.99;
      const n = 120;
      for (let i = 0; i < n; i++) {
        const noise = (rand() - 0.5) * currentQuote.price * 0.0035;
        const drift = ((currentQuote.price - price) / (n - i)) * 0.5;
        price += noise + drift;
        points.push(price);
      }
      // Anchor final point to current price
      points[points.length - 1] = currentQuote.price;
      return points;
    }
    return timelineData;
  }, [timelineData, currentQuote.price, currentQuote.symbol]);

  const candleSource = useMemo(() => {
    // 1W+: mock history + real klines tail
    return [...mockCandles, ...klines];
  }, [mockCandles, klines]);

  const candlestickData = useMemo(() => {
    return candleSource.map((k, i) => ({
      x: i,
      y: [k.open, k.close, k.low, k.high] as [number, number, number, number],
      color: k.close >= k.open ? 'var(--price-up)' : 'var(--price-down)',
    }));
  }, [candleSource]);

  const lineData = useMemo(() => {
    return candleSource.map((k, i) => ({ x: i, y: k.close }));
  }, [candleSource]);

  const isIntraday = period === '1D';
  
  return (
    <div className="dashboard">
      {/* Top Row: Chart + Market Status */}
      <div className="dashboard-row top-row">
        {/* Chart Card */}
        <div className="dashboard-card chart-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <div className="chart-symbol">QDN</div>
              <div className="chart-name">Quantum Dynamics</div>
            </div>
            <div className="chart-tags">
              <span className="badge">Tech</span>
              <span className="badge">Mid Cap</span>
            </div>
            <div className="chart-price-wrap">
              <div className={`chart-price mono ${currentQuote.change >= 0 ? 'up' : 'down'}`}>
                ${currentQuote.price.toFixed(2)}
              </div>
              <div className="chart-change-wrap">
                <span className={currentQuote.change >= 0 ? 'up mono' : 'down mono'}>
                  {currentQuote.change >= 0 ? '+' : ''}{currentQuote.change.toFixed(2)}
                </span>
                <span className="chart-change-percent">({currentQuote.changePercent >= 0 ? '+' : ''}{currentQuote.changePercent.toFixed(2)}%)</span>
              </div>
            </div>
            <div className="chart-stats">
              <div className="stat-pair">
                <span className="stat-label">High</span>
                <span className="stat-value mono">{currentQuote.high.toFixed(2)}</span>
              </div>
              <div className="stat-pair">
                <span className="stat-label">Low</span>
                <span className="stat-value mono">{currentQuote.low.toFixed(2)}</span>
              </div>
              <div className="stat-pair">
                <span className="stat-label">Vol</span>
                <span className="stat-value mono">{formatCompact(currentQuote.volume)}</span>
              </div>
              <div className="stat-pair">
                <span className="stat-label">Turn</span>
                <span className="stat-value mono">{formatCompact(currentQuote.amount)}</span>
              </div>
              <div className="stat-pair">
                <span className="stat-label">PE</span>
                <span className="stat-value mono">45.2x</span>
              </div>
            </div>
          </div>
          
          <div className="chart-toolbar">
            {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const).map((p) => (
              <button
                key={p}
                className={`chart-period ${p === period ? 'active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
          
          <div className="chart-body">
            <CandlestickChart
              data={isIntraday ? [] : candlestickData}
              lineData={isIntraday ? null : lineData}
              intradayPoints={isIntraday ? intradayData : null}
              currentPrice={currentQuote.price}
              period={period}
              currentTick={currentTick}
            />
          </div>
        </div>
        
        {/* Market Closed Card */}
        <div className="dashboard-card closed-card">
          <div className="closed-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="closed-title">Market Closed</div>
          <div className="closed-subtitle">Final Net Worth</div>
          <div className="closed-amount mono">$82,292</div>
          <button className="play-again-btn">Play Again</button>
          
          <div className="closed-stats">
            <div className="closed-stat-item">
              <div className="closed-stat-label">Performance</div>
              <div className="closed-stat-bar">
                <div className="closed-stat-fill" style={{ width: '68%' }}></div>
              </div>
            </div>
            <div className="closed-stat-item">
              <div className="closed-stat-label">Rank</div>
              <div className="closed-stat-value mono">#247</div>
            </div>
          </div>
        </div>
        
        {/* Live News Card */}
        <div className="dashboard-card news-card">
          <div className="card-header-bar">
            <span className="card-header-title">⚡ Market Terminal</span>
            <span className="card-header-action">Live Feed</span>
          </div>
          <div className="live-news-list">
            {news.map((item) => (
              <div key={item.id} className="live-news-item">
                <div className="news-meta">
                  <span className={`badge ${item.type === 'verified' ? 'badge-verified' : item.type === 'warning' ? 'badge-warning' : 'badge-unverified'}`}>
                    {item.type.toUpperCase()}
                  </span>
                  <span className="news-tick mono">Tick {item.tick}</span>
                </div>
                <p className="news-title-text">{item.title}</p>
                <div className="news-time">{item.time}</div>
              </div>
            ))}
          </div>
          <button className="view-all-btn">View All</button>
        </div>
      </div>
      
      {/* Bottom Row: Portfolio | Holdings | Trading Desk */}
      <div className="dashboard-row bottom-row">
        {/* Your Portfolio Card */}
        <div className="dashboard-card portfolio-card">
          <div className="card-header-bar">
            <span className="card-header-title">💼 Your Portfolio</span>
            <span className="card-header-action">⋯</span>
          </div>
          
          <div className="portfolio-summary">
            <div className="portfolio-line">
              <span className="portfolio-label">Total Net Worth</span>
              <span className="portfolio-value mono">$82,292</span>
            </div>
            <div className="portfolio-line">
              <span className="portfolio-label-small">Today's P&L</span>
              <div className="portfolio-stats">
                <span className="up">+$8,18<b>9</b></span>
                <span className="up">+$3,292 (4.15%)</span>
              </div>
              <span className="portfolio-stats-right">
                <span className="up">+$3,130 (2.65%)</span>
              </span>
            </div>
          </div>
          
          <div className="donut-chart">
            <DonutChart 
              data={[
                { name: 'QDN', value: 45.2, color: 'var(--text-primary)' },
                { name: 'AAPL', value: 23.1, color: 'var(--text-secondary)' },
                { name: 'TSLA', value: 15.3, color: 'var(--text-tertiary)' },
                { name: 'NVDA', value: 10.2, color: 'var(--text-muted)' },
                { name: 'CASH', value: 6.2, color: 'var(--text-disabled)' },
              ]}
            />
          </div>
          
          <div className="portfolio-legend">
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--text-primary)' }}></span>QDN <span className="legend-percent">45.2%</span></div>
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--text-secondary)' }}></span>AAPL <span className="legend-percent">23.1%</span></div>
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--text-tertiary)' }}></span>TSLA <span className="legend-percent">15.3%</span></div>
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--text-muted)' }}></span>NVDA <span className="legend-percent">10.2%</span></div>
            <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--text-disabled)' }}></span>CASH <span className="legend-percent">6.2%</span></div>
          </div>
        </div>
        
        {/* Holdings Card */}
        <div className="dashboard-card holdings-card">
          <div className="card-header-bar">
            <span className="card-header-title">🏦 Holdings</span>
            <span className="card-header-action">⋯</span>
          </div>
          
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="right">Shares</th>
                <th className="right">Avg Price</th>
                <th className="right">Market Price</th>
                <th className="right">P&L</th>
                <th className="right">P&L %</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.symbol}>
                  <td className="bold">{h.symbol}</td>
                  <td className="right mono">{h.shares}</td>
                  <td className="right mono">${h.avgPrice.toFixed(2)}</td>
                  <td className="right mono">${h.marketPrice.toFixed(2)}</td>
                  <td className={`right mono ${h.pnl >= 0 ? 'up' : 'down'}`}>
                    {h.pnl >= 0 ? '+' : ''}${h.pnl.toLocaleString()}
                  </td>
                  <td className={`right mono ${h.pnl >= 0 ? 'up' : 'down'}`}>
                    {h.pnl >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
              <tr className="cash-row">
                <td className="bold">CASH</td>
                <td className="right">—</td>
                <td className="right">—</td>
                <td className="right">—</td>
                <td className="right">—</td>
                <td className="right">—</td>
              </tr>
            </tbody>
          </table>
          
          <button className="view-all-btn">View All Holdings →</button>
        </div>
        
        {/* Trading Desk Card */}
        <div className="dashboard-card trading-card-small">
          <div className="card-header-bar">
            <span className="card-header-title">⚡ Trading Desk</span>
            <span className="card-header-action">Leverage ⓘ</span>
          </div>
          
          <div className="leverage-display">
            <div className="leverage-info">
              <div className="leverage-label">Buying Power</div>
              <div className="leverage-value mono">$82,292</div>
            </div>
            <div className="leverage-info">
              <div className="leverage-label">Unrealized P&L</div>
              <div className="leverage-value up mono">+$2,130 (2.65%)</div>
            </div>
          </div>
          
          <div className="leverage-selector">
            {[1, 2, 5, 10].map((lev) => (
              <button key={lev} className={`leverage-btn ${lev === 2 ? 'active' : ''}`}>
                {lev}x
              </button>
            ))}
          </div>
          
          <div className="order-type-selector">
            <span className="selector-label">Order Type</span>
            <div className="selector-group">
              <button className="selector-btn active">Market</button>
              <button className="selector-btn">Limit</button>
              <button className="selector-btn">Stop</button>
            </div>
          </div>
          
          <div className="shares-control">
            <span className="selector-label">Shares</span>
            <div className="shares-input-wrap">
              <span className="shares-symbol">$600</span>
              <span className="shares-value">500</span>
              <span className="shares-symbol">10</span>
              <span className="shares-symbol">100</span>
              <span className="shares-symbol">500</span>
            </div>
          </div>
          
          <div className="action-buttons">
            <button className="action-btn buy-btn">Buy QDN</button>
            <button className="action-btn sell-btn">Sell QDN</button>
          </div>
          
          <div className="insider-info">
            <div className="insider-header">
              <span className="insider-title">Insider Info</span>
              <span className="insider-cost mono">$2,000</span>
            </div>
            <p className="insider-desc">Purchase insider information with potential risks.</p>
          </div>
        </div>
      </div>
      
      {/* Third Row: Market Overview | Public News | Black Swan */}
      <div className="dashboard-row third-row">
        {/* Market Overview Card */}
        <div className="dashboard-card market-overview-card">
          <div className="card-header-bar">
            <span className="card-header-title">📊 Market Overview</span>
          </div>
          <div className="market-indices">
            {indices.map((idx) => (
              <div key={idx.name} className="market-index-item">
                <div className="index-name">{idx.name}</div>
                <div className="index-value mono">{idx.value}</div>
                <div className={`index-change mono ${idx.up ? 'up' : 'down'}`}>
                  {idx.change}
                </div>
                <Sparkline up={idx.up} />
              </div>
            ))}
            <div className="fear-greed">
              <div className="fg-header">
                <span>Fear &amp; Greed</span>
                <span className="fg-label">Index</span>
              </div>
              <GaugeCircle value={fearGreed} />
              <div className="fg-value">
                <span className="fg-number mono">{fearGreed}</span>
                <span className="fg-state">Greed</span>
              </div>
            </div>
          </div>
          <button className="view-all-btn">View More →</button>
        </div>
        
        {/* Public News Card */}
        <div className="dashboard-card public-news-card">
          <div className="card-header-bar">
            <span className="card-header-title">📰 Public News</span>
            <span className="card-header-action">View All</span>
          </div>
          <div className="news-list">
            <div className="news-item">
              <span className="verified-tag">●</span>
              <span className="news-text">QDN Quantum Dynamics reports Q2 earnings beat</span>
              <span className="news-meta">10m ago</span>
              <span className="verified-tag verified-icon">✓</span>
            </div>
            <div className="news-item">
              <span className="verified-tag">●</span>
              <span className="news-text">SEC investigating insider trading in tech sector</span>
              <span className="news-meta">25m ago</span>
              <span className="verified-tag verified-icon">✓</span>
            </div>
            <div className="news-item">
              <span className="verified-tag">●</span>
              <span className="news-text">Market maker activity spiking in small caps</span>
              <span className="news-meta">1h ago</span>
              <span className="verified-tag verified-icon">✓</span>
            </div>
            <div className="news-item">
              <span className="verified-tag">●</span>
              <span className="news-text">Global markets rally on economic optimism</span>
              <span className="news-meta">2h ago</span>
              <span className="verified-tag verified-icon">✓</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============== Helpers ============== */
function formatCompact(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}

function generateMockCandles(count: number, basePrice: number, seedKey: string = 'default') {
  // Stable seed so mock data doesn't shift on every render
  let seed = 0;
  for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xfffffff) / 0xfffffff;
  };
  const candles = [];
  // Mean-reverting random walk so the mock series stays near basePrice
  // and looks like a realistic A-share intraday trend instead of a random jump.
  let price = basePrice * 0.985; // start slightly below so the trend looks bullish
  const drift = (basePrice - price) / count;
  for (let i = 0; i < count; i++) {
    const open = price;
    const noise = (rand() - 0.5) * basePrice * 0.012; // ~±1.2% of price
    const reversion = (basePrice - price) * 0.06;     // gentle pull toward anchor
    let close = open + noise + reversion + drift;
    // Wick lengths proportional to body size but capped
    const body = Math.abs(close - open);
    const wick = body * (0.3 + rand() * 0.7) + basePrice * 0.002;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    candles.push({ timestamp: i, open, high, low, close, volume: rand() * 1000000 });
    price = close;
  }
  // Final close → basePrice so chart anchor matches live ticker
  if (candles.length) {
    const last = candles[candles.length - 1];
    const delta = basePrice - last.close;
    last.close = basePrice;
    last.high = Math.max(last.high, basePrice);
    last.low = Math.min(last.low, basePrice);
    // Smooth the last few candles toward basePrice
    for (let i = Math.max(0, candles.length - 3); i < candles.length - 1; i++) {
      candles[i].close += delta * 0.25;
    }
  }
  return candles;
}

/* ============== Candlestick / Intraday Chart ============== */
function CandlestickChart({
  data, lineData, currentPrice, period, intradayPoints, currentTick,
}: {
  data: any[]; lineData: any[] | null; currentPrice: number; period: string;
  intradayPoints: number[] | null; currentTick: number;
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

  const width = size.w;
  const height = size.h;

  if (width <= 0 || height <= 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }

  const padding = { top: 16, right: 60, bottom: 26, left: 8 };
  const innerW = Math.max(0, width - padding.left - padding.right);
  const innerH = Math.max(0, height - padding.top - padding.bottom);

  // ============== Intraday branch (固定窗口：240 个 tick = 一个完整 A 股交易日) ==============
  if (intradayPoints && intradayPoints.length > 0) {
    const WINDOW = 240; // A 股分时一交易日容量 (相当于 1 个完整交易日)
    const allPoints = intradayPoints;

    // 视角固定: 第一个点永远在 padding.left，最后一个点永远在 padding.left + innerW
    // n < WINDOW: 只画前 n 个点（点密度稀疏，右侧留空）
    // n >= WINDOW: 取最后 WINDOW 个点（老点被替换出窗口，但位置不变）
    // 槽位宽 = innerW / (WINDOW - 1) — 固定
    const points = allPoints.length >= WINDOW ? allPoints.slice(-WINDOW) : allPoints;
    const n = points.length;

    const xScale = (i: number) => padding.left + (i / (WINDOW - 1)) * innerW;

    // Y 轴：用今天价格区间动态缩放
    const open = points[0];
    const minP = Math.min(...points);
    const maxP = Math.max(...points);
    const padP = (maxP - minP) * 0.15 || maxP * 0.005;
    const minVal = minP - padP;
    const maxVal = maxP + padP;
    const range = maxVal - minVal || 1;
    const yScale = (v: number) => padding.top + (1 - (v - minVal) / range) * innerH;

    // 路径
    const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ');
    const lastDataX = xScale(n - 1);
    const areaPath = `${linePath} L ${lastDataX} ${padding.top + innerH} L ${xScale(0)} ${padding.top + innerH} Z`;

    const openY = yScale(open);
    const lastP = points[n - 1];
    const lineColor = lastP >= open ? 'var(--price-up)' : 'var(--price-down)';
    const areaGradId = lastP >= open ? 'intra-area-up' : 'intra-area-down';

    const gridLevels = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => ({
      y: padding.top + t * innerH,
      price: maxVal - t * range,
    }));

    // 当前 tick 游标 (类似分时右上角的"现在"竖线)
    const cursorX = lastDataX;

    // X 轴时间标签：按 n 的比例分布（时间跟着"线在走"的进度走）
    const timeLabels = [
      { ratio: 0, label: '09:30' },
      { ratio: 0.25, label: '11:30' },
      { ratio: 0.5, label: '13:00' },
      { ratio: 0.75, label: '14:00' },
      { ratio: 1, label: '15:00' },
    ];

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="candlestick-svg" width={width} height={height} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lastP >= open ? 'rgba(220, 38, 38, 0.18)' : 'rgba(22, 163, 74, 0.18)'} />
              <stop offset="100%" stopColor={lastP >= open ? 'rgba(220, 38, 38, 0)' : 'rgba(22, 163, 74, 0)'} />
            </linearGradient>
          </defs>

          {/* 中线 (50% 价位) 略强 */}
          {gridLevels.map((g, i) => (
            <line key={`g-${i}`} x1={padding.left} x2={width - padding.right} y1={g.y} y2={g.y}
              stroke={i === 2 ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.05)'}
              strokeWidth={i === 2 ? 1 : 1}
              strokeDasharray={i === 2 ? '0' : '0'} />
          ))}

          {/* 开盘价虚线 (跨整个窗口) */}
          <line
            x1={padding.left} x2={width - padding.right}
            y1={openY} y2={openY}
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth={0.8}
            strokeDasharray="4 4"
          />
          <text
            x={width - padding.right + 4}
            y={openY + 4}
            fill="rgba(255, 255, 255, 0.6)"
            fontSize={10}
            fontFamily="ui-monospace, monospace"
            textAnchor="start"
          >
            开盘 {open.toFixed(2)}
          </text>

          {/* 折线 + 区域 */}
          <path d={areaPath} fill={`url(#${areaGradId})`} />
          <path d={linePath} stroke={lineColor} strokeWidth={1.5} fill="none"
            strokeLinejoin="round" strokeLinecap="round" />

          {/* 当前游标 (竖线) */}
          <line
            x1={cursorX} x2={cursorX}
            y1={padding.top} y2={padding.top + innerH}
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />

          {/* 当前价 crosshair */}
          {(() => {
            const y = yScale(currentPrice);
            if (y < padding.top || y > padding.top + innerH) return null;
            return (
              <g>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y}
                  stroke={lineColor} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
                <rect x={width - padding.right} y={y - 9} width={padding.right - 4} height={18}
                  fill={lineColor} rx={2} />
                <text x={width - padding.right / 2} y={y + 4}
                  fill="#fff" fontSize={11} fontWeight={600}
                  fontFamily="ui-monospace, monospace" textAnchor="middle">
                  {currentPrice.toFixed(2)}
                </text>
              </g>
            );
          })()}

          {/* Y 轴价格刻度 */}
          {gridLevels.map((g, i) => (
            <text key={`yl-${i}`} x={width - padding.right + 4} y={g.y + 4}
              fill="rgba(255, 255, 255, 0.45)" fontSize={10}
              fontFamily="ui-monospace, monospace" textAnchor="start">
              {g.price.toFixed(2)}
            </text>
          ))}

          {/* X 轴时间刻度 (随 n 比例分布：09:30 永远在最左，15:00 永远在最右) */}
          {timeLabels.map((lbl, i) => {
            const x = padding.left + lbl.ratio * innerW;
            return (
              <text key={`xl-${i}`} x={x} y={height - 8}
                fill="rgba(255, 255, 255, 0.4)" fontSize={10}
                fontFamily="ui-monospace, monospace" textAnchor="middle">
                {lbl.label}
              </text>
            );
          })}
        </svg>
      </div>
    );
  }

  // ============== Candle branch (1W+) ==============
  const allValues = data.flatMap(d => [d.y[0], d.y[1], d.y[2], d.y[3]]);
  let minVal = Math.min(...allValues, currentPrice);
  let maxVal = Math.max(...allValues, currentPrice);
  const span = maxVal - minVal || 1;
  minVal -= span * 0.05;
  maxVal += span * 0.05;
  const range = maxVal - minVal;

  const xScale = (i: number) => padding.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yScale = (v: number) => padding.top + (1 - (v - minVal) / range) * innerH;

  const slotW = innerW / Math.max(data.length, 1);
  const candleW = Math.max(2, Math.min(slotW * 0.72, 16));

  const gridLevels = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => ({
    y: padding.top + t * innerH,
    price: maxVal - t * range,
  }));

  const currentY = yScale(currentPrice);
  const currentUp = currentPrice >= (data[0]?.y?.[0] ?? currentPrice);
  const currentColor = currentUp ? 'var(--price-up)' : 'var(--price-down)';

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="candlestick-svg" width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(96, 165, 250, 0.18)" />
            <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
          </linearGradient>
        </defs>

        {gridLevels.map((g, i) => (
          <line key={`grid-${i}`} x1={padding.left} x2={width - padding.right} y1={g.y} y2={g.y}
            stroke="rgba(255, 255, 255, 0.06)" strokeWidth={1} />
        ))}

        {lineData && lineData.length > 1 && (() => {
          const path = lineData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.x)} ${yScale(d.y)}`).join(' ');
          const area = `${path} L ${xScale(lineData.length - 1)} ${padding.top + innerH} L ${xScale(0)} ${padding.top + innerH} Z`;
          return (
            <g>
              <path d={area} fill="url(#chart-area-grad)" />
              <path d={path} stroke="rgba(96, 165, 250, 0.55)" strokeWidth={1.25} fill="none"
                strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })()}

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

        {currentPrice > 0 && currentY >= padding.top && currentY <= padding.top + innerH && (
          <g>
            <line x1={padding.left} x2={width - padding.right} y1={currentY} y2={currentY}
              stroke={currentColor} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.7} />
            <rect x={width - padding.right} y={currentY - 9} width={padding.right - 4} height={18}
              fill={currentColor} rx={2} />
            <text x={width - padding.right / 2} y={currentY + 4}
              fill="#fff" fontSize={11} fontWeight={600}
              fontFamily="ui-monospace, monospace" textAnchor="middle">
              {currentPrice.toFixed(2)}
            </text>
          </g>
        )}

        {gridLevels.map((g, i) => (
          <text key={`yl-${i}`} x={width - padding.right + 4} y={g.y + 4}
            fill="rgba(255, 255, 255, 0.45)" fontSize={10}
            fontFamily="ui-monospace, monospace" textAnchor="start">
            {g.price.toFixed(2)}
          </text>
        ))}

        {(() => {
          const labels = xAxisLabels(period, data.length);
          return labels.map((lbl, i) => {
            const xRatio = lbl.idx / Math.max(data.length - 1, 1);
            const x = padding.left + xRatio * innerW;
            return (
              <text key={`xl-${i}`} x={x} y={height - 8}
                fill="rgba(255, 255, 255, 0.4)" fontSize={10}
                fontFamily="ui-monospace, monospace" textAnchor="middle">
                {lbl.label}
              </text>
            );
          });
        })()}
      </svg>
    </div>
  );
}

function xAxisLabels(period: string, count: number) {
  const labels: { idx: number; label: string }[] = [];
  if (period === '1D') {
    const times = ['09:30', '10:30', '11:30', '13:00', '14:00', '15:00', '15:30'];
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

/* ============== Donut Chart ============== */
function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 35;
  const innerRadius = 22;
  let cumulative = 0;
  
  return (
    <svg viewBox="0 0 100 100" className="donut-svg">
      {data.map((d, i) => {
        const startAngle = (cumulative / total) * 360;
        const endAngle = ((cumulative + d.value) / total) * 360;
        cumulative += d.value;
        
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        
        const x1 = 50 + radius * Math.cos(startRad);
        const y1 = 50 + radius * Math.sin(startRad);
        const x2 = 50 + radius * Math.cos(endRad);
        const y2 = 50 + radius * Math.sin(endRad);
        
        const x3 = 50 + innerRadius * Math.cos(endRad);
        const y3 = 50 + innerRadius * Math.sin(endRad);
        const x4 = 50 + innerRadius * Math.cos(startRad);
        const y4 = 50 + innerRadius * Math.sin(startRad);
        
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;
        
        const path = [
          `M ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
          `L ${x3} ${y3}`,
          `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
          'Z',
        ].join(' ');
        
        return <path key={i} d={path} fill={d.color} />;
      })}
      <text x="50" y="46" textAnchor="middle" className="donut-text-large">100%</text>
      <text x="50" y="58" textAnchor="middle" className="donut-text-small">Allocated</text>
    </svg>
  );
}

/* ============== Sparkline ============== */
function Sparkline({ up }: { up: boolean }) {
  const points = [];
  for (let i = 0; i < 20; i++) {
    const y = up ? 50 - i * 1.5 + Math.random() * 4 : 30 + i * 1.5 - Math.random() * 4;
    points.push(`${i * 5},${Math.max(10, Math.min(90, y))}`);
  }
  
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sparkline">
      <polyline 
        points={points.join(' ')} 
        fill="none" 
        stroke={up ? 'var(--price-up)' : 'var(--price-down)'}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ============== Fear & Greed Gauge ============== */
function GaugeCircle({ value }: { value: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (value / 100) * circumference;
  
  return (
    <svg viewBox="0 0 80 80" className="gauge-svg">
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="var(--bg-hover)"
        strokeWidth="6"
      />
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
      />
    </svg>
  );
}

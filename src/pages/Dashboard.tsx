import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './Dashboard.css';

export default function Dashboard() {
  const { currentQuote, klines, holdings, news, players, currentTick } = useGameStore();

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
  
  // Build candlestick data: real klines for 1D; mock + tail real for longer periods
  const chartSource = useMemo(() => {
    if (period === '1D') {
      if (klines.length >= 5) return klines;
      // Pre-game filler: generate a tight intraday history around current price
      return generateMockCandles(30, currentQuote.price, `${currentQuote.symbol}-1D-anchor`);
    }
    // 1W+: mock history + real klines tail
    return [...mockCandles, ...klines];
  }, [period, klines, mockCandles, currentQuote.price, currentQuote.symbol]);

  const candlestickData = useMemo(() => {
    return chartSource.map((k, i) => ({
      x: i,
      y: [k.open, k.close, k.low, k.high] as [number, number, number, number],
      color: k.close >= k.open ? 'var(--price-up)' : 'var(--price-down)',
    }));
  }, [chartSource]);

  const lineData = useMemo(() => {
    return chartSource.map((k, i) => ({ x: i, y: k.close }));
  }, [chartSource]);
  
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
            <CandlestickChart data={candlestickData} lineData={lineData} />
          </div>
          
          <div className="chart-x-axis">
            <span>09:30</span>
            <span>10:30</span>
            <span>11:30</span>
            <span>12:30</span>
            <span>13:30</span>
            <span>14:30</span>
            <span>15:30</span>
            <span>16:00</span>
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
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (rand() - 0.45) * 1.5;
    const close = price + change;
    const high = Math.max(open, close) + rand() * 0.8;
    const low = Math.min(open, close) - rand() * 0.8;
    candles.push({ timestamp: i, open, high, low, close, volume: rand() * 1000000 });
    price = close;
  }
  return candles;
}

/* ============== Candlestick Chart ============== */
function CandlestickChart({ data, lineData }: { data: any[]; lineData: any[] }) {
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

  const padding = { top: 12, right: 12, bottom: 12, left: 12 };
  const width = size.w;
  const height = size.h;
  const innerW = Math.max(0, width - padding.left - padding.right);
  const innerH = Math.max(0, height - padding.top - padding.bottom);

  if (width <= 0 || height <= 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }

  const allValues = data.flatMap(d => [d.y[0], d.y[1], d.y[2], d.y[3]]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const xScale = (i: number) => padding.left + (i / Math.max(data.length - 1, 1)) * innerW;
  const yScale = (v: number) => padding.top + (1 - (v - minVal) / range) * innerH;

  const linePath = lineData.map((d, i) => {
    const x = xScale(d.x);
    const y = yScale(d.y);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const areaPath = `${linePath} L ${xScale(lineData.length - 1)} ${height - padding.bottom} L ${xScale(0)} ${height - padding.bottom} Z`;

  const candleW = Math.max(2, Math.min(14, innerW / Math.max(data.length, 1) * 0.7));

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="candlestick-svg"
        width={width}
        height={height}
      >
        <defs>
          <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.15)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#area-gradient)" />
        <path
          d={linePath}
          stroke="var(--text-primary)"
          strokeWidth={1.5}
          fill="none"
        />
        {data.map((d, i) => {
          const x = xScale(d.x);
          const isUp = d.y[1] >= d.y[0];
          const bodyTop = yScale(Math.max(d.y[0], d.y[1]));
          const bodyBottom = yScale(Math.min(d.y[0], d.y[1]));
          const wickTop = yScale(d.y[3]);
          const wickBottom = yScale(d.y[2]);
          return (
            <g key={i}>
              <line
                x1={x}
                y1={wickTop}
                x2={x}
                y2={wickBottom}
                stroke={isUp ? 'var(--price-up)' : 'var(--price-down)'}
                strokeWidth={1}
              />
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={Math.max(1, bodyBottom - bodyTop)}
                fill={isUp ? 'var(--price-up)' : 'var(--price-down)'}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
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

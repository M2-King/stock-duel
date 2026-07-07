import { useState } from 'react';
import { useGameStore, SPEED_PRESETS } from '../store/gameStore';
import MarketChart from '../components/MarketChart';
import './Dashboard.css';

export default function Dashboard() {
  const {
    currentQuote, holdings, news, currentTick,
    cash, borrowed, leverage, setLeverage, placeOrder, purchaseInsiderInfo, showToast,
    gameStatus, totalTradeCount, simulation, allStocks,
    currentDay, maxDays, maxTicksPerDay,
    totalAssets, todayPnl, todayPnlPercent, setSpeed,
    watchlist, selectSymbol, toggleWatchlist,
  } = useGameStore();

  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [shares, setShares] = useState(500);
  const [lastOrderResult, setLastOrderResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 统一读取 store 的资产/盈亏，避免各页面各自硬编码或用不同基准。
  // totalAssets = cash + Σ(持仓市值)；P&L 以 initialAssets(1亿) 为基准。
  const positionValue = holdings.reduce((sum, h) => sum + h.shares * h.marketPrice, 0);
  const totalPnL = todayPnl;
  const totalPnLPercent = todayPnlPercent;
  const currentStock = allStocks.find((s) => s.symbol === currentQuote.symbol);

  // Quick symbol switcher. selectSymbol does not toast on its own, so we toast
  // here once (early-return avoids duplicate toast when tapping the active symbol).
  const handleSelectSymbol = (symbol: string) => {
    if (symbol === currentQuote.symbol) return;
    selectSymbol(symbol);
    showToast(`已切换到 ${symbol}`, 'info');
  };
  const isWatched = watchlist.includes(currentQuote.symbol);

  // Mock market overview data
  const indices = [
    { name: 'S&P 500', value: '5,212.34', change: '+0.12%', up: true },
    { name: 'NASDAQ', value: '16,823.17', change: '-0.78%', up: false },
    { name: 'DOW', value: '39,456.78', change: '+0.34%', up: true },
  ];

  const fearGreed = 62;

  return (
    <div className="dashboard">
      {/* Top Row: Chart + Market Status */}
      <div className="dashboard-row top-row">
        {/* Chart Card */}
        <div className="dashboard-card chart-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <div className="chart-symbol">{currentQuote.symbol}</div>
              <div className="chart-name">{currentQuote.name}</div>
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
                <span className="stat-value mono">{currentStock ? currentStock.pe.toFixed(1) : '--'}x</span>
              </div>
            </div>
          </div>

          {/* Quick symbol switcher: watchlist chips + full stock dropdown */}
          <div className="symbol-bar">
            <div className="symbol-chips">
              {watchlist.map((sym) => {
                const stock = allStocks.find((s) => s.symbol === sym);
                if (!stock) return null;
                const isActive = sym === currentQuote.symbol;
                const pct = isActive ? currentQuote.changePercent : stock.changePercent;
                return (
                  <button
                    key={sym}
                    type="button"
                    className={`symbol-chip ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectSymbol(sym)}
                    title={stock.name}
                  >
                    <span className="symbol-chip-sym">{sym}</span>
                    <span className={`symbol-chip-pct ${pct >= 0 ? 'up' : 'down'}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="symbol-bar-controls">
              <select
                className="symbol-select"
                value={currentQuote.symbol}
                onChange={(e) => handleSelectSymbol(e.target.value)}
                aria-label="选择股票"
              >
                {allStocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} · {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`symbol-star ${isWatched ? 'active' : ''}`}
                onClick={() => toggleWatchlist(currentQuote.symbol)}
                title={isWatched ? '从自选移除' : '加入自选'}
              >
                {isWatched ? '★' : '☆'}
              </button>
            </div>
          </div>

          <div className="chart-body">
            <MarketChart compact />
          </div>
        </div>
        
        {/* Market Closed / Live Match Card */}
        {gameStatus === 'playing' ? (
          <div className="dashboard-card live-match-card">
            <div className="card-header-bar">
              <span className="card-header-title">⚡ Live Match</span>
              <span className="card-header-action live">
                <span className="live-dot" /> {simulation.session === 'morning' ? 'AM Session' : simulation.session === 'afternoon' ? 'PM Session' : simulation.session}
              </span>
            </div>
            <div className="live-match-row">
              <span className="live-label">Day</span>
              <span className="live-value mono">{currentDay} / {maxDays}</span>
            </div>
            <div className="live-match-row">
              <span className="live-label">Tick</span>
              <span className="live-value mono">{(simulation.session === 'afternoon' ? 60 : 0) + currentTick} / {maxTicksPerDay}</span>
            </div>
            <div className="live-match-row big">
              <span className="live-label">Total Assets</span>
              <span className="live-value mono">${totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="live-match-row big">
              <span className="live-label">P&amp;L</span>
              <span className={`live-value mono ${totalPnL >= 0 ? 'up' : 'down'}`}>
                {totalPnL >= 0 ? '+' : ''}${Math.round(totalPnL).toLocaleString()} ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
              </span>
            </div>
            <div className="live-match-row">
              <span className="live-label">Trades</span>
              <span className="live-value mono">{totalTradeCount}</span>
            </div>
            <div className="live-match-row">
              <span className="live-label">Cash</span>
              <span className="live-value mono">${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="speed-control" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                对局速度 · 一天现实时长
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SPEED_PRESETS.map((p) => {
                  const active = Math.abs(simulation.speed - p.speed) < 0.01;
                  return (
                    <button
                      key={p.label}
                      className={`speed-btn ${active ? 'active' : ''}`}
                      title={p.label}
                      onClick={() => setSpeed(p.speed)}
                      style={{
                        flex: '1 1 40%',
                        padding: '6px 0',
                        background: active ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {p.minutesPerDay ? `${p.minutesPerDay} 分钟` : '快进 ⏩'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
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
            <div className="closed-amount mono">${totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <button className="play-again-btn" onClick={() => {
              const st = useGameStore.getState();
              st.restartMatch();
              st.startMatch();
            }}>
              {gameStatus === 'settlement' ? '再来一局' : 'Play Again'}
            </button>

            <div className="closed-stats">
              <div className="closed-stat-item">
                <div className="closed-stat-label">Return</div>
                <div className={`closed-stat-value mono ${totalPnL >= 0 ? 'up' : 'down'}`}>
                  {totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
                </div>
              </div>
              <div className="closed-stat-item">
                <div className="closed-stat-label">Trades</div>
                <div className="closed-stat-value mono">{totalTradeCount}</div>
              </div>
            </div>
          </div>
        )}
        
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
              <span className="portfolio-value mono">${totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="portfolio-line">
              <span className="portfolio-label-small">Total P&L</span>
              <span className={`mono ${totalPnL >= 0 ? 'up' : 'down'}`} style={{ fontWeight: 600 }}>
                {totalPnL >= 0 ? '+' : ''}${Math.round(totalPnL).toLocaleString()} ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          <div className="donut-chart">
            <DonutChart
              data={(() => {
                const total = Math.max(1, positionValue + cash);
                const items = holdings.map((h) => ({
                  name: h.symbol,
                  value: ((h.shares * h.marketPrice) / total) * 100,
                  color: 'var(--text-primary)',
                }));
                items.push({ name: 'CASH', value: (cash / total) * 100, color: 'var(--text-muted)' });
                return items;
              })()}
            />
          </div>
          
          <div className="portfolio-legend">
            {(() => {
              const total = Math.max(1, positionValue + cash);
              const colors = ['var(--text-primary)', 'var(--text-secondary)', 'var(--text-tertiary)', 'var(--text-muted)'];
              const items = holdings.map((h, i) => ({
                name: h.symbol,
                pct: ((h.shares * h.marketPrice) / total) * 100,
                color: colors[i % colors.length],
              }));
              items.push({ name: 'CASH', pct: (cash / total) * 100, color: 'var(--text-disabled)' });
              return items.map((it) => (
                <div key={it.name} className="legend-item">
                  <span className="legend-dot" style={{ background: it.color }}></span>
                  {it.name} <span className="legend-percent">{it.pct.toFixed(1)}%</span>
                </div>
              ));
            })()}
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
              <div className="leverage-value mono">${Math.max(0, cash * leverage - borrowed).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="leverage-info">
              <div className="leverage-label">Unrealized P&L</div>
              <div className={`leverage-value mono ${totalPnL >= 0 ? 'up' : 'down'}`}>
                {totalPnL >= 0 ? '+' : ''}${Math.round(totalPnL).toLocaleString()} ({totalPnLPercent.toFixed(2)}%)
              </div>
            </div>
          </div>

          <div className="leverage-selector">
            {[1, 2, 5, 10].map((lev) => (
              <button
                key={lev}
                className={`leverage-btn ${lev === leverage ? 'active' : ''}`}
                onClick={() => { setLeverage(lev); showToast(`杠杆已切换至 ${lev}x`, 'info'); }}
              >
                {lev}x
              </button>
            ))}
          </div>

          <div className="order-type-selector">
            <span className="selector-label">Order Type</span>
            <div className="selector-group">
              {(['market', 'limit', 'stop'] as const).map((t) => (
                <button
                  key={t}
                  className={`selector-btn ${orderType === t ? 'active' : ''}`}
                  onClick={() => { setOrderType(t); showToast(`订单类型: ${t.toUpperCase()}`, 'info'); }}
                >
                  {t === 'market' ? 'Market' : t === 'limit' ? 'Limit' : 'Stop'}
                </button>
              ))}
            </div>
          </div>

          <div className="shares-control">
            <span className="selector-label">Shares</span>
            <div className="shares-input-wrap">
              <span className="shares-symbol">${(shares * currentQuote.price).toFixed(0)}</span>
              <input
                type="number"
                min={1}
                step={100}
                value={shares}
                onChange={(e) => setShares(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                className="shares-value-input mono"
                style={{ width: 80 }}
              />
              {[10, 100, 500].map((q) => (
                <button key={q} className="shares-quick" onClick={() => setShares(q)}>{q}</button>
              ))}
            </div>
          </div>

          {lastOrderResult && (
            <div
              className="order-feedback"
              style={{
                fontSize: 12,
                padding: '6px 10px',
                marginBottom: 8,
                background: lastOrderResult.ok ? 'rgba(34,197,94,0.12)' : 'rgba(220,38,38,0.12)',
                color: lastOrderResult.ok ? '#22c55e' : '#ef4444',
                border: `1px solid ${lastOrderResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(220,38,38,0.3)'}`,
                borderRadius: 6,
              }}
            >
              {lastOrderResult.msg}
            </div>
          )}

          <div className="action-buttons">
            <button
              className="action-btn buy-btn"
              onClick={() => {
                const result = placeOrder({
                  symbol: currentQuote.symbol,
                  type: orderType,
                  side: 'buy',
                  price: currentQuote.price,
                  quantity: shares,
                  status: 'filled',
                });
                setLastOrderResult({ ok: result.success, msg: result.success ? `买入 ${shares} 股 ${currentQuote.symbol} @ ¥${currentQuote.price.toFixed(2)}` : (result.error || '买入失败') });
              }}
            >
              Buy {currentQuote.symbol}
            </button>
            <button
              className="action-btn sell-btn"
              onClick={() => {
                const result = placeOrder({
                  symbol: currentQuote.symbol,
                  type: orderType,
                  side: 'sell',
                  price: currentQuote.price,
                  quantity: shares,
                  status: 'filled',
                });
                setLastOrderResult({ ok: result.success, msg: result.success ? `卖出 ${shares} 股 ${currentQuote.symbol} @ ¥${currentQuote.price.toFixed(2)}` : (result.error || '卖出失败') });
              }}
            >
              Sell {currentQuote.symbol}
            </button>
          </div>

          <div className="insider-info">
            <div className="insider-header">
              <span className="insider-title">Insider Info</span>
              <span className="insider-cost mono">$2,000</span>
            </div>
            <p className="insider-desc">Purchase insider information with potential risks.</p>
            <button
              className="insider-btn"
              disabled={cash < 2000 || gameStatus !== 'playing'}
              onClick={() => {
                const r = purchaseInsiderInfo('manual', 2000);
                if (r.success) {
                  setLastOrderResult({ ok: true, msg: `${r.trustworthy ? '真' : '假'}消息: ${r.tip}` });
                } else {
                  setLastOrderResult({ ok: false, msg: r.error || '购买失败' });
                }
              }}
            >
              {gameStatus !== 'playing' ? '非交易时段' : cash < 2000 ? '余额不足' : 'Purchase Insider Info ($2,000)'}
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            今日累计交易: <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{totalTradeCount}</span>
            {gameStatus !== 'playing' && <span style={{ color: '#fb923c', marginLeft: 8 }}>· 非交易时段</span>}
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

/* generateMockCandles moved to src/components/MarketChart.tsx */

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

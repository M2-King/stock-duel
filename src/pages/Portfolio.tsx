import { useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import './Portfolio.css';

type FilterType = 'all' | 'today' | 'winners' | 'losers';

export default function Portfolio() {
  const {
    holdings,
    cash,
    totalAssets,
    todayPnl,
    todayPnlPercent,
    unrealizedPnl,
    orderHistory,
    placeOrder,
    selectSymbol,
    setLeverage,
    leverage,
    simulation,
  } = useGameStore();

  const [filter, setFilter] = useState<FilterType>('all');

  // 统一读取 store 的 totalAssets（= cash + Σ持仓市值），P&L 以 initialAssets 为基准。
  const initialAssets = simulation.initialAssets;
  const totalPnL = totalAssets - initialAssets;
  const totalPnLPercent = initialAssets > 0 ? (totalPnL / initialAssets) * 100 : 0;
  
  const filteredHoldings = useMemo(() => {
    let result = [...holdings];
    if (filter === 'winners') result = result.filter(h => h.pnl > 0);
    if (filter === 'losers') result = result.filter(h => h.pnl < 0);
    if (filter === 'today') result = result.filter(h => h.pnl > 0);
    return result;
  }, [holdings, filter]);
  
  const handleClosePosition = (symbol: string) => {
    const holding = holdings.find(h => h.symbol === symbol);
    if (!holding) return;

    const result = placeOrder({
      symbol,
      type: 'market',
      side: 'sell',
      price: holding.marketPrice,
      quantity: holding.shares,
      status: 'filled',
    });
    if (!result.success) {
      useGameStore.getState().showToast(result.error || '平仓失败', 'warning');
    }
  };
  
  const allocationData = useMemo(() => {
    const positions = holdings.map((h, i) => ({
      name: h.symbol,
      value: h.shares * h.marketPrice,
      color: ['#ffffff', '#cccccc', '#888888', '#666666', '#444444'][i % 5]
    }));
    positions.push({ name: 'CASH', value: cash, color: '#2a2a2a' });
    return positions;
  }, [holdings, cash]);
  
  return (
    <div className="portfolio-page">
      {/* Top Summary */}
      <div className="portfolio-summary-grid">
        <div className="summary-card hero">
          <div className="summary-label">Total Net Worth</div>
          <div className="summary-hero-value mono">${(totalAssets / 10000).toFixed(0)}万</div>
          <div className="summary-meta">
            <span className={totalPnL >= 0 ? 'up' : 'down'}>
              {totalPnL >= 0 ? '+' : ''}${Math.abs(totalPnL).toLocaleString()}
            </span>
            <span className={totalPnL >= 0 ? 'up' : 'down'}>
              ({totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        
        <div className="summary-card">
          <div className="summary-label">Today's P&L</div>
          <div className={`summary-value mono ${todayPnl >= 0 ? 'up' : 'down'}`}>
            {todayPnl >= 0 ? '+' : ''}${todayPnl.toLocaleString()}
          </div>
          <div className={`summary-meta-small ${todayPnlPercent >= 0 ? 'up' : 'down'}`}>
            {todayPnlPercent >= 0 ? '+' : ''}{todayPnlPercent.toFixed(2)}%
          </div>
        </div>
        
        <div className="summary-card">
          <div className="summary-label">Unrealized P&L</div>
          <div className={`summary-value mono ${unrealizedPnl >= 0 ? 'up' : 'down'}`}>
            {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toLocaleString()}
          </div>
        </div>
        
        <div className="summary-card">
          <div className="summary-label">Available Cash</div>
          <div className="summary-value mono">${(cash / 10000).toFixed(1)}万</div>
          <div className="summary-meta-small">
            <span>Buying Power: </span>
            <span className="mono">${(cash * leverage / 10000).toFixed(1)}万</span>
          </div>
        </div>
      </div>
      
      {/* Allocation Card */}
      <div className="allocation-grid">
        <div className="portfolio-card allocation-card">
          <div className="card-header">
            <h3 className="card-title">Asset Allocation</h3>
            <span className="card-info">{holdings.length + 1} Positions</span>
          </div>
          <div className="allocation-content">
            <AllocationDonut data={allocationData} total={totalAssets} />
            <div className="allocation-list">
              {allocationData.map(item => (
                <div key={item.name} className="allocation-item">
                  <span className="allocation-dot" style={{ background: item.color }}></span>
                  <span className="allocation-name">{item.name}</span>
                  <span className="allocation-percent mono">
                    {((item.value / totalAssets) * 100).toFixed(1)}%
                  </span>
                  <span className="allocation-value mono">
                    ${(item.value / 10000).toFixed(1)}万
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="portfolio-card leverage-card">
          <div className="card-header">
            <h3 className="card-title">Leverage</h3>
            <span className="card-info">Current: {leverage}x</span>
          </div>
          <div className="leverage-content">
            <div className="leverage-options-grid">
              {[1, 2, 5, 10, 20, 50].map(l => (
                <button
                  key={l}
                  className={`leverage-option ${leverage === l ? 'active' : ''}`}
                  onClick={() => setLeverage(l)}
                >
                  {l}x
                </button>
              ))}
            </div>
            <div className="leverage-info">
              <div className="leverage-row">
                <span>Margin Used</span>
                <span className="mono">${(totalAssets - cash).toLocaleString()}</span>
              </div>
              <div className="leverage-row">
                <span>Liquidation Price</span>
                <span className="mono down">$0.00</span>
              </div>
              <div className="leverage-row">
                <span>Margin Call Price</span>
                <span className="mono">${(totalAssets * 0.7).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Holdings Table */}
      <div className="portfolio-card">
        <div className="card-header">
          <h3 className="card-title">Holdings</h3>
          <div className="filter-tabs">
            {([
              ['all', 'All'],
              ['winners', 'Winners'],
              ['losers', 'Losers'],
              ['today', 'Today'],
            ] as [FilterType, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`filter-tab ${filter === key ? 'active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="right">Shares</th>
              <th className="right">Avg Cost</th>
              <th className="right">Market Price</th>
              <th className="right">Position Value</th>
              <th className="right">P&L</th>
              <th className="right">P&L %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredHoldings.map(h => (
              <tr key={h.symbol}>
                <td>
                  <div className="stock-cell">
                    <span className="stock-symbol mono">{h.symbol}</span>
                    <span className="stock-sector">{h.sector}</span>
                  </div>
                </td>
                <td className="right mono">{h.shares}</td>
                <td className="right mono">${h.avgPrice.toFixed(2)}</td>
                <td className="right mono">${h.marketPrice.toFixed(2)}</td>
                <td className="right mono">${(h.shares * h.marketPrice).toLocaleString()}</td>
                <td className={`right mono ${h.pnl >= 0 ? 'up' : 'down'}`}>
                  {h.pnl >= 0 ? '+' : ''}${h.pnl.toLocaleString()}
                </td>
                <td className={`right mono ${h.pnl >= 0 ? 'up' : 'down'}`}>
                  {h.pnl >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%
                </td>
                <td className="action-cell">
                  <button 
                    className="action-btn-small"
                    onClick={() => selectSymbol(h.symbol)}
                  >
                    Trade
                  </button>
                  <button 
                    className="action-btn-small danger"
                    onClick={() => handleClosePosition(h.symbol)}
                  >
                    Close
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Order History */}
      <div className="portfolio-card">
        <div className="card-header">
          <h3 className="card-title">Recent Orders</h3>
          <span className="card-info">{orderHistory.length} Total</span>
        </div>
        
        <table className="orders-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Symbol</th>
              <th>Type</th>
              <th>Side</th>
              <th className="right">Price</th>
              <th className="right">Quantity</th>
              <th className="right">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orderHistory.map(o => (
              <tr key={o.id}>
                <td className="mono">{formatTime(o.timestamp)}</td>
                <td className="bold mono">{o.symbol}</td>
                <td>{o.type}</td>
                <td>
                  <span className={`side-tag ${o.side}`}>
                    {o.side.toUpperCase()}
                  </span>
                </td>
                <td className="right mono">${o.price.toFixed(2)}</td>
                <td className="right mono">{o.quantity}</td>
                <td className="right mono">${(o.price * o.quantity).toLocaleString()}</td>
                <td>
                  <span className={`status-tag status-${o.status}`}>
                    {o.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString('zh-CN', { 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function AllocationDonut({ data, total }: { data: { name: string; value: number; color: string }[]; total: number }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 75;
  const innerRadius = 50;
  let cumulative = 0;
  
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="allocation-svg">
      {data.map((d, i) => {
        const startAngle = (cumulative / total) * 360;
        const endAngle = ((cumulative + d.value) / total) * 360;
        cumulative += d.value;
        
        if (endAngle - startAngle >= 359.9) {
          return <circle key={i} cx={cx} cy={cy} r={radius} fill={d.color} />;
        }
        
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        
        const x1 = cx + radius * Math.cos(startRad);
        const y1 = cy + radius * Math.sin(startRad);
        const x2 = cx + radius * Math.cos(endRad);
        const y2 = cy + radius * Math.sin(endRad);
        const x3 = cx + innerRadius * Math.cos(endRad);
        const y3 = cy + innerRadius * Math.sin(endRad);
        const x4 = cx + innerRadius * Math.cos(startRad);
        const y4 = cy + innerRadius * Math.sin(startRad);
        
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
      <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-tertiary)" fontSize="11">Total</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-primary)" fontSize="18" fontWeight="700">
        ${(total / 10000).toFixed(0)}万
      </text>
    </svg>
  );
}

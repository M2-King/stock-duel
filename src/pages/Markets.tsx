import { useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import './Markets.css';

type SortKey = 'symbol' | 'price' | 'change' | 'changePercent' | 'volume' | 'pe';
type SortDir = 'asc' | 'desc';

function tradeSectionForRole(role: 'dealer' | 'retail' | 'regulator', gameStatus: string): 'overview' | 'tools' | 'regulator' {
  if (gameStatus !== 'playing') return 'overview';
  if (role === 'regulator') return 'regulator';
  return 'tools';
}

export default function Markets() {
  const { allStocks, indices, selectSymbol, currentQuote, setSection, showToast, role, gameStatus } = useGameStore();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  
  const sectors = useMemo(() => {
    return ['All', ...new Set(allStocks.map(s => s.sector))];
  }, [allStocks]);
  
  const filtered = useMemo(() => {
    let result = allStocks;
    if (sector !== 'All') {
      result = result.filter(s => s.sector === sector);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s => 
        s.symbol.toLowerCase().includes(q) || 
        s.name.toLowerCase().includes(q)
      );
    }
    
    return [...result].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [allStocks, sector, search, sortKey, sortDir]);
  
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };
  
  const handleSelect = (symbol: string) => {
    selectSymbol(symbol);
    const target = tradeSectionForRole(role, gameStatus);
    setSection(target);
    showToast(`已切换到 ${symbol}`, 'success');
  };
  
  const SortIndicator = ({ k }: { k: SortKey }) => (
    <span className="sort-indicator">
      {sortKey === k && (sortDir === 'asc' ? '↑' : '↓')}
    </span>
  );
  
  return (
    <div className="markets-page">
      {/* Indices Bar */}
      <div className="indices-bar">
        {indices.map(idx => (
          <div key={idx.name} className="index-item">
            <span className="index-name">{idx.name}</span>
            <span className="index-value mono">{idx.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`index-change mono ${idx.change >= 0 ? 'up' : 'down'}`}>
              {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
      
      {/* Filters */}
      <div className="markets-toolbar">
        <div className="search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search by symbol or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="sector-filters">
          {sectors.map(s => (
            <button
              key={s}
              className={`sector-btn ${sector === s ? 'active' : ''}`}
              onClick={() => setSector(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      
      {/* Stocks Table */}
      <div className="stocks-table-wrap">
        <table className="stocks-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('symbol')} className="cursor-pointer">
                Symbol <SortIndicator k="symbol" />
              </th>
              <th>Name</th>
              <th>Sector</th>
              <th onClick={() => handleSort('price')} className="cursor-pointer right">
                Price <SortIndicator k="price" />
              </th>
              <th onClick={() => handleSort('change')} className="cursor-pointer right">
                Change <SortIndicator k="change" />
              </th>
              <th onClick={() => handleSort('changePercent')} className="cursor-pointer right">
                Change % <SortIndicator k="changePercent" />
              </th>
              <th onClick={() => handleSort('volume')} className="cursor-pointer right">
                Volume <SortIndicator k="volume" />
              </th>
              <th>Market Cap</th>
              <th onClick={() => handleSort('pe')} className="cursor-pointer right">
                P/E <SortIndicator k="pe" />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(stock => (
              <tr 
                key={stock.symbol} 
                className={`stock-row ${currentQuote.symbol === stock.symbol ? 'selected' : ''}`}
                onClick={() => handleSelect(stock.symbol)}
              >
                <td className="symbol-cell">
                  <span className="stock-symbol-text">{stock.symbol}</span>
                  <Sparkline up={stock.changePercent >= 0} />
                </td>
                <td className="name-cell">{stock.name}</td>
                <td className="sector-cell">
                  <span className="sector-badge">{stock.sector}</span>
                </td>
                <td className="right mono">${stock.price.toFixed(2)}</td>
                <td className={`right mono ${stock.change >= 0 ? 'up' : 'down'}`}>
                  {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                </td>
                <td className={`right mono ${stock.changePercent >= 0 ? 'up' : 'down'}`}>
                  {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                </td>
                <td className="right mono">{formatVolume(stock.volume)}</td>
                <td className="mono">{stock.marketCap}</td>
                <td className="right mono">{stock.pe.toFixed(1)}</td>
                <td className="action-cell">
                  <button className="view-btn">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filtered.length === 0 && (
          <div className="no-results">
            <p>No stocks match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatVolume(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}

function Sparkline({ up }: { up: boolean }) {
  const points = [];
  for (let i = 0; i < 15; i++) {
    const y = up ? 30 - i * 1.5 + Math.random() * 3 : 20 + i * 1.5 - Math.random() * 3;
    points.push(`${i * 5},${Math.max(8, Math.min(42, y))}`);
  }
  
  return (
    <svg viewBox="0 0 70 50" className="stock-sparkline">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={up ? 'var(--price-up)' : 'var(--price-down)'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

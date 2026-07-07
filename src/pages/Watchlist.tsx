import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './Watchlist.css';

export default function Watchlist() {
  const { allStocks, watchlist, toggleWatchlist, selectSymbol, currentQuote } = useGameStore();
  const [addingNew, setAddingNew] = useState(false);
  const [search, setSearch] = useState('');
  
  const watchlistStocks = allStocks.filter(s => watchlist.includes(s.symbol));
  
  const availableStocks = allStocks.filter(s => 
    !watchlist.includes(s.symbol) && 
    (s.symbol.toLowerCase().includes(search.toLowerCase()) || 
     s.name.toLowerCase().includes(search.toLowerCase()))
  );
  
  const handleSelect = (symbol: string) => {
    selectSymbol(symbol);
  };
  
  const totalValue = watchlistStocks.reduce((sum, s) => {
    if (s.symbol === currentQuote.symbol) sum += s.price * (currentQuote.volume / 100);
    return sum;
  }, 0);
  
  const winners = watchlistStocks.filter(s => s.changePercent > 0).length;
  const losers = watchlistStocks.filter(s => s.changePercent < 0).length;
  
  return (
    <div className="watchlist-page">
      {/* Summary */}
      <div className="watchlist-summary">
        <div className="summary-item">
          <span className="summary-num">{watchlist.length}</span>
          <span className="summary-label">Watched</span>
        </div>
        <div className="divider-vertical"></div>
        <div className="summary-item">
          <span className="summary-num up">{winners}</span>
          <span className="summary-label">Up</span>
        </div>
        <div className="summary-item">
          <span className="summary-num down">{losers}</span>
          <span className="summary-label">Down</span>
        </div>
        <div className="divider-vertical"></div>
        <button 
          className="add-watchlist-btn"
          onClick={() => setAddingNew(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Stock
        </button>
      </div>
      
      {/* Add Modal */}
      {addingNew && (
        <div className="modal-overlay" onClick={() => setAddingNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add to Watchlist</h3>
              <button className="modal-close" onClick={() => setAddingNew(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="Search stocks..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="modal-search"
                autoFocus
              />
              <div className="search-results">
                {availableStocks.map(s => (
                  <button
                    key={s.symbol}
                    className="search-result-item"
                    onClick={() => {
                      toggleWatchlist(s.symbol);
                      setAddingNew(false);
                      setSearch('');
                    }}
                  >
                    <div className="result-info">
                      <span className="result-symbol mono">{s.symbol}</span>
                      <span className="result-name">{s.name}</span>
                    </div>
                    <span className={`result-change mono ${s.changePercent >= 0 ? 'up' : 'down'}`}>
                      {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                    </span>
                  </button>
                ))}
                {availableStocks.length === 0 && (
                  <div className="no-results">No stocks found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {watchlistStocks.length === 0 ? (
        <div className="empty-watchlist">
          <div className="empty-icon">★</div>
          <h3 className="empty-title">Your watchlist is empty</h3>
          <p>Add stocks to track them in real-time</p>
          <button className="btn-primary" onClick={() => setAddingNew(true)}>Add Your First Stock</button>
        </div>
      ) : (
        <div className="watchlist-grid">
          {watchlistStocks.map(stock => {
            const isUp = stock.changePercent >= 0;
            return (
              <div 
                key={stock.symbol} 
                className={`watch-card ${currentQuote.symbol === stock.symbol ? 'active' : ''}`}
                onClick={() => handleSelect(stock.symbol)}
              >
                <div className="watch-card-header">
                  <div className="stock-info">
                    <span className="stock-symbol">{stock.symbol}</span>
                    <span className="stock-name">{stock.name}</span>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWatchlist(stock.symbol);
                    }}
                    aria-label="Remove from watchlist"
                  >
                    ×
                  </button>
                </div>
                
                <div className="watch-card-price">
                  <span className="price-value mono">${stock.price.toFixed(2)}</span>
                  <span className={`price-change mono ${isUp ? 'up' : 'down'}`}>
                    {isUp ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
                  </span>
                </div>
                
                <div className="watch-card-chart">
                  <MiniSparkline up={isUp} />
                </div>
                
                <div className="watch-card-footer">
                  <div className="footer-item">
                    <span className="footer-label">Vol</span>
                    <span className="footer-value mono">{formatVolume(stock.volume)}</span>
                  </div>
                  <div className="footer-item">
                    <span className="footer-label">P/E</span>
                    <span className="footer-value mono">{stock.pe.toFixed(1)}</span>
                  </div>
                  <div className="footer-item">
                    <span className="footer-label">Cap</span>
                    <span className="footer-value mono">{stock.marketCap}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatVolume(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}

function MiniSparkline({ up }: { up: boolean }) {
  const points: string[] = [];
  let last = 50;
  for (let i = 0; i < 30; i++) {
    last += (Math.random() - (up ? 0.45 : 0.55)) * 12;
    last = Math.max(10, Math.min(90, last));
    points.push(`${i * 3.5},${last}`);
  }
  
  return (
    <svg viewBox="0 0 105 100" preserveAspectRatio="none" className="mini-sparkline">
      <defs>
        <linearGradient id={`mini-grad-${up ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? 'rgba(22, 163, 74, 0.2)' : 'rgba(220, 38, 38, 0.2)'} />
          <stop offset="100%" stopColor={up ? 'rgba(22, 163, 74, 0)' : 'rgba(220, 38, 38, 0)'} />
        </linearGradient>
      </defs>
      <path
        d={`M ${points.join(' L ')} L 105 100 L 0 100 Z`}
        fill={`url(#mini-grad-${up ? 'up' : 'down'})`}
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={up ? 'var(--color-success)' : 'var(--color-danger)'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

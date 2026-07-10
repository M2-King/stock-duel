import { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCashBalance } from '../hooks/useCashBalance';
import MarketChart from '../components/MarketChart';
import { formatWan } from '../shared/tradeLimits';
import { formatDealerCost } from '../shared/dealerFormulas';
import './TradePanel.css';

export default function TradePanel() {
  const currentQuote = useGameStore((s) => s.currentQuote);
  const orderBook = useGameStore((s) => s.orderBook);
  const holdings = useGameStore((s) => s.holdings);
  // 资金单一来源 — useCashBalance 保证 cash/borrowed/leverage 永远和 Tools 页 / DealerPanel 同步
  const { cash, leverage, buyingPower } = useCashBalance();
  const setLeverage = useGameStore((s) => s.setLeverage);
  const placeOrder = useGameStore((s) => s.placeOrder);
  const purchaseInsiderInfo = useGameStore((s) => s.purchaseInsiderInfo);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const unrealizedPnl = useGameStore((s) => s.unrealizedPnl);
  const allStocks = useGameStore((s) => s.allStocks);
  const watchlist = useGameStore((s) => s.watchlist);
  const selectSymbol = useGameStore((s) => s.selectSymbol);
  const toggleWatchlist = useGameStore((s) => s.toggleWatchlist);
  const showToast = useGameStore((s) => s.showToast);
  const getStockRestriction = useGameStore((s) => s.getStockRestriction);
  const positionCost = holdings.reduce((s, h) => s + h.avgPrice * h.shares, 0);
  const unrealizedPct = positionCost > 0 ? (unrealizedPnl / positionCost) * 100 : 0;
  const [side] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState('market');
  const [quantity, setQuantity] = useState(500);
  const [limitPrice, setLimitPrice] = useState(currentQuote.price);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [insiderFeedback, setInsiderFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const orderPrice = orderType === 'market' ? currentQuote.price : limitPrice;
  const restriction = getStockRestriction(currentQuote.symbol);
  const maxRestrictedAmount = restriction?.maxSingle ?? Infinity;
  const orderAmount = orderPrice * quantity;
  const overRestriction = restriction && orderAmount > maxRestrictedAmount;

  const maxBuyQty = useMemo(() => {
    const byCash = Math.floor(buyingPower / orderPrice);
    if (!restriction) return byCash;
    const byRestriction = Math.floor(restriction.maxSingle / orderPrice);
    return Math.min(byCash, byRestriction);
  }, [buyingPower, orderPrice, restriction]);

  useEffect(() => {
    setLimitPrice(currentQuote.price);
    setQuantity(500);
  }, [currentQuote.symbol]);

  const flashFeedback = (kind: 'success' | 'error', msg: string) => {
    setFeedback({ kind, msg });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleBuy = () => {
    const result = placeOrder({
      symbol: currentQuote.symbol,
      type: orderType as 'market' | 'limit' | 'stop',
      side: 'buy',
      price: orderPrice,
      quantity,
      status: 'filled',
    });
    if (result.success) {
      flashFeedback('success', `买入 ${quantity} 股 ${currentQuote.symbol} @ ¥${orderPrice.toFixed(2)}`);
    } else {
      flashFeedback('error', result.error || '买入失败');
    }
  };

  const handleSell = () => {
    const result = placeOrder({
      symbol: currentQuote.symbol,
      type: orderType as 'market' | 'limit' | 'stop',
      side: 'sell',
      price: orderPrice,
      quantity,
      status: 'filled',
    });
    if (result.success) {
      flashFeedback('success', `卖出 ${quantity} 股 ${currentQuote.symbol} @ ¥${orderPrice.toFixed(2)}`);
    } else {
      flashFeedback('error', result.error || '卖出失败');
    }
  };

  // selectSymbol does not toast on its own, so we add feedback here (no duplicate).
  const handleSelectSymbol = (symbol: string) => {
    if (symbol === currentQuote.symbol) return;
    selectSymbol(symbol);
    showToast(`已切换到 ${symbol}`, 'info');
  };

  const isWatched = watchlist.includes(currentQuote.symbol);

  return (
    <div className="trade-panel">
      {/* Quick symbol switcher: watchlist chips + full stock dropdown */}
      <div className="symbol-bar">
        <div className="symbol-chips">
          {watchlist.map(sym => {
            const stock = allStocks.find(s => s.symbol === sym);
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
            onChange={e => handleSelectSymbol(e.target.value)}
            aria-label="选择股票"
          >
            {allStocks.map(s => (
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
      <div className="trade-content">
        {/* Order Book */}
        <div className="orderbook-panel">
          <div className="panel-title">Order Book</div>
          <table className="orderbook-table">
            <thead>
              <tr>
                <th>Price</th>
                <th className="right">Size</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...orderBook.asks].slice(0, 8).reverse().map((ask, i) => (
                <tr key={i} className="ask-row">
                  <td className="ask mono">{ask.price.toFixed(2)}</td>
                  <td className="right mono">{ask.quantity.toLocaleString()}</td>
                  <td className="right mono">{ask.orders}</td>
                </tr>
              ))}
              <tr className="current-price-row">
                <td colSpan={3} className="center mono">{currentQuote.price.toFixed(2)}</td>
              </tr>
              {orderBook.bids.slice(0, 8).map((bid, i) => (
                <tr key={i} className="bid-row">
                  <td className="bid mono">{bid.price.toFixed(2)}</td>
                  <td className="right mono">{bid.quantity.toLocaleString()}</td>
                  <td className="right mono">{bid.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Chart - shared MarketChart (candles + indicators) */}
        <div className="chart-panel">
          <MarketChart />
        </div>

        {/* Trading Desk */}
        <div className="trading-panel">
          <div className="panel-title">Trading Desk</div>
          
          <div className="balance-block">
            <div>
              <div className="balance-label">Available Cash</div>
              <div className="balance-value mono">{formatDealerCost(cash)}</div>
            </div>
            <div>
              <div className="balance-label">Buying Power</div>
              <div className="balance-value mono">¥{buyingPower.toLocaleString()}</div>
            </div>
            <div>
              <div className="balance-label">Unrealized P&L</div>
              <div className={`balance-value mono ${unrealizedPnl >= 0 ? 'up' : 'down'}`}>
                {unrealizedPnl >= 0 ? '+' : ''}${Math.round(unrealizedPnl).toLocaleString()} ({unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(2)}%)
              </div>
            </div>
          </div>

          <div className="leverage-tabs">
            {[1, 2, 5, 10].map(l => (
              <button 
                key={l} 
                className={`leverage-tab ${l === leverage ? 'active' : ''}`}
                onClick={() => setLeverage(l)}
              >
                {l}x
              </button>
            ))}
          </div>

          <div className="order-type-tabs">
            <span className="block-label">Order Type</span>
            <div className="order-type-options">
              {['Market', 'Limit', 'Stop'].map(t => (
                <button key={t} className={`order-type ${t.toLowerCase() === orderType ? 'active' : ''}`} 
                  onClick={() => setOrderType(t.toLowerCase())}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="shares-block">
            <span className="block-label">Shares</span>
            {restriction && (
              <div className="restriction-notice">
                监管限制：单笔上限 {formatWan(restriction.maxSingle)}，最多 {maxBuyQty.toLocaleString()} 股
              </div>
            )}
            <div className="shares-options">
              {[0.25, 0.5, 0.75, 1].map(p => (
                <button key={p} className="share-opt" onClick={() => {
                  const maxQ = side === 'buy' ? maxBuyQty : (holdings.find(h => h.symbol === currentQuote.symbol)?.shares ?? 0);
                  setQuantity(Math.max(1, Math.floor(maxQ * p)));
                }}>
                  {Math.round(p * 100)}%
                </button>
              ))}
              <button className="share-opt" onClick={() => {
                const maxQ = side === 'buy' ? maxBuyQty : (holdings.find(h => h.symbol === currentQuote.symbol)?.shares ?? 0);
                setQuantity(Math.max(1, maxQ));
              }}>MAX</button>
            </div>
            <div className="shares-input-row">
              <input
                type="number"
                className={`shares-input ${overRestriction ? 'over-limit' : ''}`}
                value={quantity}
                min={1}
                max={side === 'buy' ? maxBuyQty : undefined}
                onChange={e => {
                  let v = Math.max(1, Number(e.target.value) || 0);
                  if (side === 'buy' && restriction) v = Math.min(v, maxBuyQty);
                  setQuantity(v);
                }}
              />
              <span className="shares-suffix">股</span>
            </div>
          </div>

          {feedback && (
            <div className={`order-feedback ${feedback.kind}`}>
              {feedback.msg}
            </div>
          )}

          <div className="order-buttons">
            <button
              type="button"
              className={`order-btn buy ${side === 'buy' ? 'selected' : ''}`}
              onClick={handleBuy}
            >
              Buy {currentQuote.symbol}
            </button>
            <button
              type="button"
              className={`order-btn sell ${side === 'sell' ? 'selected' : ''}`}
              onClick={handleSell}
            >
              Sell {currentQuote.symbol}
            </button>
          </div>

          <div className="insider-block">
            <div className="insider-header">
              <span className="insider-title">Insider Info</span>
              <span className="insider-cost mono">$2,000</span>
            </div>
            <p className="insider-text">Purchase insider information with potential risks.</p>
            {insiderFeedback && (
              <div
                className={`order-feedback ${insiderFeedback.kind}`}
                style={{
                  marginTop: 8,
                  marginBottom: 8,
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: insiderFeedback.kind === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(220,38,38,0.12)',
                  color: insiderFeedback.kind === 'success' ? '#22c55e' : '#ef4444',
                  border: `1px solid ${insiderFeedback.kind === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(220,38,38,0.3)'}`,
                }}
              >
                {insiderFeedback.msg}
              </div>
            )}
            <button
              type="button"
              className="order-btn insider-btn"
              disabled={cash < 2000 || gameStatus !== 'playing'}
              onClick={() => {
                const r = purchaseInsiderInfo('manual', 2000);
                if (r.success) {
                  setInsiderFeedback({
                    kind: r.trustworthy ? 'success' : 'error',
                    msg: `${r.trustworthy ? '✅ 真消息' : '⚠️ 假消息'}: ${r.tip}`,
                  });
                } else {
                  setInsiderFeedback({ kind: 'error', msg: r.error || '购买失败' });
                }
                setTimeout(() => setInsiderFeedback(null), 4000);
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: cash < 2000 || gameStatus !== 'playing' ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
                color: cash < 2000 || gameStatus !== 'playing' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                marginTop: 8,
              }}
            >
              {gameStatus !== 'playing'
                ? '非交易时段'
                : cash < 2000
                  ? '余额不足'
                  : 'Purchase Insider Info ($2,000)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

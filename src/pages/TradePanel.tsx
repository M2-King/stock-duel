import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './TradePanel.css';

export default function TradePanel() {
  const { currentQuote, orderBook, holdings, indicators, cash: playerCash, leverage, setLeverage, placeOrder, addNews } = useGameStore();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState('market');
  const [quantity, setQuantity] = useState(500);
  const [price, setPrice] = useState(currentQuote.price);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  // Chart data
  const candleData = generateCandles(60, currentQuote.price);

  const flashFeedback = (kind: 'success' | 'error', msg: string) => {
    setFeedback({ kind, msg });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleBuy = () => {
    const result = placeOrder({
      symbol: currentQuote.symbol,
      type: orderType as 'market' | 'limit' | 'stop',
      side: 'buy',
      price,
      quantity,
      status: 'filled',
    });
    if (result.success) {
      flashFeedback('success', `买入 ${quantity} 股 ${currentQuote.symbol} @ ¥${price.toFixed(2)}`);
    } else {
      flashFeedback('error', result.error || '买入失败');
    }
  };

  const handleSell = () => {
    const result = placeOrder({
      symbol: currentQuote.symbol,
      type: orderType as 'market' | 'limit' | 'stop',
      side: 'sell',
      price,
      quantity,
      status: 'filled',
    });
    if (result.success) {
      flashFeedback('success', `卖出 ${quantity} 股 ${currentQuote.symbol} @ ¥${price.toFixed(2)}`);
    } else {
      flashFeedback('error', result.error || '卖出失败');
    }
  };

  const setSharePct = (pct: number) => {
    if (side === 'buy') {
      const maxAffordable = Math.floor(playerCash / price);
      setQuantity(Math.floor(maxAffordable * pct));
    } else {
      const holding = holdings.find(h => h.symbol === currentQuote.symbol);
      const have = holding?.shares ?? 0;
      setQuantity(Math.floor(have * pct));
    }
  };

  return (
    <div className="trade-panel">
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

        {/* Chart */}
        <div className="chart-panel">
          <div className="chart-toolbar">
            <div className="chart-symbol-info">
              <span className="chart-symbol">{currentQuote.symbol}</span>
              <span className="chart-price-info mono">
                <span className={currentQuote.change >= 0 ? 'up' : 'down'}>${currentQuote.price.toFixed(2)}</span>
                <span className={currentQuote.change >= 0 ? 'up' : 'down'}>
                  ({currentQuote.change >= 0 ? '+' : ''}{currentQuote.changePercent.toFixed(2)}%)
                </span>
              </span>
            </div>
            <div className="chart-periods">
              {['1m', '5m', '15m', '1H', '4H', '1D'].map(p => (
                <button key={p} className={`chart-period ${p === '1m' ? 'active' : ''}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <CandlestickChart data={candleData} />
          <div className="chart-indicators">
            <span className="ind-tag">MA5 <span className="mono">{indicators.ma5.toFixed(2)}</span></span>
            <span className="ind-tag">MA10 <span className="mono">{indicators.ma10.toFixed(2)}</span></span>
            <span className="ind-tag">MA20 <span className="mono">{indicators.ma20.toFixed(2)}</span></span>
            <span className="ind-tag">RSI <span className="mono">{indicators.rsi.toFixed(1)}</span></span>
            <span className="ind-tag">BOLL U <span className="mono">{indicators.boll.upper.toFixed(2)}</span></span>
          </div>
        </div>

        {/* Trading Desk */}
        <div className="trading-panel">
          <div className="panel-title">Trading Desk</div>
          
          <div className="balance-block">
            <div>
              <div className="balance-label">Buying Power</div>
              <div className="balance-value mono">${(playerCash * leverage).toLocaleString()}</div>
            </div>
            <div>
              <div className="balance-label">Unrealized P&L</div>
              <div className="balance-value up mono">+$2,130 (2.65%)</div>
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
            <div className="shares-options">
              {[0.25, 0.5, 0.75, 1].map(p => (
                <button key={p} className="share-opt" onClick={() => setSharePct(p)}>
                  {Math.round(p * 100)}%
                </button>
              ))}
              <button className="share-opt" onClick={() => setSharePct(1)}>MAX</button>
            </div>
            <div className="shares-input-row">
              <input
                type="number"
                className="shares-input"
                value={quantity}
                min={1}
                onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 0))}
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
          </div>
        </div>
      </div>
    </div>
  );
}

function generateCandles(count: number, basePrice: number) {
  const candles = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.45) * 1.5;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.6;
    const low = Math.min(open, close) - Math.random() * 0.6;
    candles.push({ open, high, low, close, x: i });
    price = close;
  }
  return candles;
}

function CandlestickChart({ data }: { data: any[] }) {
  const min = Math.min(...data.map(d => d.low));
  const max = Math.max(...data.map(d => d.high));
  const range = max - min || 1;
  
  return (
    <div className="candlestick-container">
      <svg viewBox="0 0 600 320" preserveAspectRatio="none" className="candlestick-svg">
        <defs>
          <linearGradient id="trade-area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.08)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </linearGradient>
        </defs>
        
        {/* Grid */}
        {[...Array(5)].map((_, i) => (
          <line 
            key={i} 
            x1="0" 
            y1={(i + 1) * 64} 
            x2="600" 
            y2={(i + 1) * 64} 
            stroke="rgba(255, 255, 255, 0.04)" 
            strokeWidth="0.5"
          />
        ))}
        
        {/* Candles */}
        {data.map((c, i) => {
          const isUp = c.close >= c.open;
          const x = (i / data.length) * 600 + 5;
          const w = (600 / data.length) * 0.6;
          
          const yHigh = 320 - ((c.high - min) / range) * 300 - 10;
          const yLow = 320 - ((c.low - min) / range) * 300 - 10;
          const yOpen = 320 - ((c.open - min) / range) * 300 - 10;
          const yClose = 320 - ((c.close - min) / range) * 300 - 10;
          
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.abs(yClose - yOpen) || 1;
          
          return (
            <g key={i}>
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={isUp ? 'var(--price-up)' : 'var(--price-down)'} strokeWidth="1" />
              <rect 
                x={x - w / 2} 
                y={bodyTop} 
                width={w} 
                height={bodyHeight} 
                fill={isUp ? 'var(--price-up)' : 'var(--price-down)'}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

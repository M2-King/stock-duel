import { useState, useMemo, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import './RetailPanel.css';

export default function RetailPanel() {
  const { currentQuote, klines, orderBook, indicators, playerCash } = useGameStore();
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderPrice, setOrderPrice] = useState(currentQuote.price);
  const [orderQuantity, setOrderQuantity] = useState(100);

  useEffect(() => {
    setOrderPrice(currentQuote.price);
  }, [currentQuote.price]);

  const formatNumber = (num: number) => {
    if (num >= 100000000) return (num / 100000000).toFixed(2) + '亿';
    if (num >= 10000) return (num / 10000).toFixed(2) + '万';
    return num.toFixed(0);
  };

  const formatVolume = (num: number) => {
    if (num >= 100000000) return (num / 100000000).toFixed(2) + '亿';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString();
  };

  const totalAmount = orderPrice * orderQuantity;
  const commission = totalAmount * 0.0003;
  const availableCash = orderSide === 'buy' ? playerCash : (currentQuote.price * 10000);

  const handleSubmitOrder = () => {
    console.log('Submit order:', { side: orderSide, price: orderPrice, quantity: orderQuantity });
  };

  return (
    <div className="retail-panel">
      {/* Top Header */}
      <div className="panel-header">
        <div className="header-left">
          <span className="stock-symbol">{currentQuote.symbol}</span>
          <span className="stock-name">{currentQuote.name}</span>
        </div>
        <div className="header-center">
          <div className="current-price-wrap">
            <span className={`current-price ${currentQuote.change >= 0 ? 'up' : 'down'}`}>
              {currentQuote.price.toFixed(2)}
            </span>
            <span className={`price-change ${currentQuote.change >= 0 ? 'up' : 'down'}`}>
              {currentQuote.change >= 0 ? '+' : ''}{currentQuote.change.toFixed(2)} ({currentQuote.changePercent >= 0 ? '+' : ''}{currentQuote.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="header-right">
          <span className="date-info">2026-07-06</span>
          <span className="time-info">14:30:25</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="panel-content">
        {/* Left: Order Book */}
        <div className="orderbook-section">
          <div className="section-title-bar">
            <span className="section-title">五档盘口</span>
          </div>
          
          <div className="orderbook-header">
            <span>价格</span>
            <span>数量</span>
            <span>委托</span>
          </div>
          
          <div className="orderbook-content">
            <div className="asks-list">
              {orderBook.asks.slice(0, 5).map((ask, i) => (
                <div key={`ask-${i}`} className="orderbook-row ask">
                  <div className="row-bar" style={{ width: `${Math.min((ask.quantity / 100000) * 100, 100)}%` }}></div>
                  <span className="row-price">{ask.price.toFixed(2)}</span>
                  <span className="row-quantity">{formatVolume(ask.quantity)}</span>
                  <span className="row-orders">{ask.orders}</span>
                </div>
              ))}
            </div>
            
            <div className="spread-row">
              <span className="spread-value">{currentQuote.price.toFixed(2)}</span>
            </div>
            
            <div className="bids-list">
              {orderBook.bids.slice(0, 5).map((bid, i) => (
                <div key={`bid-${i}`} className="orderbook-row bid">
                  <div className="row-bar" style={{ width: `${Math.min((bid.quantity / 100000) * 100, 100)}%` }}></div>
                  <span className="row-price">{bid.price.toFixed(2)}</span>
                  <span className="row-quantity">{formatVolume(bid.quantity)}</span>
                  <span className="row-orders">{bid.orders}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: K-Line Chart */}
        <div className="chart-section">
          <div className="chart-container">
            {/* Simple K-Line visualization */}
            <div className="kline-chart">
              <div className="chart-y-axis">
                <span>12.80</span>
                <span>12.70</span>
                <span>12.60</span>
                <span>12.50</span>
                <span>12.40</span>
                <span>12.30</span>
              </div>
              <div className="chart-area">
                {klines.slice(-50).map((k, i) => {
                  const isUp = k.close >= k.open;
                  const height = Math.abs(k.close - k.open) / (k.high - k.low + 0.001) * 100;
                  const top = ((12.80 - k.high) / (12.80 - 12.30)) * 100;
                  return (
                    <div 
                      key={i} 
                      className={`candle ${isUp ? 'up' : 'down'}`}
                      style={{
                        left: `${(i / 50) * 100}%`,
                        height: `${Math.max(height, 2)}%`,
                        top: `${top}%`,
                      }}
                    >
                      <div 
                        className="wick"
                        style={{ 
                          height: `${((k.high - k.low) / (12.80 - 12.30)) * 100}%`,
                          top: '0',
                        }}
                      ></div>
                    </div>
                  );
                })}
                {/* MA Lines would be drawn here */}
              </div>
              <div className="chart-x-axis">
                <span>09:30</span>
                <span>10:00</span>
                <span>10:30</span>
                <span>11:00</span>
                <span>11:30</span>
                <span>14:00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Trading Panel */}
        <div className="trading-section">
          <div className="trading-card">
            <div className="balance-display">
              <span className="balance-label">资金余额(元)</span>
              <span className="balance-value">{formatNumber(playerCash)}</span>
            </div>

            <div className="order-tabs">
              <button 
                className={`order-tab buy ${orderSide === 'buy' ? 'active' : ''}`}
                onClick={() => setOrderSide('buy')}
              >
                买入
              </button>
              <button 
                className={`order-tab sell ${orderSide === 'sell' ? 'active' : ''}`}
                onClick={() => setOrderSide('sell')}
              >
                卖出
              </button>
            </div>

            <div className="order-form">
              <div className="form-group">
                <label>限价买入</label>
              </div>
              
              <div className="form-row price-row">
                <span className="input-label">价格</span>
                <div className="input-wrapper">
                  <input
                    type="number"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(Number(e.target.value))}
                    step="0.01"
                  />
                  <span className="input-suffix">元</span>
                </div>
              </div>
              
              <div className="form-row">
                <span className="input-label">数量</span>
                <div className="input-wrapper">
                  <input
                    type="number"
                    value={orderQuantity}
                    onChange={(e) => setOrderQuantity(Number(e.target.value))}
                    min="100"
                    step="100"
                  />
                  <span className="input-suffix">股</span>
                </div>
              </div>

              <div className="quick-btns">
                {[100, 500, 1000, 2000, 5000].map(q => (
                  <button 
                    key={q}
                    className={`qty-btn ${orderQuantity === q ? 'active' : ''}`}
                    onClick={() => setOrderQuantity(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="available-info">
                <span className="available-label">可买</span>
                <span className="available-value">{Math.floor(availableCash / orderPrice)}股</span>
              </div>

              <div className="order-summary">
                <div className="summary-row">
                  <span>预估金额</span>
                  <span>{formatNumber(totalAmount)}</span>
                </div>
                <div className="summary-row">
                  <span>手续费</span>
                  <span>{formatNumber(commission)}</span>
                </div>
              </div>

              <button 
                className={`submit-btn ${orderSide}`}
                onClick={handleSubmitOrder}
              >
                {orderSide === 'buy' ? '买入' : '卖出'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Indicators */}
      <div className="indicators-bar">
        <div className="indicator-group">
          <span className="indicator-label">MA</span>
          <span className="indicator-value ma5">MA5: {indicators.ma5.toFixed(2)}</span>
          <span className="indicator-value ma10">MA10: {indicators.ma10.toFixed(2)}</span>
          <span className="indicator-value ma20">MA20: {indicators.ma20.toFixed(2)}</span>
        </div>
        <div className="indicator-group">
          <span className="indicator-label">MACD</span>
          <span className="indicator-value">DIF: {indicators.macd.diff.toFixed(3)}</span>
          <span className="indicator-value">DEA: {indicators.macd.dea.toFixed(3)}</span>
          <span className="indicator-value">MACD: {indicators.macd.bar.toFixed(3)}</span>
        </div>
        <div className="indicator-group">
          <span className="indicator-label">RSI</span>
          <span className="indicator-value">RSI: {indicators.rsi.toFixed(1)}</span>
        </div>
        <div className="indicator-group">
          <span className="indicator-label">BOLL</span>
          <span className="indicator-value">上: {indicators.boll.upper.toFixed(2)}</span>
          <span className="indicator-value">中: {indicators.boll.middle.toFixed(2)}</span>
          <span className="indicator-value">下: {indicators.boll.lower.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

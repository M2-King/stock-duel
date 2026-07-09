/**
 * 持仓页：
 *  - 顶部：总资产 / 累计盈亏 / 持仓占比
 *  - 杠杆滑块
 *  - 持仓列表 — 平仓按钮
 *  - 成交历史（可折叠）
 */

import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';

export default function MobilePortfolio() {
  const totalAssets = useGameStore((s) => s.totalAssets);
  const cash = useGameStore((s) => s.cash);
  const initialAssets = 100_000_000;
  const totalPnl = totalAssets - initialAssets;
  const totalPnlPct = (totalPnl / initialAssets) * 100;
  const holdings = useGameStore((s) => s.holdings);
  const stockPrices = useGameStore((s) => s.stockPrices);
  const currentQuote = useGameStore((s) => s.currentQuote);
  const leverage = useGameStore((s) => s.leverage);
  const setLeverage = useGameStore((s) => s.setLeverage);
  const placeOrder = useGameStore((s) => s.placeOrder);
  const closePosition = useGameStore((s) => s.closePosition);
  const showToast = useGameStore((s) => s.showToast);
  const borrowed = useGameStore((s) => s.borrowed);
  const orderHistory = useGameStore((s) => s.orderHistory);
  const todayPnl = useGameStore((s) => s.todayPnl);

  const [showHistory, setShowHistory] = useState(false);

  const enriched = holdings.map((h) => {
    const live = stockPrices[h.symbol] ?? currentQuote.price;
    const value = live * h.shares;
    const pnl = (live - h.avgPrice) * h.shares;
    const pnlPct = h.avgPrice > 0 ? ((live - h.avgPrice) / h.avgPrice) * 100 : 0;
    return { ...h, live, value, pnl, pnlPct };
  });
  const positionSum = enriched.reduce((s, h) => s + h.value, 0);

  const handleClose = (sym: string, sellAll = false) => {
    const h = enriched.find((x) => x.symbol === sym);
    if (!h) return;
    if (sellAll) {
      closePosition(sym, h.live);
      showToast(`已平仓 ${sym}`, 'success');
    } else {
      // 卖一半
      const r = placeOrder({
        side: 'sell',
        type: 'market',
        symbol: sym,
        price: h.live,
        quantity: Math.floor(h.shares / 2),
        status: 'filled',
      });
      if (r?.success) showToast(`已卖出 ${Math.floor(h.shares / 2)} 股 ${sym}`, 'success');
      else showToast(r?.error || '下单失败', 'danger');
    }
  };

  return (
    <div className="m-portfolio">
      <header className="m-page-header">
        <h1 className="m-page-title">持仓</h1>
      </header>

      <section className="m-hero">
        <div className="m-hero-label">总资产</div>
        <div className="m-hero-value">¥{totalAssets.toLocaleString()}</div>
        <div className="m-hero-meta" style={{ marginTop: 16 }}>
          <div className="m-hero-meta-col">
            <span className="m-hero-meta-label">累计收益</span>
            <span className={`m-hero-meta-value ${totalPnl >= 0 ? 'm-up' : 'm-down'}`}>
              {totalPnl >= 0 ? '+' : '−'}¥{Math.abs(totalPnl).toLocaleString()} ({totalPnlPct.toFixed(2)}%)
            </span>
          </div>
          <div className="m-hero-meta-col">
            <span className="m-hero-meta-label">今日盈亏</span>
            <span className={`m-hero-meta-value ${todayPnl >= 0 ? 'm-up' : 'm-down'}`}>
              {todayPnl >= 0 ? '+' : '−'}¥{Math.abs(todayPnl).toLocaleString()}
            </span>
          </div>
          <div className="m-hero-meta-col">
            <span className="m-hero-meta-label">持仓市值</span>
            <span className="m-hero-meta-value">¥{Math.round(positionSum).toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* 杠杆 slider */}
      <section className="m-card" style={{ margin: '12px 16px' }}>
        <div className="m-card-row" style={{ borderTop: 'none', paddingBottom: 12 }}>
          <span className="label">杠杆倍数</span>
          <span className="value m-mono">{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--m-text)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--m-text-3)', marginTop: 4 }}>
          <span>1x</span><span>2x</span><span>3x</span><span>4x</span><span>5x</span>
        </div>
      </section>

      {/* 资金分布 */}
      <section className="m-card" style={{ margin: '0 16px 14px' }}>
        <div className="m-card-row">
          <span className="label">可用现金</span>
          <span className="value m-mono">¥{cash.toLocaleString()}</span>
        </div>
        <div className="m-card-row">
          <span className="label">持仓市值</span>
          <span className="value m-mono">¥{Math.round(positionSum).toLocaleString()}</span>
        </div>
        <div className="m-card-row">
          <span className="label">已借</span>
          <span className="value m-mono">¥{borrowed.toLocaleString()}</span>
        </div>
        <div className="m-card-row">
          <span className="label">持仓占比</span>
          <span className="value m-mono">{totalAssets > 0 ? ((positionSum / totalAssets) * 100).toFixed(1) : '0.0'}%</span>
        </div>
      </section>

      {/* 持仓列表 */}
      <h3 className="m-section-title">我的持仓</h3>
      <div className="m-list">
        {enriched.length === 0 ? (
          <div className="m-card-row">
            <span className="m-mute">暂无持仓 · 前往“交易”买入</span>
          </div>
        ) : (
          enriched.map((h) => (
            <div
              key={h.symbol}
              className="m-card"
              style={{ margin: '0 16px 10px', padding: '14px 16px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{h.symbol}</div>
                  <div style={{ fontSize: 11, color: 'var(--m-text-3)' }}>{h.shares.toLocaleString()} 股 @ ¥{h.avgPrice.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="m-mono" style={{ fontSize: 16, fontWeight: 600 }}>
                    ¥{h.value.toLocaleString()}
                  </div>
                  <div className={`m-mono ${h.pnl >= 0 ? 'm-up' : 'm-down'}`} style={{ fontSize: 12 }}>
                    {h.pnl >= 0 ? '+' : '−'}¥{Math.abs(h.pnl).toFixed(0)}
                    <span style={{ marginLeft: 4 }}>({h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%)</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="m-btn m-btn-down m-btn-block"
                  onClick={() => handleClose(h.symbol, false)}
                  style={{ minHeight: 36, padding: 0 }}
                >
                  卖一半
                </button>
                <button
                  type="button"
                  className="m-btn m-btn-ghost m-btn-block"
                  onClick={() => handleClose(h.symbol, true)}
                  style={{ minHeight: 36, padding: 0 }}
                >
                  全平
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 成交历史 */}
      <h3 className="m-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>成交历史 ({orderHistory.length})</span>
        <button
          type="button"
          className="m-btn m-btn-ghost"
          style={{ minHeight: 32, padding: '0 10px', fontSize: 12 }}
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? '折叠' : '展开'}
        </button>
      </h3>
      {showHistory && (
        <div className="m-list">
          {orderHistory.slice(0, 12).map((o) => (
            <div
              key={o.id}
              className="m-card-row"
              style={{ gridTemplateColumns: '1fr auto', display: 'grid' }}
            >
              <div>
                <span className={`m-tag ${o.side === 'buy' ? 'm-tag-up' : 'm-tag-down'}`} style={{ marginRight: 6 }}>
                  {o.side === 'buy' ? '买' : '卖'}
                </span>
                <span className="m-mono">{o.symbol}</span>
                <span style={{ color: 'var(--m-text-3)', fontSize: 11, marginLeft: 6 }}>
                  {o.quantity.toLocaleString()} 股 @ {o.price.toFixed(2)}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--m-text-3)' }}>
                {new Date(o.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {orderHistory.length === 0 && (
            <div className="m-card-row">
              <span className="m-mute">暂无成交</span>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}

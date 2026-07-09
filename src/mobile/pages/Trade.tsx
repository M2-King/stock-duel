/**
 * 交易页：
 *  - 顶部：当前标的选择 + 价格 / 涨跌 / 持仓现状
 *  - 角色分流：
 *      dealer     → MobileDealerTools（6 工具 + 实时成本预览）
 *      regulator  → 监管提示 + 跳到 alerts
 *      retail     → 买入 / 卖出 表单
 *  - 所有下注 / 操盘动作都直接调 store 的 action
 */

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import MobileChart from '../components/Chart';
import MobileDealerTools from '../components/DealerTools';

const PERCENT_PRESETS = [25, 50, 75, 100] as const;
const LEVER_PRESETS = [1, 2, 3, 5] as const;

export default function MobileTrade() {
  const role = useGameStore((s) => s.role);
  const gameStatus = useGameStore((s) => s.gameStatus);

  // 散户分支
  const currentQuote = useGameStore((s) => s.currentQuote);
  const cash = useGameStore((s) => s.cash);
  const leverage = useGameStore((s) => s.leverage);
  const placeOrder = useGameStore((s) => s.placeOrder);
  const setLeverage = useGameStore((s) => s.setLeverage);
  const showToast = useGameStore((s) => s.showToast);
  const holdings = useGameStore((s) => s.holdings);
  const stockRestrictions = useGameStore((s) => s.stockRestrictions);
  const scores = useGameStore((s) => s.scores);
  const alerts = useGameStore((s) => s.alerts);
  const justiceScore = useGameStore((s) => s.justiceScore);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState<number>(100);
  const [pct, setPct] = useState<number>(50);
  const [lev, setLev] = useState<number>(leverage);

  // qty 自动跟着 % 变
  useEffect(() => {
    if (side === 'buy') {
      const available = cash * (pct / 100) * (lev / 1);
      const computed = Math.floor(available / Math.max(currentQuote.price, 0.01));
      setQty((q) => (q === computed || q === 0 ? computed : computed));
    } else {
      const owned = holdings.find((h) => h.symbol === currentQuote.symbol)?.shares ?? 0;
      const computed = Math.floor(owned * (pct / 100));
      setQty(computed);
    }
  }, [pct, lev, side, cash, currentQuote.price, currentQuote.symbol, holdings]);

  useEffect(() => { setLev(leverage); }, [leverage]);

  const upper = (currentQuote.prevClose || currentQuote.price) * 1.10;
  const lower = (currentQuote.prevClose || currentQuote.price) * 0.90;
  const isUpper = currentQuote.price >= upper - 0.001;
  const isLower = currentQuote.price <= lower + 0.001;

  const ownedShares = useMemo(
    () => holdings.find((h) => h.symbol === currentQuote.symbol)?.shares ?? 0,
    [holdings, currentQuote.symbol],
  );
  const positionValue = ownedShares * currentQuote.price;
  const estAmount = qty * currentQuote.price;
  const enoughCash = cash >= estAmount;
  const enoughShares = ownedShares >= qty;
  const restriction = stockRestrictions[currentQuote.symbol];

  const confirm = () => {
    if (qty <= 0) {
      showToast('数量需 > 0', 'warning');
      return;
    }
    if (side === 'buy' && !enoughCash) {
      showToast('资金不足', 'warning');
      return;
    }
    if (side === 'sell' && !enoughShares) {
      showToast('持仓不足', 'warning');
      return;
    }
    if (restriction) {
      showToast('该股票已被监管限制', 'warning');
      return;
    }
    const r = placeOrder({
      side,
      type: 'market',
      symbol: currentQuote.symbol,
      price: currentQuote.price,
      quantity: qty,
      status: 'filled',
      leverage: lev,
    });
    if (r?.success) {
      showToast(`${side === 'buy' ? '买入' : '卖出'}成功 ${qty} 股 @ ¥${currentQuote.price.toFixed(2)}`, 'success');
    } else {
      showToast(r?.error || '下单失败', 'danger');
    }
  };

  // === dealer 分支 ===
  if (role === 'dealer' && gameStatus === 'playing') {
    return (
      <div className="m-trade">
        <header className="m-page-header">
          <h1 className="m-page-title">操盘</h1>
        </header>
        <section className="m-card" style={{ margin: '0 16px' }}>
          <div className="m-card-row">
            <span className="label">当前标的</span>
            <span className="value">{currentQuote.symbol} · {currentQuote.name}</span>
          </div>
          <div className="m-card-row">
            <span className="label">现价 / 涨跌停</span>
            <span className="value m-mono">
              <span className={currentQuote.change >= 0 ? 'm-up' : 'm-down'}>{currentQuote.price.toFixed(2)}</span>
              <span style={{ color: 'var(--m-text-3)', margin: '0 6px' }}>·</span>
              <span style={{ color: 'var(--m-up)' }}>↑{upper.toFixed(2)}</span>
              <span style={{ color: 'var(--m-text-3)', margin: '0 6px' }}>/</span>
              <span style={{ color: 'var(--m-down)' }}>↓{lower.toFixed(2)}</span>
            </span>
          </div>
        </section>
        <MobileChart symbol={currentQuote.symbol} />
        <MobileDealerTools symbol={currentQuote.symbol} />
      </div>
    );
  }

  // === regulator 分支 ===
  if (role === 'regulator' && gameStatus === 'playing') {
    return (
      <div className="m-trade">
        <header className="m-page-header">
          <h1 className="m-page-title">监管</h1>
        </header>
        <section className="m-card" style={{ margin: '12px 16px' }}>
          <div className="m-card-row">
            <span className="label">监管指数</span>
            <span className="value">{scores.manipulation.toFixed(1)}</span>
          </div>
          <div className="m-card-row">
            <span className="label">告警数</span>
            <span className="value m-mono">{alerts.length}</span>
          </div>
          <div className="m-card-row">
            <span className="label">正义分数</span>
            <span className="value m-mono">{justiceScore.toFixed(0)}</span>
          </div>
        </section>
        <p style={{ padding: '12px 16px', fontSize: 12, color: 'var(--m-text-3)' }}>
          监管专用操作请在桌面端完成（告警研判 → warn / freeze / kick）。
        </p>
      </div>
    );
  }

  // === retail 分支 ===
  return (
    <div className="m-trade">
      <header className="m-page-header">
        <h1 className="m-page-title">交易</h1>
      </header>

      {/* 当前标的状态 */}
      <section className="m-card" style={{ margin: '0 16px' }}>
        <div className="m-card-row">
          <span className="label">标的</span>
          <span className="value">{currentQuote.symbol} · {currentQuote.name}</span>
        </div>
        <div className="m-card-row">
          <span className="label">现价</span>
          <span className={`value m-mono ${currentQuote.change >= 0 ? 'm-up' : 'm-down'}`}>
            ¥{currentQuote.price.toFixed(2)}
            <span style={{ marginLeft: 6, fontSize: 11 }}>
              {currentQuote.change >= 0 ? '+' : ''}{currentQuote.changePercent.toFixed(2)}%
            </span>
          </span>
        </div>
        <div className="m-card-row">
          <span className="label">涨跌停</span>
          <span className="value m-mono">
            <span style={{ color: 'var(--m-up)' }}>↑¥{upper.toFixed(2)}</span>
            <span style={{ color: 'var(--m-text-3)', margin: '0 4px' }}>/</span>
            <span style={{ color: 'var(--m-down)' }}>↓¥{lower.toFixed(2)}</span>
            {isUpper && <span className="m-tag m-tag-up" style={{ marginLeft: 8 }}>涨停</span>}
            {isLower && <span className="m-tag m-tag-down" style={{ marginLeft: 8 }}>跌停</span>}
          </span>
        </div>
        <div className="m-card-row">
          <span className="label">我的持仓</span>
          <span className="value m-mono">{ownedShares.toLocaleString()} 股 · ¥{positionValue.toLocaleString()}</span>
        </div>
      </section>

      <MobileChart symbol={currentQuote.symbol} />

      {/* 买卖 segmented */}
      <div style={{ padding: '14px 16px 0' }}>
        <div className="m-segmented">
          <button type="button" className={`m-segmented-item ${side === 'buy' ? 'active' : ''}`} onClick={() => setSide('buy')}>买入</button>
          <button type="button" className={`m-segmented-item ${side === 'sell' ? 'active' : ''}`} onClick={() => setSide('sell')}>卖出</button>
          <button type="button" className={`m-segmented-item ${!ownedShares ? 'disabled' : ''}`} onClick={() => setQty(ownedShares)}>全仓卖</button>
          <button type="button" className="m-segmented-item" onClick={() => setQty(0)}>清空</button>
        </div>
      </div>

      {/* 数量 / 百分比 / 杠杆 */}
      <div style={{ padding: '12px 16px 0' }}>
        <div className="m-field">
          <label className="m-field-label">数量（股）</label>
          <input
            className="m-input m-mono"
            type="number"
            min={0}
            step={100}
            value={qty}
            onChange={(e) => {
              const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
              setQty(v);
            }}
            inputMode="numeric"
          />
        </div>

        <div className="m-field">
          <label className="m-field-label">可用仓位</label>
          <div className="m-segmented">
            {PERCENT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`m-segmented-item ${pct === p ? 'active' : ''}`}
                onClick={() => setPct(p)}
              >{p}%</button>
            ))}
          </div>
        </div>

        {side === 'buy' && (
          <div className="m-field">
            <label className="m-field-label">杠杆倍数</label>
            <div className="m-segmented">
              {LEVER_PRESETS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`m-segmented-item ${lev === l ? 'active' : ''}`}
                  onClick={() => { setLev(l); setLeverage(l); }}
                >{l}x</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 汇总 */}
      <section className="m-card" style={{ margin: '12px 16px 0' }}>
        <div className="m-card-row">
          <span className="label">预计金额</span>
          <span className={`value m-mono ${estAmount > 0 ? (side === 'buy' ? 'm-up' : 'm-down') : ''}`}>
            ¥{estAmount.toLocaleString()}
          </span>
        </div>
        <div className="m-card-row">
          <span className="label">{side === 'buy' ? '可用现金' : '可用持仓'}</span>
          <span className="value m-mono">
            {side === 'buy' ? `¥${cash.toLocaleString()}` : `${ownedShares.toLocaleString()} 股`}
          </span>
        </div>
      </section>

      {/* 主按钮 */}
      <div style={{ padding: '16px 16px 24px' }}>
        <button
          type="button"
          className={`m-btn m-btn-block ${side === 'buy' ? 'm-btn-up' : 'm-btn-down'}`}
          onClick={confirm}
          disabled={
            qty <= 0
            || (side === 'buy' && (!enoughCash || isUpper))
            || (side === 'sell' && (!enoughShares || isLower))
          }
        >
          {side === 'buy' ? (isUpper ? '已涨停 无法买入' : `买入 ${qty} 股`) : (isLower ? '已跌停 无法卖出' : `卖出 ${qty} 股`)}
        </button>
        {side === 'buy' && !enoughCash && qty > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--m-down)' }}>资金不足</div>
        )}
        {side === 'sell' && !enoughShares && qty > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--m-down)' }}>持仓不足</div>
        )}
      </div>
    </div>
  );
}

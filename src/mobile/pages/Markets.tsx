/**
 * 行情页：
 *  - 顶部 Tab：自选 / 全部 / 各行业
 *  - 紧凑股票列表，涨跌停/红绿色
 *  - 单只点击 → 进入图表 + 操作底部滑出
 */

import { useState, useMemo } from 'react';
import { useGameStore } from '../../store/gameStore';
import MobileChart from '../components/Chart';

const SECTORS = ['自选', '全部', '科技', '消费', '金融', '能源', '医药'];

export default function MobileMarkets() {
  const [sector, setSector] = useState('全部');
  const allStocks = useGameStore((s) => s.allStocks);
  const stockPrices = useGameStore((s) => s.stockPrices);
  const watchlist = useGameStore((s) => s.watchlist);
  const currentQuoteSymbol = useGameStore((s) => s.currentQuote.symbol);
  const indices = useGameStore((s) => s.indices);

  const [activeSym, setActiveSym] = useState<string>(currentQuoteSymbol);

  const filtered = useMemo(() => {
    let list = allStocks;
    if (sector === '自选') list = list.filter((s) => watchlist.includes(s.symbol));
    else if (sector === '科技')   list = list.filter((s) => s.sector === 'Technology' || s.sector === 'Semiconductors' || s.sector === 'Automotive');
    else if (sector === '消费')   list = list.filter((s) => s.sector === 'Consumer');
    else if (sector === '金融')   list = list.filter((s) => s.sector === 'Financial');
    else if (sector === '能源')   list = list.filter((s) => s.sector === 'Energy');
    else if (sector === '医药')   list = list.filter((s) => s.sector === 'Healthcare');
    return list.map((s) => {
      const price = stockPrices[s.symbol] ?? s.price;
      const prevClose = s.price - s.change;
      const pct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : s.changePercent;
      return { stock: s, price, pct };
    });
  }, [sector, allStocks, stockPrices, watchlist]);

  const active = useMemo(() => {
    const s = allStocks.find((x) => x.symbol === activeSym);
    return s ? { stock: s, price: stockPrices[s.symbol] ?? s.price } : null;
  }, [allStocks, stockPrices, activeSym]);

  const selectStock = (sym: string) => {
    setActiveSym(sym);
    useGameStore.getState().selectSymbol(sym);
  };

  return (
    <div className="m-markets">
      <header className="m-page-header">
        <h1 className="m-page-title">行情</h1>
      </header>

      {/* === 指数 strip === */}
      <div className="m-markets-indices">
        {indices.slice(0, 4).map((idx) => (
          <div key={idx.name} className="m-markets-idx">
            <div className="m-markets-idx-name">{idx.name}</div>
            <div className="m-markets-idx-val m-mono">{idx.value.toLocaleString()}</div>
            <div className={`m-markets-idx-chg m-mono ${idx.change >= 0 ? 'm-up' : 'm-down'}`}>
              {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>

      {/* === Sector pills === */}
      <div className="m-segments-wrap">
        <div className="m-segments">
          {SECTORS.map((s) => (
            <button
              key={s}
              type="button"
              className={`m-segment ${s === sector ? 'active' : ''}`}
              onClick={() => setSector(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* === Selected stock chart + quick ops === */}
      {active && (
        <>
          <div className="m-markets-active">
            <div className="m-markets-active-row">
              <div>
                <span className="m-mono" style={{ fontSize: 18, fontWeight: 700 }}>
                  {active.stock.symbol}
                </span>
                <span style={{ color: 'var(--m-text-3)', fontSize: 12, marginLeft: 8 }}>
                  {active.stock.name}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={`m-mono m-markets-active-price ${active.price >= active.stock.price - active.stock.change ? 'm-up' : 'm-down'}`}>
                  {active.price.toFixed(2)}
                </div>
                <div className={`m-mono ${active.price >= active.stock.price - active.stock.change ? 'm-up' : 'm-down'}`} style={{ fontSize: 11 }}>
                  ({(active.price - (active.stock.price - active.stock.change)).toFixed(2)})
                </div>
              </div>
            </div>

            <MobileChart symbol={active.stock.symbol} />

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="m-btn m-btn-up m-btn-block"
                onClick={() => {
                  useGameStore.getState().selectSymbol(active.stock.symbol);
                  // 触发切 Tab（MobileApp 监听）
                  document.dispatchEvent(new CustomEvent('m-goto-tab', { detail: { tab: 'trade' } }));
                }}
              >买入</button>
              <button
                type="button"
                className="m-btn m-btn-down m-btn-block"
                onClick={() => {
                  useGameStore.getState().selectSymbol(active.stock.symbol);
                  document.dispatchEvent(new CustomEvent('m-goto-tab', { detail: { tab: 'trade' } }));
                }}
              >卖出</button>
            </div>
          </div>
        </>
      )}

      {/* === Stock list === */}
      <h3 className="m-section-title">
        {sector === '自选' ? '自选股' : sector === '全部' ? '全部股票' : sector}
      </h3>
      <div className="m-list">
        {filtered.length === 0 ? (
          <div className="m-card-row">
            <span className="m-mute">暂无股票</span>
          </div>
        ) : filtered.map(({ stock, price, pct }) => {
          const upper = (stock.price - stock.change) * 1.10;
          const lower = (stock.price - stock.change) * 0.90;
          const isLimitUp = price >= upper - 0.001;
          const isLimitDown = price <= lower + 0.001;
          const inWatch = watchlist.includes(stock.symbol);
          return (
            <div
              key={stock.symbol}
              className="m-list-item"
              onClick={() => selectStock(stock.symbol)}
            >
              <div className="m-list-left">
                <div className="m-list-sym">
                  {stock.symbol}
                  {isLimitUp && <span className="m-tag m-tag-up" style={{ marginLeft: 6 }}>涨停</span>}
                  {isLimitDown && <span className="m-tag m-tag-down" style={{ marginLeft: 6 }}>跌停</span>}
                </div>
                <div className="m-list-name">{stock.name} · {stock.sector}</div>
              </div>
              <div className="m-list-right">
                <div className={`m-list-price ${pct >= 0 ? 'm-up' : 'm-down'}`}>{price.toFixed(2)}</div>
                <div className={`m-list-pct ${pct >= 0 ? 'm-up' : 'm-down'}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

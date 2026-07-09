/**
 * 移动端首页：
 *  - 顶部 头像 + 通知 + 设置
 *  - Hero: 总资产 + 今日盈亏 + 小分时图
 *  - 庄家资金池 / 能量 / 风险指数（如果对局中）
 *  - 当前对局状态 (进行中 / 倒计时)
 *  - 4 宫格快捷入口 (行情 / 交易 / 持仓 / 工具)
 *  - 全部新闻 + 市场快讯
 */

import { useMemo } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { MobileTab } from '../components/BottomNav';
import MobileSparkline from '../components/Sparkline';
import MobileRolePill from '../components/RolePill';

interface Props {
  onTabChange: (tab: MobileTab) => void;
  onOpenMatch: () => void;
}

export default function MobileHome({ onTabChange, onOpenMatch }: Props) {
  const role = useGameStore((s) => s.role);
  const userName = useGameStore((s) => s.userName);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const matchOpponentName = useGameStore((s) => s.matchOpponentName);
  const currentDay = useGameStore((s) => s.currentDay);
  const maxDays = useGameStore((s) => s.maxDays);
  const currentTick = useGameStore((s) => s.currentTick);
  const maxTicksPerDay = useGameStore((s) => s.maxTicksPerDay);

  // 总资产：从 store 读，保持单点真相
  const totalAssets = useGameStore((s) => s.totalAssets);
  const initialAssets = 100_000_000;
  const totalPnl = totalAssets - initialAssets;
  const totalPnlPct = (totalPnl / initialAssets) * 100;

  const todayPnl = useGameStore((s) => s.todayPnl);
  const todayPnlPercent = useGameStore((s) => s.todayPnlPercent);
  const dealerResources = useGameStore((s) => s.dealerResources);
  const capitalPool = dealerResources?.cash ?? 0;
  const riskIndex = dealerResources?.riskIndex ?? 0;

  const currentQuote = useGameStore((s) => s.currentQuote);
  const allStocks = useGameStore((s) => s.allStocks);
  const stockPrices = useGameStore((s) => s.stockPrices);
  const timelineData = useGameStore((s) => s.timelineData);

  // 取 4 个最重要的股票作为行情快照
  const highlightSymbols = ['QDN', 'AAPL', 'TSLA', 'NVDA'];
  const highlights = useMemo(
    () =>
      highlightSymbols
        .map((sym) => allStocks.find((s) => s.symbol === sym))
        .filter(Boolean)
        .map((s) => {
          const price = stockPrices[s!.symbol] ?? s!.price;
          const prevClose = s!.price - s!.change;
          const pct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : s!.changePercent;
          return { stock: s!, price, pct };
        }),
    [allStocks, stockPrices],
  );

  // 顶部数据快讯（前 3 条 market 快讯）
  const news = useGameStore((s) => s.news);
  const marketNews = news.slice(0, 3);

  const inboxUnread = useGameStore((s) => s.messages.filter((m) => !m.read).length);
  const alertsCount = useGameStore((s) => s.alerts.length);

  return (
    <div className="m-home">
      {/* ===== Page header ===== */}
      <header className="m-page-header">
        <div className="m-page-header-left">
          <div className="m-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'var(--m-text)', color: 'var(--m-bg)',
              display: 'grid', placeItems: 'center', fontWeight: 700
            }}>
              {userName?.[0]?.toUpperCase() ?? 'U'}
            </span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.01 }}>{userName}</div>
              <div style={{ fontSize: 11, color: 'var(--m-text-3)', marginTop: 2 }}>Lv.18</div>
            </div>
          </div>
        </div>
        <div className="m-page-header-right">
          <button
            type="button"
            aria-label="设置"
            onClick={() => onTabChange('profile')}
            style={{
              width: 40, height: 40, minWidth: 44, minHeight: 44, padding: 0,
              display: 'grid', placeItems: 'center',
              borderRadius: 9999, background: 'var(--m-surface)', border: '1px solid var(--m-border)',
              color: 'var(--m-text-2)',
              position: 'relative',
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {(inboxUnread + alertsCount) > 0 && (
              <span style={{
                position: 'absolute',
                top: 8, right: 8,
                width: 8, height: 8, borderRadius: 4,
                background: 'var(--price-up)',
                boxShadow: '0 0 0 2px var(--m-bg)',
              }} />
            )}
          </button>
        </div>
      </header>

      {/* ===== 对局进行中状态条 ===== */}
      {gameStatus === 'playing' && (
        <div className="m-status-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pulse" />
            <span>对局进行中</span>
            <span className="m-mute">·</span>
            <MobileRolePill role={role} />
          </div>
          <span className="m-mono">
            {matchOpponentName ? `vs ${matchOpponentName}` : 'AI 对手'} · Day {currentDay}/{maxDays}
          </span>
        </div>
      )}

      {/* ===== Hero: 总资产 ===== */}
      <section className="m-hero" aria-label="总资产">
        <div className="m-hero-label">总资产 (Total Assets)</div>
        <div className="m-hero-value">¥{totalAssets.toLocaleString()}</div>
        <MobileSparkline points={timelineData} className="m-spark" />
        <div className="m-hero-meta">
          <div className="m-hero-meta-col">
            <span className="m-hero-meta-label">今日盈亏</span>
            <span className={`m-hero-meta-value ${todayPnl >= 0 ? 'm-up' : 'm-down'}`}>
              {todayPnl >= 0 ? '+' : ''}¥{todayPnl.toLocaleString()} ({todayPnlPercent.toFixed(2)}%)
            </span>
          </div>
          <div className="m-hero-meta-col">
            <span className="m-hero-meta-label">累计收益</span>
            <span className={`m-hero-meta-value ${totalPnl >= 0 ? 'm-up' : 'm-down'}`}>
              {totalPnl >= 0 ? '+' : ''}¥{Math.abs(totalPnl).toLocaleString()} ({totalPnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>
      </section>

      {/* ===== 4 宫格快捷入口 ===== */}
      <h3 className="m-section-title">快捷入口</h3>
      <div className="m-action-grid">
        <ActionItem icon="📊" label="行情" onTap={() => onTabChange('markets')} />
        <ActionItem icon="💱" label="交易" onTap={() => onTabChange('trade')} />
        <ActionItem icon="📦" label="持仓" onTap={() => onTabChange('portfolio')} />
        {role === 'dealer' && gameStatus === 'playing' ? (
          <ActionItem icon="🛠️" label="操盘" onTap={() => onTabChange('trade')} />
        ) : (
          <ActionItem icon="🆚" label="匹配" onTap={onOpenMatch} />
        )}
      </div>

      {/* ===== 当前对局信息卡 (playing 时显示) ===== */}
      {gameStatus === 'playing' && (
        <>
          <h3 className="m-section-title">对局实时数据</h3>
          <div className="m-list">
            {role === 'dealer' && (
              <>
                <div className="m-card-row">
                  <span className="label">庄家资金池</span>
                  <span className="value m-mono">¥{capitalPool.toLocaleString()}</span>
                </div>
                <div className="m-card-row">
                  <span className="label">风险指数</span>
                  <span className={`value m-mono ${riskIndex > 70 ? 'm-up' : ''}`}>{riskIndex.toFixed(1)}%</span>
                </div>
              </>
            )}
            <div className="m-card-row">
              <span className="label">当前标的</span>
              <span className="value m-mono">{currentQuote.symbol} · {currentQuote.name}</span>
            </div>
            <div className="m-card-row">
              <span className="label">价格</span>
              <span className={`value m-mono ${currentQuote.change >= 0 ? 'm-up' : 'm-down'}`}>
                ¥{currentQuote.price.toFixed(2)}
              </span>
            </div>
            <div className="m-card-row">
              <span className="label">Tick</span>
              <span className="value m-mono">{currentTick} / {maxTicksPerDay}</span>
            </div>
          </div>
        </>
      )}

      {/* ===== 市场快讯 ===== */}
      <h3 className="m-section-title">市场快讯</h3>
      <div className="m-list">
        {marketNews.length === 0 ? (
          <div className="m-card-row">
            <span className="m-mute">暂无快讯</span>
          </div>
        ) : marketNews.map((n) => (
          <div key={n.id} className="m-list-item" style={{ gridTemplateColumns: '1fr' }}>
            <div className="m-list-left">
              <div className="m-list-sym" style={{ fontSize: 14 }}>{n.title}</div>
              <div className="m-list-name">
                <span className={`m-tag ${n.type === 'verified' ? 'm-tag-up' : n.type === 'warning' ? 'm-tag-down' : ''}`} style={{ marginRight: 6 }}>
                  {n.type === 'verified' ? '官方' : n.type === 'warning' ? '警告' : '传闻'}
                </span>
                {n.source} · {n.time}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 行情快照 ===== */}
      <h3 className="m-section-title">行情快照</h3>
      <div className="m-list">
        {highlights.map((h) => (
          <div key={h.stock.symbol} className="m-list-item" onClick={() => {
            useGameStore.getState().selectSymbol(h.stock.symbol);
            onTabChange('markets');
          }}>
            <div className="m-list-left">
              <div className="m-list-sym">{h.stock.symbol}</div>
              <div className="m-list-name">{h.stock.name}</div>
            </div>
            <div className="m-list-right">
              <div className="m-list-price">{h.price.toFixed(2)}</div>
              <div className={`m-list-pct ${h.pct >= 0 ? 'm-up' : 'm-down'}`}>
                {h.pct >= 0 ? '+' : ''}{h.pct.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* bottom spacer */}
      <div style={{ height: 24 }} />
    </div>
  );
}

function ActionItem({ icon, label, onTap }: { icon: string; label: string; onTap: () => void }) {
  return (
    <button type="button" className="m-action-item" onClick={onTap}>
      <span className="m-action-icon">{icon}</span>
      <span className="m-action-label">{label}</span>
    </button>
  );
}

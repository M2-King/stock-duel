import { useState, useMemo, useEffect, type CSSProperties } from 'react';
import { useGameStore, usesBackendGameState } from '../store/gameStore';
import { useDealerResources } from '../hooks/useCashBalance';
import MarketChart from '../components/MarketChart';
import { formatStockMetaLine } from '../shared/stockMeta';
import {
  previewDealerAction,
  formatDealerCost,
  formatDealerEffectLabel,
} from '../shared/dealerFormulas';
import './DealerPanelPage.css';

type ToolType = 'pump' | 'press' | 'accumulate' | 'distribute' | 'wash' | 'fake';

interface Tool {
  id: ToolType;
  label: string;
  cn: string;
  description: string;
  icon: string;
  accent: string;
  iconBg: string;
}

const tools: Tool[] = [
  { id: 'pump',       label: 'Pump',        cn: '拉升',  description: '推高股价',           icon: '📈', accent: '#22c55e', iconBg: 'rgba(34, 197, 94, 0.15)'  },
  { id: 'press',      label: 'Press',       cn: '压价',  description: '砸盘压低股价',       icon: '📉', accent: '#ef4444', iconBg: 'rgba(239, 68, 68, 0.15)'  },
  { id: 'accumulate', label: 'Accumulate',  cn: '吸筹',  description: '低位建仓，悄然买入', icon: '🛒', accent: '#a855f7', iconBg: 'rgba(168, 85, 247, 0.15)' },
  { id: 'distribute', label: 'Distribute',  cn: '出货',  description: '高位派发，套现离场', icon: '📤', accent: '#f97316', iconBg: 'rgba(249, 115, 22, 0.15)' },
  { id: 'wash',       label: 'Wash Trade',  cn: '对敲',  description: '自买自卖制造虚假成交', icon: '🔄', accent: '#eab308', iconBg: 'rgba(234, 179, 8, 0.15)'  },
  { id: 'fake',       label: 'Spoof',       cn: '假挂单', description: '挂大单制造买卖盘假象', icon: '🎭', accent: '#06b6d4', iconBg: 'rgba(6, 182, 212, 0.15)'  },
];

interface ToolPreview {
  cost: number;
  effectPct: number;
  riskIncrease: number;
  effectLabel: string;
}

export default function DealerPanelPage() {
  const {
    currentQuote, insiderData, executeDealerAction,
    allStocks, stockPrices, selectSymbol, showToast,
    getStockRestriction, currentTick,
  } = useGameStore();
  const backendGame = useGameStore((s) => usesBackendGameState(s));
  const [powerMap, setPowerMap] = useState<Record<ToolType, number>>({
    pump: 50, press: 50, accumulate: 50, distribute: 50, wash: 50, fake: 50,
  });
  const [previewMap, setPreviewMap] = useState<Record<ToolType, ToolPreview>>({
    pump: { cost: 0, effectPct: 0, riskIncrease: 0, effectLabel: '' },
    press: { cost: 0, effectPct: 0, riskIncrease: 0, effectLabel: '' },
    accumulate: { cost: 0, effectPct: 0, riskIncrease: 0, effectLabel: '' },
    distribute: { cost: 0, effectPct: 0, riskIncrease: 0, effectLabel: '' },
    wash: { cost: 0, effectPct: 0, riskIncrease: 0, effectLabel: '' },
    fake: { cost: 0, effectPct: 0, riskIncrease: 0, effectLabel: '' },
  });
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [flashTool, setFlashTool] = useState<ToolType | null>(null);
  const [executingId, setExecutingId] = useState<ToolType | null>(null);

  // 资金单一来源 — useDealerResources 与 Tools 页 / TradePanel 永远一致
  const { cash, riskIndex: risk } = useDealerResources();
  const symbol = currentQuote.symbol;
  const stockRestriction = getStockRestriction(symbol);
  const toolsLocked = !!stockRestriction;
  const lockRemaining = stockRestriction ? Math.max(0, stockRestriction.expiresTick - currentTick) : 0;
  const stockMetaLine = formatStockMetaLine(symbol);

  const prevClose = currentQuote.prevClose || currentQuote.price;
  const upperLimit = prevClose * 1.10;
  const lowerLimit = prevClose * 0.90;
  const isUpperLimit = currentQuote.price >= upperLimit - 0.001;
  const isLowerLimit = currentQuote.price <= lowerLimit + 0.001;

  const symbolChip = (sym: string) => {
    const stock = allStocks.find((s) => s.symbol === sym);
    if (!stock) return null;
    const price = stockPrices[sym] ?? stock.price;
    const chipPrevClose = stock.price - stock.change;
    const pct = chipPrevClose > 0 ? ((price - chipPrevClose) / chipPrevClose) * 100 : stock.changePercent;
    return { stock, price, pct };
  };
  const handleSelectSymbol = (sym: string) => {
    if (sym === symbol) return;
    selectSymbol(sym);
    showToast(`已切换到 ${sym} — 庄家工具作用于该股票`, 'info');
  };

  const fin = insiderData;
  const priceUp = currentQuote.change >= 0;
  const turnover = currentQuote.volume * currentQuote.price;
  const fmtFlow = (v: number) => `¥${(v / 1e6).toFixed(1)}M`;
  const quantFlows = [
    { source: 'Main Capital',  dir: priceUp ? 'IN' : 'OUT', amount: turnover * 0.00016, up: priceUp },
    { source: 'Retail Flow',   dir: priceUp ? 'IN' : 'OUT', amount: turnover * 0.00005, up: priceUp },
    { source: 'Foreign Inst.', dir: priceUp ? 'IN' : 'OUT', amount: turnover * 0.00010, up: priceUp },
    { source: 'Hedge Funds',   dir: priceUp ? 'OUT' : 'IN', amount: turnover * 0.00003, up: !priceUp },
  ];
  const insiderTrades = useMemo(() => [
    { action: 'BUY',  name: 'CEO',      shares: 50000, up: true,  days: '2d' },
    { action: 'SELL', name: 'CFO',      shares: 26000, up: false, days: '3d' },
    { action: 'BUY',  name: 'Director', shares: 19000, up: true,  days: '5d' },
    { action: 'SELL', name: 'VP Eng',   shares: 9500,  up: false, days: '7d' },
  ], []);

  const refreshPreview = async (id: ToolType, power: number) => {
    if (backendGame) {
      try {
        const api = await import('../services/apiService');
        const res: any = await api.get(`/api/dealer/preview-cost?type=${id}&power=${power}&symbol=${symbol}`);
        if (res?.code === 0 && typeof res.data?.cost === 'number') {
          const effectPct = res.data.effectPct ?? 0;
          setPreviewMap((m) => ({
            ...m,
            [id]: {
              cost: res.data.cost,
              effectPct,
              riskIncrease: res.data.riskIncrease ?? 0,
              effectLabel: formatDealerEffectLabel(id, effectPct),
            },
          }));
        }
      } catch { /* keep previous */ }
    } else {
      const p = previewDealerAction(id, symbol, power);
      setPreviewMap((m) => ({ ...m, [id]: { ...p, effectLabel: formatDealerEffectLabel(id, p.effectPct) } }));
    }
  };

  useEffect(() => {
    if (backendGame) {
      const { matchId, refreshPortfolioFromServer } = useGameStore.getState();
      if (matchId) void refreshPortfolioFromServer();
    }
    (Object.keys(powerMap) as ToolType[]).forEach((id) => refreshPreview(id, powerMap[id]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, backendGame]);

  const flashFeedback = (kind: 'success' | 'error' | 'info', msg: string, tool?: ToolType) => {
    setFeedback({ kind, msg });
    if (tool) {
      setFlashTool(tool);
      setTimeout(() => setFlashTool(null), 700);
    }
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleUseTool = async (tool: Tool) => {
    if (executingId) return;
    const power = powerMap[tool.id];
    const { cost } = previewMap[tool.id];
    if (cash < cost) {
      flashFeedback('error', `资金不足：需要 ${formatDealerCost(cost)}，可用 ${formatDealerCost(cash)}`, tool.id);
      return;
    }
    setExecutingId(tool.id);
    flashFeedback('info', `${tool.cn} 执行中…`, tool.id);
    try {
      const result = await executeDealerAction({
        type: tool.id,
        power,
        cost,
      });
      if (result?.success) {
        flashFeedback('success', `${tool.cn} 执行成功 — 花费 ${formatDealerCost(cost)}`, tool.id);
        showToast(`${tool.cn} 执行成功`, 'success');
      } else {
        flashFeedback('error', result?.error || '执行失败', tool.id);
        showToast(result?.error || '执行失败', 'danger');
      }
    } finally {
      setExecutingId(null);
    }
  };

  const updatePower = (id: ToolType, v: number) => {
    setPowerMap((p) => ({ ...p, [id]: v }));
    refreshPreview(id, v);
  };

  return (
    <div className="dealer-page">
      <div className="dealer-layout">
        <div className="dealer-chart">
          <MarketChart compact />
        </div>

        <div className="dealer-side">
          <div className="stock-meta-bar" style={{
            padding: '8px 12px',
            marginBottom: 8,
            borderRadius: 6,
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            fontSize: 13,
            color: 'var(--text-secondary, #94a3b8)',
          }}>
            {stockMetaLine}
          </div>

          <div className="symbol-bar" role="toolbar" aria-label="选择操盘股票">
            <span className="symbol-bar-label">操作标的</span>
            <div className="symbol-chips">
              {allStocks.map((s) => {
                const chip = symbolChip(s.symbol);
                if (!chip) return null;
                const { price, pct } = chip;
                const isActive = s.symbol === symbol;
                const up = pct >= 0;
                return (
                  <button
                    key={s.symbol}
                    type="button"
                    className={`symbol-chip ${isActive ? 'active' : ''} ${up ? 'up' : 'down'}`}
                    onClick={() => handleSelectSymbol(s.symbol)}
                    title={`${s.symbol} · ${s.name} @ ¥${price.toFixed(2)}`}
                  >
                    <span className="symbol-chip-sym">{s.symbol}</span>
                    <span className="symbol-chip-pct">
                      {up ? '+' : ''}{pct.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dealer-resources">
            <div className="resource-block large">
              <div className="resource-header">
                <span className="resource-icon">💰</span>
                <span className="resource-label">Cash</span>
              </div>
              <div className="resource-value mono">{formatDealerCost(cash)}</div>
              <div className="resource-bar-bg">
                <div className="resource-bar-fill" style={{ width: `${Math.min(100, (cash / 100_000_000) * 100)}%` }}></div>
              </div>
            </div>
            <div className="resource-block">
              <div className="resource-header">
                <span className="resource-icon">📈</span>
                <span className="resource-label">涨停</span>
              </div>
              <div className={`resource-value mono ${isUpperLimit ? 'up' : ''}`}>¥{upperLimit.toFixed(2)}</div>
              <div className="resource-bar-bg">
                <div className="resource-bar-fill up" style={{ width: `${Math.min(100, upperLimit > prevClose ? Math.max(0, ((currentQuote.price - prevClose) / (upperLimit - prevClose)) * 100) : 0)}%` }}></div>
              </div>
            </div>
            <div className="resource-block">
              <div className="resource-header">
                <span className="resource-icon">📉</span>
                <span className="resource-label">跌停</span>
              </div>
              <div className={`resource-value mono ${isLowerLimit ? 'down' : ''}`}>¥{lowerLimit.toFixed(2)}</div>
              <div className="resource-bar-bg">
                <div className="resource-bar-fill down" style={{ width: `${Math.min(100, prevClose > lowerLimit ? Math.max(0, ((prevClose - currentQuote.price) / (prevClose - lowerLimit)) * 100) : 0)}%` }}></div>
              </div>
            </div>
            <div className="resource-block">
              <div className="resource-header">
                <span className="resource-icon">⚠️</span>
                <span className="resource-label">Risk Index</span>
              </div>
              <div className="resource-value mono">{risk}<span className="resource-sub">%</span></div>
              <div className="resource-bar-bg">
                <div className={`resource-bar-fill risk ${risk > 70 ? 'danger' : ''}`} style={{ width: `${risk}%` }}></div>
              </div>
            </div>
          </div>

          <div className="tools-section">
            <div className="section-header">
              <h3 className="section-title">Manipulation Tools</h3>
              {toolsLocked ? (
                <span className="section-info lock-badge">监管锁定 · 剩余 {lockRemaining} tick</span>
              ) : (
                <span className="section-info">成本随市值动态调整</span>
              )}
            </div>

            <div className="tools-grid-v2">
              {tools.map((tool) => {
                const power = powerMap[tool.id];
                const preview = previewMap[tool.id];
                const { cost, riskIncrease, effectLabel } = preview;
                const tooExpensive = cash < cost;
                const blocked = (tool.id === 'pump' && isUpperLimit)
                             || (tool.id === 'press' && isLowerLimit);
                const disabled = tooExpensive || blocked || toolsLocked || executingId !== null;
                const isFlashing = flashTool === tool.id;
                const isExecuting = executingId === tool.id;
                const btnLabel = isExecuting ? '执行中…'
                  : toolsLocked ? `锁定 ${lockRemaining}t`
                  : tooExpensive ? '资金不足'
                  : blocked ? (tool.id === 'pump' ? '已涨停' : '已跌停')
                  : executingId ? '请稍候'
                  : 'Use';
                return (
                  <div
                    key={tool.id}
                    className={`tool-card-v2 ${disabled ? 'disabled' : ''} ${isFlashing ? `flash-${feedback?.kind}` : ''}`}
                    style={{ '--accent': tool.accent, '--icon-bg': tool.iconBg } as CSSProperties}
                  >
                    <div className="tool-icon-v2">{tool.icon}</div>

                    <div className="tool-label-v2">
                      <span className="tool-label-en">{tool.label}</span>
                      <span className="tool-label-cn">{tool.cn}</span>
                    </div>

                    <div className="tool-desc-v2">{tool.description}</div>

                    <div className="tool-stats-v2">
                      <div className="tool-stat">
                        <span className="tool-stat-label">成本</span>
                        <span className={`tool-stat-val mono ${tooExpensive ? 'expensive' : ''}`}>{formatDealerCost(cost)}</span>
                      </div>
                      <div className="tool-stat">
                        <span className="tool-stat-label">风险</span>
                        <span className="tool-stat-val mono">+{riskIncrease.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="tool-effect">{effectLabel}</div>

                    <div className="tool-power-row">
                      <input
                        type="range"
                        className="tool-power-slider"
                        min={10}
                        max={100}
                        step={5}
                        value={power}
                        onChange={(e) => updatePower(tool.id, Number(e.target.value))}
                        disabled={disabled}
                      />
                      <span className="tool-power-pct mono">{power}%</span>
                    </div>

                    <button
                      type="button"
                      className="tool-use-btn"
                      onClick={() => handleUseTool(tool)}
                      disabled={disabled}
                    >
                      {btnLabel}
                    </button>
                  </div>
                );
              })}
            </div>

            {feedback && (
              <div className={`tools-feedback ${feedback.kind}`}>{feedback.msg}</div>
            )}
          </div>

          <div className="info-section">
            <div className="section-header">
              <h3 className="section-title">Information Privilege</h3>
              <span className="section-info badge">DEALER ONLY</span>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <span>📊 Real Financials</span>
                <span className="info-card-tag">{symbol}</span>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Revenue</span>
                  <span className="info-value mono">{fin?.revenue ?? '—'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Net Profit</span>
                  <span className="info-value mono up">{fin?.profit ?? '—'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">EPS</span>
                  <span className="info-value mono">{fin?.eps ?? '—'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">P/E Ratio</span>
                  <span className="info-value mono">{fin?.pe ?? '—'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Dividend</span>
                  <span className="info-value mono up">{fin?.dividend ?? '—'}</span>
                </div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <span>👔 Insider Trading</span>
                <span className="info-card-tag">{insiderTrades.length} Recent</span>
              </div>
              <div className="info-card-body">
                {insiderTrades.map((t) => {
                  const value = t.shares * currentQuote.price;
                  return (
                    <div key={t.name} className={`insider-row ${t.up ? 'up' : 'down'}`}>
                      <span className="insider-action">{t.action}</span>
                      <span className="insider-name">{t.name}</span>
                      <span className="insider-amount mono">{t.up ? '+' : '-'}{fmtFlow(value)}</span>
                      <span className="insider-time">{t.days}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <span>📊 Quant Fund Flow</span>
                <span className="info-card-tag">Real-time</span>
              </div>
              <div className="info-card-body">
                {quantFlows.map((f) => (
                  <div key={f.source} className="flow-row">
                    <span className="flow-source">{f.source}</span>
                    <span className={`flow-direction ${f.up ? 'up' : 'down'}`}>{f.dir}</span>
                    <span className={`flow-amount mono ${f.up ? 'up' : 'down'}`}>
                      {f.up ? '+' : '-'}{fmtFlow(f.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

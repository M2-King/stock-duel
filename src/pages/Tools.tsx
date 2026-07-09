import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import TradePanel from './TradePanel';
import DealerPanelPage from './DealerPanel';
import RegulatorPanelPage from './RegulatorPanel';
import { formatStockMetaLine } from '../shared/stockMeta';
import { previewDealerAction, formatDealerCost, formatDealerEffectLabel } from '../shared/dealerFormulas';
import './Tools.css';

/**
 * Tools 页：双模式
 *  - 已经在对局中（matchId 已分配 + role 已确定）→ 直接渲染角色对应的对局面板
 *  - 还没加入对局 → 渲染原 Tools 选择页
 */
export default function Tools() {
  const { role, indicators, allStocks, selectSymbol, matchId, gameStatus } = useGameStore();

  const inMatch = !!matchId && (gameStatus === 'playing' || gameStatus === 'matching' || gameStatus === 'reversed');
  if (inMatch) {
    if (role === 'dealer') return <DealerPanelPage />;
    if (role === 'regulator') return <RegulatorPanelPage />;
    return <TradePanel />;
  }

  return <ToolsLobby role={role} indicators={indicators} allStocks={allStocks} selectSymbol={selectSymbol} />;
}

const DEALER_TOOL_IDS = ['pump', 'press', 'accumulate', 'distribute', 'wash', 'fake'] as const;
type DealerToolId = typeof DEALER_TOOL_IDS[number];

function ToolsLobby({
  role, indicators, allStocks, selectSymbol,
}: {
  role: 'dealer' | 'retail' | 'regulator';
  indicators: any;
  allStocks: any[];
  selectSymbol: (s: string) => void;
}) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const executeDealerAction = useGameStore((s) => s.executeDealerAction);
  const startSoloMatch = useGameStore((s) => s.startSoloMatch);
  const dealerResources = useGameStore((s) => s.dealerResources);
  const currentSymbol = useGameStore((s) => s.currentQuote.symbol);
  const dealerCash = dealerResources?.cash ?? 50_000_000;
  const power = 50;

  const flashFeedback = (kind: 'success' | 'error' | 'info', msg: string) => {
    setFeedback({ kind, msg });
    setTimeout(() => setFeedback(null), 2500);
  };

  const runDealerTool = async (toolId: string) => {
    const preview = previewDealerAction(toolId, currentSymbol, power);
    const state = useGameStore.getState();
    if (!state.matchId && state.backendMode) {
      flashFeedback('info', '未入对局，先自动开一局 solo…');
      await startSoloMatch();
      await new Promise((r) => setTimeout(r, 1200));
      const after = useGameStore.getState();
      if (!after.matchId) {
        flashFeedback('error', '自动开对局失败，请检查后端连接');
        return;
      }
    }
    const res = await Promise.resolve(executeDealerAction({
      type: toolId,
      power,
      cost: preview.cost,
    }));
    if (res?.success) flashFeedback('success', `${toolId} 已执行`);
    else flashFeedback('error', res?.error || '执行失败');
  };

  const dealerTools = [
    { id: 'pump' as DealerToolId, label: 'Price Pump', icon: '📈', description: '人工推动价格上涨' },
    { id: 'press' as DealerToolId, label: 'Price Press', icon: '📉', description: '人工压低价格' },
    { id: 'accumulate' as DealerToolId, label: 'Accumulate', icon: '🛒', description: '低位吸筹' },
    { id: 'distribute' as DealerToolId, label: 'Distribute', icon: '📤', description: '高位出货' },
    { id: 'wash' as DealerToolId, label: 'Wash Trade', icon: '🔄', description: '对敲操作' },
    { id: 'fake' as DealerToolId, label: 'Fake Order', icon: '🎭', description: '假挂单' },
  ];

  const retailTools = [
    { id: 'limit', label: 'Limit Order', icon: '⏸', description: '限价委托' },
    { id: 'stop', label: 'Stop Loss', icon: '🛑', description: '止损' },
    { id: 'short', label: 'Short Sell', icon: '📉', description: '融券做空' },
    { id: 'margin', label: 'Margin', icon: '💳', description: '融资融券' },
    { id: 'buy_insider', label: 'Buy Insider', icon: '🕵️', description: '购买内幕消息' },
    { id: 'alert', label: 'Price Alert', icon: '🔔', description: '价格提醒' },
  ];

  const regulatorTools = [
    { id: 'investigate', label: 'Investigate', icon: '🔍', description: '调查可疑活动' },
    { id: 'freeze', label: 'Freeze Account', icon: '🔒', description: '冻结账户' },
    { id: 'warn', label: 'Send Warning', icon: '⚠️', description: '发送警告' },
    { id: 'kick', label: 'Kick Player', icon: '🚫', description: '踢出对局' },
    { id: 'audit', label: 'Audit Log', icon: '📋', description: '查看审计日志' },
    { id: 'broadcast', label: 'Broadcast', icon: '📢', description: '公开发布信息' },
  ];

  const tools = role === 'dealer' ? dealerTools : role === 'regulator' ? regulatorTools : retailTools;
  const roleLabel = role === 'dealer' ? 'Market Manipulation' : role === 'regulator' ? 'Regulatory Actions' : 'Trading Tools';

  const handleToolClick = (toolId: string) => {
    setActiveTool(activeTool === toolId ? null : toolId);
  };

  return (
    <div className="tools-page">
      <div className="tools-header">
        <h2 className="tools-title">{roleLabel}</h2>
        <span className="tools-subtitle">
          {role === 'dealer'
            ? 'Powered by server-side price engine'
            : role === 'regulator'
              ? 'Real-time oversight and enforcement'
              : 'Advanced trading capabilities'}
        </span>
      </div>

      {role === 'dealer' && (
        <div className="stock-meta-bar" style={{
          marginBottom: 12,
          padding: '8px 12px',
          borderRadius: 6,
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          fontSize: 13,
          color: 'var(--text-secondary, #94a3b8)',
        }}>
          {formatStockMetaLine(currentSymbol)}
        </div>
      )}

      <div className="tools-grid">
        {tools.map(tool => {
          const isDealerTool = role === 'dealer' && DEALER_TOOL_IDS.includes(tool.id as DealerToolId);
          const preview = isDealerTool
            ? previewDealerAction(tool.id, currentSymbol, power)
            : null;
          const cost = preview?.cost ?? 0;
          const tooExpensive = isDealerTool && dealerCash < cost;
          const effectLabel = preview ? formatDealerEffectLabel(tool.id, preview.effectPct) : '';

          return (
            <button
              key={tool.id}
              className={`tool-card ${activeTool === tool.id ? 'active' : ''} ${tooExpensive ? 'disabled' : ''}`}
              disabled={tooExpensive}
              onClick={() => {
                handleToolClick(tool.id);
                if (role === 'dealer') {
                  if (tooExpensive) {
                    flashFeedback('error', '资金不足');
                    return;
                  }
                  runDealerTool(tool.id);
                }
              }}
            >
              <div className="tool-icon-large">{tool.icon}</div>
              <div className="tool-info">
                <div className="tool-name">{tool.label}</div>
                <div className="tool-desc">{tool.description}</div>
                {isDealerTool && preview && (
                  <>
                    <div className="tool-cost">
                      <span>Cost:</span>
                      <span className={`mono ${tooExpensive ? 'expensive' : ''}`}>{formatDealerCost(cost)}</span>
                    </div>
                    <div className="tool-cost">
                      <span>Effect:</span>
                      <span className="mono">{effectLabel}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="tool-status">
                <span className={`status-dot ${tooExpensive ? '' : 'ready'}`}></span>
                <span>{tooExpensive ? '资金不足' : role === 'dealer' ? 'Click to Run' : 'Ready'}</span>
              </div>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="tools-feedback" style={{
          marginTop: 12,
          padding: '8px 12px',
          borderRadius: 6,
          background:
            feedback.kind === 'success' ? 'rgba(22, 163, 74, 0.15)' :
            feedback.kind === 'error' ? 'rgba(220, 38, 38, 0.15)' :
            'rgba(59, 130, 246, 0.15)',
          color:
            feedback.kind === 'success' ? '#22c55e' :
            feedback.kind === 'error' ? '#ef4444' :
            '#3b82f6',
          border: `1px solid ${
            feedback.kind === 'success' ? 'rgba(22, 163, 74, 0.3)' :
            feedback.kind === 'error' ? 'rgba(220, 38, 38, 0.3)' :
            'rgba(59, 130, 246, 0.3)'}`,
        }}>{feedback.msg}</div>
      )}

      <div className="indicators-section">
        <div className="section-header">
          <h3 className="section-title">Technical Indicators</h3>
          <span className="section-info">Real-time calculation</span>
        </div>

        <div className="indicators-grid">
          <div className="indicator-card">
            <div className="indicator-name">MA</div>
            <div className="indicator-values">
              <div className="iv-row"><span>MA5</span><span className="mono">{indicators.ma5.toFixed(2)}</span></div>
              <div className="iv-row"><span>MA10</span><span className="mono">{indicators.ma10.toFixed(2)}</span></div>
              <div className="iv-row"><span>MA20</span><span className="mono">{indicators.ma20.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="indicator-card">
            <div className="indicator-name">MACD</div>
            <div className="indicator-values">
              <div className="iv-row"><span>DIF</span><span className="mono">{indicators.macd.diff.toFixed(4)}</span></div>
              <div className="iv-row"><span>DEA</span><span className="mono">{indicators.macd.dea.toFixed(4)}</span></div>
              <div className="iv-row"><span>MACD</span><span className="mono">{indicators.macd.bar.toFixed(4)}</span></div>
            </div>
          </div>

          <div className="indicator-card">
            <div className="indicator-name">RSI</div>
            <div className="indicator-values">
              <div className="iv-row large"><span>Value</span><span className="mono">{indicators.rsi.toFixed(1)}</span></div>
              <div className="rsi-bar">
                <div className="rsi-track">
                  <div className="rsi-fill" style={{ width: `${indicators.rsi}%` }}></div>
                </div>
                <div className="rsi-labels">
                  <span>0</span>
                  <span className="signal-label">30</span>
                  <span className="signal-label">70</span>
                  <span>100</span>
                </div>
              </div>
            </div>
          </div>

          <div className="indicator-card">
            <div className="indicator-name">BOLL</div>
            <div className="indicator-values">
              <div className="iv-row"><span>Upper</span><span className="mono">{indicators.boll.upper.toFixed(2)}</span></div>
              <div className="iv-row"><span>Middle</span><span className="mono">{indicators.boll.middle.toFixed(2)}</span></div>
              <div className="iv-row"><span>Lower</span><span className="mono">{indicators.boll.lower.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="quick-picker">
        <div className="section-header">
          <h3 className="section-title">Quick Trade</h3>
          <span className="section-info">{allStocks.length} stocks available</span>
        </div>
        <div className="quick-stocks-list">
          {allStocks.slice(0, 12).map(s => (
            <button
              key={s.symbol}
              type="button"
              className="quick-stock-btn"
              onClick={() => {
                selectSymbol(s.symbol);
                useGameStore.setState({ currentSection: 'overview' });
              }}
            >
              <span className="qs-symbol mono">{s.symbol}</span>
              <span className="qs-price mono">${s.price.toFixed(2)}</span>
              <span className={`qs-change mono ${s.changePercent >= 0 ? 'up' : 'down'}`}>
                {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

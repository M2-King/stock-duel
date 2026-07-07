import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import MarketChart from '../components/MarketChart';
import './DealerPanelPage.css';

type ToolType = 'pump' | 'press' | 'accumulate' | 'distribute' | 'wash' | 'fake';

interface Tool {
  id: ToolType;
  label: string;
  description: string;
  cost: number;
  energy: number;
  risk: number;
  icon: string;
}

const tools: Tool[] = [
  { id: 'pump', label: 'Pump', description: '涨价操作', cost: 1000000, energy: 15, risk: 10, icon: '📈' },
  { id: 'press', label: 'Press', description: '压价操作', cost: 1000000, energy: 15, risk: 10, icon: '📉' },
  { id: 'accumulate', label: 'Accumulate', description: '低位吸筹', cost: 800000, energy: 12, risk: 5, icon: '🛒' },
  { id: 'distribute', label: 'Distribute', description: '高位出货', cost: 800000, energy: 12, risk: 5, icon: '📤' },
  { id: 'wash', label: 'Wash Trade', description: '对敲交易', cost: 500000, energy: 8, risk: 25, icon: '🔄' },
  { id: 'fake', label: 'Fake Order', description: '假挂单', cost: 200000, energy: 5, risk: 15, icon: '🎭' },
];

// These coefficients MUST mirror executeDealerAction() in src/store/gameStore.ts.
// Price move: pump/press = ±0.003*power (=0.3*power %), distribute = -0.001*power (=0.1*power %).
// Volume bump (fraction of intensity=power/100): accumulate 0.5, distribute 0.4, wash 1.5 → %=coef*power.
// Net cash cost multiplier (extraCashEffect): accumulate spends 1.5×base, distribute nets 0.4×base, others 1×.
function toolEffectLabel(id: ToolType, power: number): string {
  switch (id) {
    case 'pump':
      return `+${(0.3 * power).toFixed(1)}%`;
    case 'press':
      return `−${(0.3 * power).toFixed(1)}%`;
    case 'distribute':
      return `价 −${(0.1 * power).toFixed(1)}% · 量 +${(0.4 * power).toFixed(0)}%`;
    case 'accumulate':
      return `量 +${(0.5 * power).toFixed(0)}%`;
    case 'wash':
      return `量 +${(1.5 * power).toFixed(0)}%`;
    case 'fake':
      return '卖一挂单 ×8';
  }
}

function netCostFactor(id: ToolType): number {
  if (id === 'accumulate') return 1.5;
  if (id === 'distribute') return 0.4;
  return 1;
}

export default function DealerPanelPage() {
  const { currentQuote, dealerResources, cash: playerCash, insiderData, executeDealerAction } = useGameStore();
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [power, setPower] = useState(50);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const cash = dealerResources?.cash ?? playerCash;
  const energy = dealerResources?.energy ?? 100;
  const risk = dealerResources?.riskIndex ?? 0;

  // ---- Live "information privilege" data (no hardcoded financials) ----
  // Real financials come straight from the store's insiderData.
  const fin = insiderData;
  const priceUp = currentQuote.change >= 0;
  // Fund-flow figures derive from live turnover (volume × price) and price
  // direction, so the panel reflects real market data instead of static literals.
  const turnover = currentQuote.volume * currentQuote.price;
  const fmtFlow = (v: number) => `¥${(v / 1e6).toFixed(1)}M`;
  const quantFlows = [
    { source: 'Main Capital', dir: priceUp ? 'IN' : 'OUT', amount: turnover * 0.00016, up: priceUp },
    { source: 'Retail Flow', dir: priceUp ? 'IN' : 'OUT', amount: turnover * 0.00005, up: priceUp },
    { source: 'Foreign Inst.', dir: priceUp ? 'IN' : 'OUT', amount: turnover * 0.0001, up: priceUp },
    { source: 'Hedge Funds', dir: priceUp ? 'OUT' : 'IN', amount: turnover * 0.00003, up: !priceUp },
  ];
  // Insider trades scaled from the live share price.
  const insiderTrades = [
    { action: 'BUY', name: 'CEO', shares: 50000, up: true, days: '2d' },
    { action: 'SELL', name: 'CFO', shares: 26000, up: false, days: '3d' },
    { action: 'BUY', name: 'Director', shares: 19000, up: true, days: '5d' },
    { action: 'SELL', name: 'VP Eng', shares: 9500, up: false, days: '7d' },
  ];

  const flashFeedback = (kind: 'success' | 'error', msg: string) => {
    setFeedback({ kind, msg });
    setTimeout(() => setFeedback(null), 2500);
  };
  
  return (
    <div className="dealer-page">
      <div className="dealer-layout">
        <div className="dealer-chart">
          <MarketChart compact />
        </div>
        <div className="dealer-side">
      {/* Resources Bar */}
      <div className="dealer-resources">
        <div className="resource-block large">
          <div className="resource-header">
            <span className="resource-icon">💰</span>
            <span className="resource-label">Capital Pool</span>
          </div>
          <div className="resource-value mono">¥{cash.toLocaleString()}</div>
          <div className="resource-bar-bg">
            <div className="resource-bar-fill" style={{ width: '60%' }}></div>
          </div>
        </div>
        
        <div className="resource-block">
          <div className="resource-header">
            <span className="resource-icon">⚡</span>
            <span className="resource-label">Energy</span>
          </div>
          <div className="resource-value mono">{energy}<span className="resource-sub">/100</span></div>
          <div className="resource-bar-bg">
            <div className="resource-bar-fill energy" style={{ width: `${energy}%` }}></div>
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

      {/* Main Content */}
      <div className="dealer-content">
        {/* Tools */}
        <div className="tools-section">
          <div className="section-header">
            <h3 className="section-title">Manipulation Tools</h3>
            <span className="section-info">6 Tools Available</span>
          </div>
          
          <div className="tools-grid">
            {tools.map((tool) => (
              <button
                key={tool.id}
                className={`tool-card ${selectedTool?.id === tool.id ? 'selected' : ''}`}
                onClick={() => setSelectedTool(tool)}
              >
                <div className="tool-icon">{tool.icon}</div>
                <div className="tool-label">{tool.label}</div>
                <div className="tool-desc">{tool.description}</div>
                <div className="tool-stats">
                  <span className="tool-cost mono">¥{(tool.cost / 10000).toFixed(0)}万</span>
                  <span className="tool-energy mono">⚡{tool.energy}</span>
                  <span className="tool-risk mono">⚠{tool.risk}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Power Control */}
          {selectedTool && (
            <div className="power-control">
              <div className="power-header">
                <span className="power-label">Execute {selectedTool.label}</span>
                <span className="power-value mono">{power}%</span>
              </div>
              <input 
                type="range" 
                className="power-slider"
                min="10" 
                max="100" 
                value={power}
                onChange={(e) => setPower(Number(e.target.value))}
              />
              <div className="power-meta">
                <div className="meta-item">
                  <span className="meta-label">Effect</span>
                  <span className="meta-value">{toolEffectLabel(selectedTool.id, power)}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Cost</span>
                  <span className="meta-value mono">¥{((selectedTool.cost * power) / 100 * netCostFactor(selectedTool.id) / 10000).toFixed(1)}万</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Risk</span>
                  <span className="meta-value mono">+{((selectedTool.risk * power) / 100).toFixed(1)}</span>
                </div>
              </div>
              {feedback && (
                <div className={`order-feedback ${feedback.kind}`} style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  marginBottom: 8,
                  background: feedback.kind === 'success' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                  color: feedback.kind === 'success' ? '#22c55e' : '#ef4444',
                  border: `1px solid ${feedback.kind === 'success' ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`,
                }}>{feedback.msg}</div>
              )}
              <button
                type="button"
                className="execute-btn"
                onClick={() => {
                  if (!selectedTool) return;
                  const cost = selectedTool.cost * power / 100;
                  const energyCost = selectedTool.energy * power / 100;
                  if (cash < cost) {
                    flashFeedback('error', `资金不足：需要 ¥${cost.toFixed(0)}，可用 ¥${cash.toFixed(0)}`);
                    return;
                  }
                  if (energy < energyCost) {
                    flashFeedback('error', `能量不足：需要 ${energyCost.toFixed(0)}，可用 ${energy.toFixed(0)}`);
                    return;
                  }
                  const result = executeDealerAction({
                    type: selectedTool.id,
                    cost,
                    energy: energyCost,
                    risk: selectedTool.risk * power / 100,
                    power,
                  });
                  if (result.success) {
                    flashFeedback('success', `${selectedTool.label} 执行成功（${power}% 强度）`);
                    setPower(50);
                  } else {
                    flashFeedback('error', result.error || '执行失败');
                  }
                }}
              >
                Execute Operation
              </button>
            </div>
          )}
        </div>

        {/* Hidden Info Panel */}
        <div className="info-section">
          <div className="section-header">
            <h3 className="section-title">Information Privilege</h3>
            <span className="section-info badge">DEALER ONLY</span>
          </div>
          
          {/* Real Financials */}
          <div className="info-card">
            <div className="info-card-header">
              <span>📊 Real Financials</span>
              <span className="info-card-tag">{currentQuote.symbol}</span>
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
          
          {/* Insider Trading */}
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
          
          {/* Quant Flow */}
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
    </div>
  );
}

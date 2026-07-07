import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { DealerActionType } from '../../types';
import './DealerPanel.css';

interface ToolConfig {
  type: DealerActionType;
  label: string;
  icon: string;
  description: string;
  cost: number;
  energyCost: number;
  riskIncrease: number;
}

const tools: ToolConfig[] = [
  { 
    type: 'pump', 
    label: '拉升', 
    icon: '📈', 
    description: '拉高股价',
    cost: 5000000,
    energyCost: 15,
    riskIncrease: 10,
  },
  { 
    type: 'press', 
    label: '打压', 
    icon: '📉', 
    description: '压低股价',
    cost: 5000000,
    energyCost: 15,
    riskIncrease: 10,
  },
  { 
    type: 'accumulate', 
    label: '吸筹', 
    icon: '🛒', 
    description: '低位吸筹',
    cost: 8000000,
    energyCost: 20,
    riskIncrease: 5,
  },
  { 
    type: 'distribute', 
    label: '出货', 
    icon: '📤', 
    description: '高位出货',
    cost: 8000000,
    energyCost: 20,
    riskIncrease: 5,
  },
  { 
    type: 'wash', 
    label: '对敲', 
    icon: '🔄', 
    description: '对倒交易',
    cost: 3000000,
    energyCost: 10,
    riskIncrease: 20,
  },
  { 
    type: 'fakeOrder', 
    label: '假挂单', 
    icon: '🎭', 
    description: '虚假挂单',
    cost: 1000000,
    energyCost: 5,
    riskIncrease: 15,
  },
];

export default function DealerPanel() {
  const { dealerInfo, currentQuote, playerCash } = useGameStore();
  const [selectedTool, setSelectedTool] = useState<DealerActionType | null>(null);
  const [power, setPower] = useState(50);

  const resources = dealerInfo?.resources || {
    cash: playerCash,
    energy: 100,
    riskIndex: 0,
    totalAssets: playerCash,
  };

  const handleToolClick = (tool: ToolConfig) => {
    if (resources.cash >= tool.cost && resources.energy >= tool.energyCost) {
      setSelectedTool(tool.type);
    }
  };

  const handleExecute = () => {
    if (!selectedTool) return;
    // Execute action logic would go here
    console.log('Executing:', selectedTool, 'with power:', power);
  };

  const formatMoney = (amount: number) => {
    if (amount >= 100000000) return (amount / 100000000).toFixed(2) + '亿';
    if (amount >= 10000) return (amount / 10000).toFixed(0) + '万';
    return amount.toFixed(0);
  };

  return (
    <div className="dealer-panel">
      {/* Header Stats */}
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="title-icon">🏦</span>
          庄家控制台
        </h2>
        
        <div className="resources-bar">
          <div className="resource-item">
            <span className="resource-label">资金池</span>
            <span className="resource-value number">{formatMoney(resources.cash)}</span>
          </div>
          <div className="resource-item">
            <span className="resource-label">能量</span>
            <div className="resource-bar">
              <div 
                className="resource-fill energy" 
                style={{ width: `${resources.energy}%` }}
              ></div>
            </div>
            <span className="resource-value">{resources.energy}/100</span>
          </div>
          <div className="resource-item">
            <span className="resource-label">风险指数</span>
            <div className="resource-bar">
              <div 
                className={`resource-fill risk ${resources.riskIndex > 70 ? 'danger' : ''}`}
                style={{ width: `${resources.riskIndex}%` }}
              ></div>
            </div>
            <span className="resource-value">{resources.riskIndex}%</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="panel-content">
        {/* Left: Tools */}
        <div className="tools-section">
          <h3 className="section-title">操盘工具</h3>
          
          <div className="tools-grid">
            {tools.map((tool) => {
              const canUse = resources.cash >= tool.cost && resources.energy >= tool.energyCost;
              return (
                <button
                  key={tool.type}
                  className={`tool-card ${selectedTool === tool.type ? 'active' : ''} ${!canUse ? 'disabled' : ''}`}
                  onClick={() => handleToolClick(tool)}
                  disabled={!canUse}
                >
                  <span className="tool-icon">{tool.icon}</span>
                  <span className="tool-label">{tool.label}</span>
                  <span className="tool-cost">{formatMoney(tool.cost)}</span>
                  <span className="tool-energy">{tool.energyCost}⚡</span>
                </button>
              );
            })}
          </div>

          {/* Power Slider */}
          {selectedTool && (
            <div className="power-control">
              <label className="power-label">
                操盘力度: <span className="power-value">{power}%</span>
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={power}
                onChange={(e) => setPower(Number(e.target.value))}
                className="power-slider"
              />
              <div className="power-info">
                <span>消耗: {formatMoney(tools.find(t => t.type === selectedTool)?.cost || 0)}</span>
                <span>能量: -{tools.find(t => t.type === selectedTool)?.energyCost || 0}</span>
                <span>风险: +{tools.find(t => t.type === selectedTool)?.riskIncrease || 0}%</span>
              </div>
              <button className="execute-btn" onClick={handleExecute}>
                执行操作
              </button>
            </div>
          )}
        </div>

        {/* Right: Hidden Info */}
        <div className="info-section">
          {/* Financial Data */}
          <div className="info-card">
            <h3 className="card-title">
              <span className="card-icon">📊</span>
              真实财报
            </h3>
            {dealerInfo?.hiddenInfo.realFinancials && (
              <div className="financial-data">
                <div className="data-row">
                  <span className="data-label">营业收入</span>
                  <span className="data-value number">{formatMoney(dealerInfo.hiddenInfo.realFinancials.revenue)}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">净利润</span>
                  <span className="data-value number">{formatMoney(dealerInfo.hiddenInfo.realFinancials.profit)}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">市盈率</span>
                  <span className="data-value number">{dealerInfo.hiddenInfo.realFinancials.pe.toFixed(1)}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">市净率</span>
                  <span className="data-value number">{dealerInfo.hiddenInfo.realFinancials.pb.toFixed(2)}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">股息率</span>
                  <span className="data-value number">{dealerInfo.hiddenInfo.realFinancials.dividend.toFixed(2)}%</span>
                </div>
                <div className="data-row">
                  <span className="data-label">季度</span>
                  <span className="data-value">{dealerInfo.hiddenInfo.realFinancials.quarter}</span>
                </div>
              </div>
            )}
          </div>

          {/* Insider Trading */}
          <div className="info-card">
            <h3 className="card-title">
              <span className="card-icon">💼</span>
              内部交易
            </h3>
            <div className="insider-list">
              {dealerInfo?.hiddenInfo.insiderTrading.map((info, i) => (
                <div key={i} className={`insider-item ${info.isFake ? 'fake' : ''}`}>
                  <span className={`insider-type ${info.type}`}>
                    {info.type === 'buy' ? '买入' : '卖出'}
                  </span>
                  <span className="insider-amount number">{formatMoney(info.amount)}</span>
                  <span className="insider-ratio">{(info.ratio * 100).toFixed(1)}%</span>
                  {info.isFake && <span className="insider-fake-tag">疑似假</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Quant Flow */}
          <div className="info-card">
            <h3 className="card-title">
              <span className="card-icon">🌊</span>
              资金流向
            </h3>
            {dealerInfo?.hiddenInfo.quantFlow && (
              <div className="flow-data">
                <div className="flow-item">
                  <span className="flow-label">主力</span>
                  <span className={`flow-direction ${dealerInfo.hiddenInfo.quantFlow.main.direction}`}>
                    {dealerInfo.hiddenInfo.quantFlow.main.direction === 'in' ? '流入' : 
                     dealerInfo.hiddenInfo.quantFlow.main.direction === 'out' ? '流出' : '持平'}
                  </span>
                  <span className="flow-amount number">{formatMoney(dealerInfo.hiddenInfo.quantFlow.main.amount)}</span>
                </div>
                <div className="flow-item">
                  <span className="flow-label">散户</span>
                  <span className={`flow-direction ${dealerInfo.hiddenInfo.quantFlow.retail.direction}`}>
                    {dealerInfo.hiddenInfo.quantFlow.retail.direction === 'in' ? '流入' : 
                     dealerInfo.hiddenInfo.quantFlow.retail.direction === 'out' ? '流出' : '持平'}
                  </span>
                  <span className="flow-amount number">{formatMoney(dealerInfo.hiddenInfo.quantFlow.retail.amount)}</span>
                </div>
                <div className="flow-item">
                  <span className="flow-label">外资</span>
                  <span className={`flow-direction ${dealerInfo.hiddenInfo.quantFlow.foreign.direction}`}>
                    {dealerInfo.hiddenInfo.quantFlow.foreign.direction === 'in' ? '流入' : 
                     dealerInfo.hiddenInfo.quantFlow.foreign.direction === 'out' ? '流出' : '持平'}
                  </span>
                  <span className="flow-amount number">{formatMoney(dealerInfo.hiddenInfo.quantFlow.foreign.amount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

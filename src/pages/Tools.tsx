import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './Tools.css';

export default function Tools() {
  const { role, indicators, allStocks, selectSymbol } = useGameStore();
  const [activeTool, setActiveTool] = useState<string | null>(null);
  
  const dealerTools = [
    { id: 'pump', label: 'Price Pump', icon: '📈', description: '人工推动价格上涨', cost: '¥5M' },
    { id: 'press', label: 'Price Press', icon: '📉', description: '人工压低价格', cost: '¥5M' },
    { id: 'accumulate', label: 'Accumulate', icon: '🛒', description: '低位吸筹', cost: '¥8M' },
    { id: 'distribute', label: 'Distribute', icon: '📤', description: '高位出货', cost: '¥8M' },
    { id: 'wash', label: 'Wash Trade', icon: '🔄', description: '对敲操作', cost: '¥3M' },
    { id: 'fake', label: 'Fake Order', icon: '🎭', description: '假挂单', cost: '¥1M' },
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
      
      <div className="tools-grid">
        {tools.map(tool => (
          <button
            key={tool.id}
            className={`tool-card ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => handleToolClick(tool.id)}
          >
            <div className="tool-icon-large">{tool.icon}</div>
            <div className="tool-info">
              <div className="tool-name">{tool.label}</div>
              <div className="tool-desc">{tool.description}</div>
              {'cost' in tool && (
                <div className="tool-cost">
                  <span>Cost:</span>
                  <span className="mono">{(tool as { cost: string }).cost}</span>
                </div>
              )}
            </div>
            <div className="tool-status">
              <span className="status-dot ready"></span>
              <span>Ready</span>
            </div>
          </button>
        ))}
      </div>
      
      {/* Technical Indicators Section (for all roles) */}
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
      
      {/* Quick Stock Picker */}
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

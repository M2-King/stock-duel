import { useGameStore } from '../../store/gameStore';
import './RegulatorPanel.css';

export default function RegulatorPanel() {
  const { currentQuote, alerts, scores, playerCash, currentDay, currentTick } = useGameStore();

  const formatMoney = (amount: number) => {
    if (amount >= 100000000) return (amount / 100000000).toFixed(2) + '亿';
    if (amount >= 10000) return (amount / 10000).toFixed(0) + '万';
    return amount.toFixed(0);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'var(--color-danger)';
      case 'medium': return 'var(--color-warning)';
      default: return 'var(--color-info)';
    }
  };

  const mockPlayers = [
    { id: '1', name: '庄家', role: 'dealer', assets: 102500000, change: 2.5 },
    { id: '2', name: '散户', role: 'retail', assets: 98500000, change: -1.5 },
  ];

  return (
    <div className="regulator-panel">
      {/* Header Stats */}
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="title-icon">⚖️</span>
          监管控制台
        </h2>
        
        <div className="regulator-stats">
          <div className="stat-item">
            <span className="stat-label">交易日</span>
            <span className="stat-value">第{currentDay}天</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">当前Tick</span>
            <span className="stat-value">{currentTick}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">当前股价</span>
            <span className="stat-value number">{currentQuote.price.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="panel-content">
        {/* Left: Player Data & Scores */}
        <div className="data-section">
          {/* Player Comparison */}
          <div className="data-card">
            <h3 className="card-title">
              <span className="card-icon">👥</span>
              玩家资产
            </h3>
            
            <div className="players-list">
              {mockPlayers.map(player => (
                <div key={player.id} className="player-row">
                  <div className="player-info">
                    <span className={`player-role ${player.role}`}>
                      {player.role === 'dealer' ? '🏦' : '📈'}
                    </span>
                    <span className="player-name">{player.name}</span>
                  </div>
                  <div className="player-assets">
                    <span className="assets-value number">{formatMoney(player.assets)}</span>
                    <span className={`assets-change ${player.change >= 0 ? 'up' : 'down'}`}>
                      {player.change >= 0 ? '+' : ''}{player.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Scores */}
          <div className="data-card">
            <h3 className="card-title">
              <span className="card-icon">📊</span>
              违规指数
            </h3>
            
            <div className="scores-list">
              <div className="score-item">
                <div className="score-header">
                  <span className="score-label">操纵指数</span>
                  <span className={`score-value ${scores.manipulation > 50 ? 'danger' : ''}`}>
                    {scores.manipulation.toFixed(1)}
                  </span>
                </div>
                <div className="score-bar">
                  <div 
                    className="score-fill manipulation"
                    style={{ width: `${Math.min(scores.manipulation, 100)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="score-item">
                <div className="score-header">
                  <span className="score-label">内幕交易指数</span>
                  <span className={`score-value ${scores.insider > 50 ? 'danger' : ''}`}>
                    {scores.insider.toFixed(1)}
                  </span>
                </div>
                <div className="score-bar">
                  <div 
                    className="score-fill insider"
                    style={{ width: `${Math.min(scores.insider, 100)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="score-item">
                <div className="score-header">
                  <span className="score-label">虚假信息指数</span>
                  <span className={`score-value ${scores.misinformation > 50 ? 'danger' : ''}`}>
                    {scores.misinformation.toFixed(1)}
                  </span>
                </div>
                <div className="score-bar">
                  <div 
                    className="score-fill misinformation"
                    style={{ width: `${Math.min(scores.misinformation, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Market Stats */}
          <div className="data-card">
            <h3 className="card-title">
              <span className="card-icon">📈</span>
              市场数据
            </h3>
            
            <div className="market-stats">
              <div className="market-row">
                <span className="market-label">股价</span>
                <span className="market-value number">{currentQuote.price.toFixed(2)}</span>
              </div>
              <div className="market-row">
                <span className="market-label">涨跌幅</span>
                <span className={`market-value number ${currentQuote.change >= 0 ? 'up' : 'down'}`}>
                  {currentQuote.changePercent >= 0 ? '+' : ''}{currentQuote.changePercent.toFixed(2)}%
                </span>
              </div>
              <div className="market-row">
                <span className="market-label">成交量</span>
                <span className="market-value number">{formatMoney(currentQuote.volume)}</span>
              </div>
              <div className="market-row">
                <span className="market-label">成交额</span>
                <span className="market-value number">{formatMoney(currentQuote.amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Alerts */}
        <div className="alerts-section">
          <div className="alerts-card">
            <h3 className="card-title">
              <span className="card-icon">🚨</span>
              异常告警
              <span className="alert-count">{alerts.length}</span>
            </h3>
            
            <div className="alerts-list">
              {alerts.length === 0 ? (
                <div className="no-alerts">
                  <span className="no-alerts-icon">✅</span>
                  <span>暂未检测到异常</span>
                </div>
              ) : (
                alerts.slice(0, 10).map(alert => (
                  <div 
                    key={alert.id} 
                    className={`alert-item ${alert.severity}`}
                    style={{ '--severity-color': getSeverityColor(alert.severity) } as React.CSSProperties}
                  >
                    <div className="alert-header">
                      <span className={`alert-severity ${alert.severity}`}>
                        {alert.severity === 'high' ? '严重' : alert.severity === 'medium' ? '警告' : '提示'}
                      </span>
                      <span className="alert-type">
                        {alert.type === 'pump' ? '连续拉升' : 
                         alert.type === 'fake_order' ? '可疑挂单' : 
                         alert.type === 'wash_trade' ? '对敲交易' : '内幕交易'}
                      </span>
                    </div>
                    <p className="alert-description">{alert.description}</p>
                    <div className="alert-actions">
                      <button className="alert-btn warning">警告</button>
                      <button className="alert-btn freeze">冻结</button>
                      <button className="alert-btn kick">踢出</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './RegulatorPanel.css';

export default function RegulatorPanelPage() {
  const { alerts, regulatoryScores: scores, players, currentQuote, applyRegulatoryAction } = useGameStore();
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [lastAction, setLastAction] = useState<{ id: string; action: string } | null>(null);

  const filteredAlerts = filter === 'all'
    ? alerts.filter(a => !a.resolved)
    : alerts.filter(a => !a.resolved && a.severity === filter);
  
  return (
    <div className="regulator-page">
      {/* Top Stats */}
      <div className="regulator-stats-row">
        <div className="stats-card">
          <div className="stats-label">Manipulation Index</div>
          <div className="stats-value mono">{scores.manipulation.toFixed(1)}</div>
          <div className="stats-bar">
            <div className="stats-fill manipulation" style={{ width: `${Math.min(scores.manipulation, 100)}%` }}></div>
          </div>
        </div>
        <div className="stats-card">
          <div className="stats-label">Insider Trading Index</div>
          <div className="stats-value mono">{scores.insider.toFixed(1)}</div>
          <div className="stats-bar">
            <div className="stats-fill insider" style={{ width: `${Math.min(scores.insider, 100)}%` }}></div>
          </div>
        </div>
        <div className="stats-card">
          <div className="stats-label">Misinformation Index</div>
          <div className="stats-value mono">{scores.misinformation.toFixed(1)}</div>
          <div className="stats-bar">
            <div className="stats-fill misinformation" style={{ width: `${Math.min(scores.misinformation, 100)}%` }}></div>
          </div>
        </div>
      </div>

      <div className="regulator-content">
        {/* Players View */}
        <div className="players-section">
          <div className="section-header">
            <h3 className="section-title">Player Oversight</h3>
            <span className="section-info">All Activity Visible</span>
          </div>
          
          {players.map((player) => (
            <div key={player.id} className="player-card">
              <div className="player-header">
                <div className="player-role-badge">
                  <span className={`role-icon ${player.role}`}>
                    {player.role === 'dealer' ? '🏦' : player.role === 'retail' ? '📈' : '⚖️'}
                  </span>
                  <div>
                    <div className="player-name">{player.name}</div>
                    <div className="player-role-text">
                      {player.role === 'dealer' ? 'Market Maker' : 
                       player.role === 'retail' ? 'Retail Trader' : 'SEC Agent'}
                    </div>
                  </div>
                </div>
                <div className="player-balance">
                  <div className="player-balance-label">Total Assets</div>
                  <div className="player-balance-value mono">¥{(player.totalAssets / 10000).toFixed(0)}万</div>
                </div>
              </div>
              
              <div className="player-positions">
                <div className="position-row header">
                  <span>Symbol</span>
                  <span className="right">Positions</span>
                  <span className="right">Cash</span>
                  <span className="right">Risk</span>
                </div>
                {player.role === 'dealer' && (
                  <>
                    <div className="position-row">
                      <span className="bold">{currentQuote.symbol}</span>
                      <span className="right mono">+124,560</span>
                      <span className="right mono">¥{(player.cash / 10000).toFixed(0)}万</span>
                      <span className="right risk-tag">32%</span>
                    </div>
                  </>
                )}
                {player.role === 'retail' && (
                  <>
                    <div className="position-row">
                      <span className="bold">QDN</span>
                      <span className="right mono">500</span>
                      <span className="right mono">¥{(player.cash / 10000).toFixed(0)}万</span>
                      <span className="right risk-tag low">5%</span>
                    </div>
                    <div className="position-row">
                      <span className="bold">AAPL</span>
                      <span className="right mono">200</span>
                      <span className="right mono">—</span>
                      <span className="right risk-tag low">3%</span>
                    </div>
                  </>
                )}
                {player.role === 'regulator' && (
                  <div className="position-row empty">
                    <span className="text-muted">No trading positions</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Alerts Panel */}
        <div className="alerts-section">
          <div className="section-header">
            <h3 className="section-title">⚠️ Anomaly Alerts</h3>
            <div className="alert-filters">
              {(['all', 'high', 'medium', 'low'] as const).map(f => (
                <button 
                  key={f}
                  className={`filter-btn ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="alerts-list">
            {filteredAlerts.length === 0 ? (
              <div className="empty-alerts">
                <div className="empty-icon">✅</div>
                <div>No anomalies detected</div>
                <div className="empty-sub">Market operating within normal parameters</div>
              </div>
            ) : filteredAlerts.map((alert) => (
              <div key={alert.id} className={`alert-card severity-${alert.severity}`}>
                <div className="alert-header">
                  <span className={`severity-tag ${alert.severity}`}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <span className="alert-title">{alert.title}</span>
                  <span className="alert-time">{formatTime(alert.timestamp)}</span>
                </div>
                <p className="alert-desc">{alert.description}</p>
                <div className="alert-actions">
                  <button
                    type="button"
                    className="alert-action warn"
                    onClick={() => {
                      applyRegulatoryAction(alert.id, 'warn');
                      setLastAction({ id: alert.id, action: `Warning sent: ${alert.title}` });
                    }}
                  >⚠️ Warn</button>
                  <button
                    type="button"
                    className="alert-action freeze"
                    onClick={() => {
                      applyRegulatoryAction(alert.id, 'freeze');
                      setLastAction({ id: alert.id, action: `Account frozen: ${alert.title}` });
                    }}
                  >🔒 Freeze</button>
                  <button
                    type="button"
                    className="alert-action kick"
                    onClick={() => {
                      applyRegulatoryAction(alert.id, 'kick');
                      setLastAction({ id: alert.id, action: `Player kicked: ${alert.title}` });
                    }}
                  >🚫 Kick</button>
                  <button
                    type="button"
                    className="alert-action dismiss"
                    onClick={() => {
                      applyRegulatoryAction(alert.id, 'dismiss');
                      setLastAction({ id: alert.id, action: `Dismissed: ${alert.title}` });
                    }}
                  >Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s ago` : `${s}s ago`;
}

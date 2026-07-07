import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './Rankings.css';

type RankingType = 'all-time' | 'weekly' | 'monthly' | 'wins';

export default function Rankings() {
  const { players, leaderboard, userName } = useGameStore();
  const [type, setType] = useState<RankingType>('weekly');
  const [roleFilter, setRoleFilter] = useState<'all' | 'dealer' | 'retail' | 'regulator'>('all');
  
  // Use leaderboard from store
  let displayData = leaderboard || players;
  
  if (roleFilter !== 'all') {
    displayData = displayData.filter(p => p.role === roleFilter);
  }
  
  const myRank = displayData.findIndex(p => p.name === userName) + 1;
  
  return (
    <div className="rankings-page">
      {/* Top 3 Podium */}
      <div className="podium-section">
        {displayData.slice(0, 3).map((player, i) => (
          <div key={player.id} className={`podium-card rank-${i + 1}`}>
            <div className="podium-rank">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
            </div>
            <div className="podium-avatar">
              {player.role === 'dealer' ? '🏦' : player.role === 'retail' ? '📈' : '⚖️'}
            </div>
            <div className="podium-name">{player.name}</div>
            <div className="podium-role">{player.role === 'dealer' ? 'Market Maker' : player.role === 'retail' ? 'Retail Trader' : 'SEC Agent'}</div>
            <div className="podium-assets mono">${(player.totalAssets / 10000).toFixed(0)}万</div>
            <div className="podium-return">
              <span className={player.weeklyReturn >= 0 ? 'up' : 'down'}>
                {player.weeklyReturn >= 0 ? '+' : ''}{player.weeklyReturn}%
              </span>
              <span className="weekly-label">Weekly</span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Filters */}
      <div className="rankings-toolbar">
        <div className="rank-type-tabs">
          {(['all-time', 'weekly', 'monthly', 'wins'] as const).map(t => (
            <button
              key={t}
              className={`rank-tab ${type === t ? 'active' : ''}`}
              onClick={() => setType(t)}
            >
              {t === 'all-time' ? 'All Time' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        
        <div className="role-filter">
          <span className="filter-label">Filter:</span>
          {(['all', 'dealer', 'retail', 'regulator'] as const).map(r => (
            <button
              key={r}
              className={`role-filter-btn ${roleFilter === r ? 'active' : ''}`}
              onClick={() => setRoleFilter(r)}
            >
              {r === 'all' ? 'All' : r === 'dealer' ? '🏦 Dealer' : r === 'retail' ? '📈 Retail' : '⚖️ Regulator'}
            </button>
          ))}
        </div>
      </div>
      
      {/* My Rank Highlight */}
      {myRank > 0 && (
        <div className="my-rank-card">
          <div className="my-rank-label">Your Ranking</div>
          <div className="my-rank-info">
            <div className="my-rank-position">
              <span className="position-num">#{myRank}</span>
              <span className="position-suffix">/ {displayData.length}</span>
            </div>
            <div className="my-rank-progress">
              <div className="progress-track">
                <div 
                  className="progress-fill" 
                  style={{ width: `${((displayData.length - myRank) / displayData.length) * 100}%` }}
                ></div>
              </div>
              <div className="progress-text">
                {myRank <= 3 
                  ? '🏆 Top tier! You are a legend.' 
                  : myRank <= 10 
                    ? '⭐ Excellent! Top 10.' 
                    : '📈 Keep trading to climb higher.'}
              </div>
            </div>
            <div className="my-rank-actions">
              <button className="rank-action-btn">View Profile</button>
              <button className="rank-action-btn primary">Challenge #1</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Full Ranking Table */}
      <div className="rankings-table-card">
        <div className="table-header">
          <h3 className="table-title">Global Leaderboard</h3>
          <span className="table-info">{displayData.length} traders</span>
        </div>
        
        <table className="rankings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Role</th>
              <th className="right">Total Assets</th>
              <th className="right">Weekly Return</th>
              <th className="right">Trades</th>
              <th className="right">Win Rate</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((player, i) => (
              <tr 
                key={player.id} 
                className={`rank-row ${player.name === userName ? 'me' : ''} ${i < 3 ? 'top' : ''}`}
              >
                <td className="rank-cell">
                  <span className={`rank-badge rank-${i + 1}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </span>
                </td>
                <td>
                  <div className="player-cell">
                    <div className="player-avatar">
                      {player.role === 'dealer' ? '🏦' : player.role === 'retail' ? '📈' : '⚖️'}
                    </div>
                    <div>
                      <div className="player-name-text">
                        {player.name}
                        {player.name === userName && <span className="me-tag">YOU</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="role-cell">
                  <span className={`role-tag ${player.role}`}>
                    {player.role.toUpperCase()}
                  </span>
                </td>
                <td className="right mono bold">${(player.totalAssets / 10000).toFixed(0)}万</td>
                <td className={`right mono ${player.weeklyReturn >= 0 ? 'up' : 'down'}`}>
                  {player.weeklyReturn >= 0 ? '+' : ''}{player.weeklyReturn.toFixed(2)}%
                </td>
                <td className="right mono">{Math.floor(Math.random() * 500) + 100}</td>
                <td className="right mono">
                  <span className="winrate">{(60 + Math.random() * 20).toFixed(1)}%</span>
                </td>
                <td className="action-cell">
                  <button className="challenge-btn">Challenge</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

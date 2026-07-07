import { useState } from 'react';
import { useGameStore, Role } from '../store/gameStore';
import './GameInfoSidebar.css';
const roleLabel: Record<Role, string> = {
  dealer: 'Market Maker',
  retail: 'Retail Trader',
  regulator: 'SEC Agent',
};

const roleIcon: Record<Role, string> = {
  dealer: '🏦',
  retail: '📈',
  regulator: '⚖️',
};

export default function GameInfoSidebar() {
  const { role, players, gameStatus, triggerBlackSwan, dealerResources } = useGameStore();
  const [bookmarked, setBookmarked] = useState(false);

  const blackSwanActive = role === 'dealer' && gameStatus === 'playing';

  const handleBlackSwanClick = () => {
    if (!blackSwanActive) {
      useGameStore.getState().showToast('Black Swan 仅庄家在 playing 状态下可用', 'warning');
      return;
    }
    if (window.confirm('Trigger Black Swan event?\n\nThis will crash the market -15% to -25% and increase your risk index by 25. Use only as a last resort.')) {
      triggerBlackSwan();
    }
  };

  const handleViewRoles = () => {
    // Switch to the role-specific tools/panel page based on role
    const target: 'regulator' | 'overview' = role === 'regulator' ? 'regulator' : 'overview';
    useGameStore.setState({ currentSection: target });
    useGameStore.getState().showToast(
      `已切换到${role === 'dealer' ? '庄家' : role === 'retail' ? '散户' : '监管'}专属面板`,
      'info'
    );
  };

  const handleBookmark = () => {
    setBookmarked(b => !b);
    useGameStore.getState().showToast(bookmarked ? '已取消收藏' : '已收藏当前 Black Swan 概率', 'info');
  };

  const opponents = players.filter(p => p.role !== role);

  return (
    <aside className="game-info-sidebar">
      <div className="gis-header">Game Info</div>

      <div className="gis-section">
        <div className="gis-row">
          <span className="gis-label">Players</span>
          <span className="gis-value mono">3 / 3</span>
        </div>
        <div className="gis-row">
          <span className="gis-label">Status</span>
          <span className={`gis-value status-${gameStatus}`}>{gameStatus.toUpperCase()}</span>
        </div>
      </div>

      <div className="gis-section">
        <div className="players-list">
          <button
            type="button"
            className={`player-pill me role-${role}`}
            onClick={() => useGameStore.setState({ currentSection: 'overview' })}
            title="回到对局面板"
          >
            <span className="player-icon">{roleIcon[role]}</span>
            <div>
              <div className="player-name">You</div>
              <div className="player-role">{roleLabel[role]}</div>
            </div>
          </button>

          {opponents.map(p => (
            <div key={p.id} className={`player-pill role-${p.role}`}>
              <span className="player-icon">{roleIcon[p.role]}</span>
              <div>
                <div className="player-name">{p.name}</div>
                <div className="player-role">{roleLabel[p.role]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="gis-action-btn" onClick={handleViewRoles}>
        View Roles
      </button>

      {/* Black Swan Trigger */}
      <div className={`black-swan-card ${blackSwanActive ? 'active' : ''}`}>
        <div className="bs-header">
          <span>⚠️ Black Swan</span>
          {blackSwanActive && <span className="bs-pulse"></span>}
        </div>

        <div className="bs-row">
          <span className="bs-value">
            {blackSwanActive ? 'Ready' : dealerResources ? `${dealerResources.riskIndex.toFixed(0)}%` : 'N/A'}
          </span>
          <span
            className="bs-action"
            onClick={handleBookmark}
            title={bookmarked ? 'Bookmarked' : 'Bookmark event'}
            style={{ cursor: 'pointer' }}
          >
            <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
        </div>

        <div className="bs-footer">
          <div className="bs-probability">
            <div className="prob-bar">
              <div className="prob-fill" style={{ width: blackSwanActive ? '100%' : '3.2%' }}></div>
            </div>
            <span className="prob-value mono">{blackSwanActive ? '100%' : '3.2%'}</span>
          </div>
          <div className="bs-prob-label">Probability</div>
        </div>

        {blackSwanActive ? (
          <button type="button" className="trigger-btn" onClick={handleBlackSwanClick}>
            Trigger Event
          </button>
        ) : (
          <button type="button" className="trigger-btn disabled" disabled title="Black Swan only available during play as Dealer">
            Trigger Event
          </button>
        )}
      </div>
    </aside>
  );
}

import { useGameStore, Role } from '../store/gameStore';
import './SettlementModal.css';

interface SettlementModalProps {
  open: boolean;
  onClose: () => void;
  onPlayAgain?: () => void;
}

const roleLabel: Record<Role, string> = {
  dealer: '庄家 (Dealer)',
  retail: '散户 (Retail)',
  regulator: '监管 (Regulator)',
};

const roleIcon: Record<Role, string> = {
  dealer: '🏦',
  retail: '📈',
  regulator: '⚖️',
};

export default function SettlementModal({ open, onClose, onPlayAgain }: SettlementModalProps) {
  const { role, players, simulation, holdings, cash, currentQuote, totalTradeCount, bestTradePnl, justiceScore } = useGameStore();

  if (!open) return null;

  const myAssets = cash + holdings.reduce((sum, h) => sum + h.marketPrice * h.shares, 0);

  // Use computed simulation results if available
  const finalAssets = (simulation as any).finalAssets ?? myAssets;
  const initialAssets = simulation.initialAssets || 100000000;
  const opponentAssets = simulation.opponentAssets || initialAssets;
  const returnRate = ((finalAssets - initialAssets) / initialAssets) * 100;

  // Update players for display with computed final values
  const sortedPlayers = [...players].map(p => p.role === role ? { ...p, totalAssets: Math.round(finalAssets) } : p.role === 'retail' && role !== 'retail' ? { ...p, totalAssets: opponentAssets } : p)
    .sort((a, b) => b.totalAssets - a.totalAssets);
  const winner = sortedPlayers[0];
  const myPlayer = sortedPlayers.find(p => p.role === role);
  
  return (
    <div className="settlement-overlay">
      <div className="settlement-modal">
        <div className="settlement-banner">
          <div className="banner-label">对局结束</div>
          <h2 className="banner-title">
            {myPlayer?.id === winner.id ? '🏆 你赢了！' : '😢 你输了'}
          </h2>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
            收益率 <span style={{ color: returnRate >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
              {returnRate >= 0 ? '+' : ''}{returnRate.toFixed(2)}%
            </span>
            {' · '}初始 ¥{(initialAssets / 10000).toFixed(0)}万 → 最终 ¥{(finalAssets / 10000).toFixed(0)}万
          </div>
        </div>
        
        <div className="settlement-body">
          <div className="final-standings">
            <h3 className="standings-title">最终排名</h3>
            
            {sortedPlayers.map((p, i) => (
              <div 
                key={p.id} 
                className={`standing-row ${i === 0 ? 'winner' : ''} ${p.role === role ? 'me' : ''}`}
              >
                <div className="standing-rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                </div>
                <div className="standing-player">
                  <span className="player-icon">{roleIcon[p.role]}</span>
                  <span className="player-name">
                    {p.name}
                    {p.role === role && <span className="me-tag">YOU</span>}
                  </span>
                </div>
                <div className="standing-role">{roleLabel[p.role]}</div>
                <div className="standing-assets mono">
                  ¥{(p.totalAssets / 10000).toFixed(0)}万
                </div>
                <div className="standing-pnl">
                  <span className={p.totalAssets >= initialAssets ? 'up' : 'down'}>
                    {p.totalAssets >= initialAssets ? '+' : ''}
                    {((p.totalAssets - initialAssets) / 10000).toFixed(0)}万
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="settlement-stats">
            <div className="stat-item">
              <div className="stat-label">总交易次数</div>
              <div className="stat-value mono">{totalTradeCount}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">对手收益率</div>
              <div className="stat-value mono">
                <span className={opponentAssets >= initialAssets ? 'up' : 'down'}>
                  {((opponentAssets - initialAssets) / initialAssets * 100).toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">最佳单笔</div>
              <div className="stat-value mono">
                <span className={bestTradePnl >= 0 ? 'up' : 'down'}>
                  {bestTradePnl >= 0 ? '+' : ''}¥{(bestTradePnl / 10000).toFixed(1)}万
                </span>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">当前股价</div>
              <div className="stat-value mono">¥{currentQuote.price.toFixed(2)}</div>
            </div>
            {role === 'regulator' && (
              <div className="stat-item">
                <div className="stat-label">正义分</div>
                <div className="stat-value mono">
                  <span className={justiceScore > 50 ? 'up' : justiceScore < 0 ? 'down' : ''}>
                    {justiceScore} {justiceScore > 50 ? '· 胜利' : justiceScore < 0 ? '· 失败' : '· 平局'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="settlement-actions">
          <button className="settlement-btn secondary" onClick={onClose}>
            返回大厅
          </button>
          <button className="settlement-btn primary" onClick={() => {
            if (onPlayAgain) {
              onPlayAgain();
            } else {
              useGameStore.getState().restartMatch();
              useGameStore.getState().startMatch();
              onClose();
            }
          }}>
            再来一局
          </button>
        </div>
      </div>
    </div>
  );
}

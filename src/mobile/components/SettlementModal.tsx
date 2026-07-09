/**
 * 移动端整局结算弹窗（最终胜方 + 排名 + 收益）
 */

import { useGameStore } from '../../store/gameStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
}

export default function MobileSettlementModal({ open, onClose, onPlayAgain }: Props) {
  const totalAssets = useGameStore((s) => s.totalAssets);
  const initialAssets = 100_000_000;
  const totalPnl = totalAssets - initialAssets;
  const totalPnlPct = (totalPnl / initialAssets) * 100;
  const leaderboard = useGameStore((s) => s.leaderboard);
  const players = useGameStore((s) => s.players);
  const role = useGameStore((s) => s.role);
  const currentDay = useGameStore((s) => s.currentDay);

  if (!open) return null;

  // 合并本场与历史榜
  const me = players.find((p) => p.role === role) ?? players[0];
  const meRank = [...players].sort((a, b) => b.totalAssets - a.totalAssets).findIndex((p) => p.id === me?.id) + 1;

  return (
    <div className="m-modal-shade" role="dialog" aria-modal="true">
      <div className="m-modal-card">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            width: 80, height: 80, margin: '0 auto',
            borderRadius: 40, background: 'rgba(34,197,94,0.15)',
            display: 'grid', placeItems: 'center', fontSize: 40,
          }}>🏆</div>
        </div>
        <h3 className="m-modal-title">对局结束</h3>
        <p className="m-modal-subtitle">Day {currentDay} · 最终结算</p>

        <div className="m-modal-stats">
          <div>
            <div className="label">总资产</div>
            <div className="value">¥{totalAssets.toLocaleString()}</div>
          </div>
          <div>
            <div className="label">总收益</div>
            <div className={`value ${totalPnl >= 0 ? 'm-up' : 'm-down'}`}>
              {totalPnl >= 0 ? '+' : '−'}{totalPnlPct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="label">我的排名</div>
            <div className="value">#{meRank || '—'}</div>
          </div>
        </div>

        <div className="m-list" style={{ margin: '0 0 18px' }}>
          {leaderboard.slice(0, 5).map((p) => (
            <div key={p.id} className="m-card-row" style={{ gridTemplateColumns: 'auto 1fr auto', display: 'grid', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 22, textAlign: 'center', fontSize: 12, color: 'var(--m-text-3)' }}>#{p.rank}</span>
              <span style={{ fontSize: 13 }}>{p.name}</span>
              <span className="m-mono" style={{ fontSize: 12 }}>¥{(p.totalAssets / 1e6).toFixed(1)}M</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="m-btn m-btn-ghost m-btn-block" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="m-btn m-btn-primary m-btn-block" onClick={onPlayAgain}>
            再来一局
          </button>
        </div>
      </div>
    </div>
  );
}
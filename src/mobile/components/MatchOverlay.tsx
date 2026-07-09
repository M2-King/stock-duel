/**
 * 移动端匹配遮罩（精简版）：
 *  - waiting / matching / reversed 三态
 *  - 大按钮，最低 56 高
 *  - reversal cards 改成 1 列
 */

import { useEffect } from 'react';
import { useGameStore, type Role } from '../../store/gameStore';

const ROLE_LABEL: Record<Role, string> = {
  dealer: '庄家 Market Maker',
  retail: '散户 Retail Trader',
  regulator: '监管 SEC Agent',
};

const ROLE_ICON: Record<Role, string> = {
  dealer: '🏦',
  retail: '📈',
  regulator: '⚖️',
};

export default function MobileMatchOverlay() {
  const gameStatus = useGameStore((s) => s.gameStatus);
  const reversalCards = useGameStore((s) => s.reversalCards);
  const revealReversalCard = useGameStore((s) => s.revealReversalCard);
  const setGameStatus = useGameStore((s) => s.setGameStatus);
  const cancelWaiting = useGameStore((s) => s.cancelWaiting);
  const randomizeMyRole = useGameStore((s) => s.randomizeMyRole);
  const matchOpponentName = useGameStore((s) => s.matchOpponentName);
  const waitingRoom = useGameStore((s) => s.waitingRoom);

  // Auto-progress matching -> reversed (mirror desktop)
  useEffect(() => {
    if (gameStatus !== 'matching') return;
    const hasCards = reversalCards.length === 3;
    if (hasCards) {
      const t = setTimeout(() => setGameStatus('reversed'), 300);
      return () => clearTimeout(t);
    }
    const fallback = setTimeout(() => {
      if (useGameStore.getState().gameStatus !== 'matching') return;
      const cards: Role[] = ['dealer', 'retail', 'regulator'];
      const shuffled = [...cards].sort(() => Math.random() - 0.5);
      useGameStore.setState({
        reversalCards: shuffled.map((r, i) => ({ role: r, revealed: i === 0 })),
        role: shuffled[0],
        gameStatus: 'reversed',
      });
    }, 5000);
    return () => clearTimeout(fallback);
  }, [gameStatus, reversalCards.length, setGameStatus]);

  if (gameStatus === 'idle' || gameStatus === 'playing' || gameStatus === 'settlement') return null;

  // ===== Waiting =====
  if (gameStatus === 'waiting') {
    const room = waitingRoom ?? { code: null as string | null, currentPlayers: 1, requiredPlayers: 2, countdown: null, mode: 'quick' as const };
    return (
      <div className="m-modal-shade">
        <div className="m-modal-card" role="dialog" aria-modal="true">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto',
              borderRadius: 32, background: 'var(--m-surface-2)',
              display: 'grid', placeItems: 'center', fontSize: 28,
            }}>⏳</div>
          </div>
          <h3 className="m-modal-title">等待对手</h3>
          <p className="m-modal-subtitle">
            {room.currentPlayers}/{room.requiredPlayers} 已就位
            {room.code ? ` · 房间号 ${room.code}` : ''}
          </p>
          <button type="button" className="m-btn m-btn-ghost m-btn-block" onClick={() => { void cancelWaiting(); }}>
            取消
          </button>
        </div>
      </div>
    );
  }

  // ===== Matching =====
  if (gameStatus === 'matching') {
    return (
      <div className="m-modal-shade">
        <div className="m-modal-card" role="dialog" aria-modal="true">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto',
              borderRadius: 32, background: 'var(--m-surface-2)',
              display: 'grid', placeItems: 'center', fontSize: 28,
            }}>⚔️</div>
          </div>
          <h3 className="m-modal-title">对手已就位</h3>
          <p className="m-modal-subtitle">
            {matchOpponentName ? `vs ${matchOpponentName} · ` : ''}准备翻牌...
          </p>
          <div className="m-skel" style={{ width: '100%', height: 4, marginTop: 16 }} />
        </div>
      </div>
    );
  }

  // ===== Reversed =====
  if (gameStatus === 'reversed') {
    const myPick = reversalCards.find((c) => c.revealed);
    return (
      <div className="m-modal-shade">
        <div className="m-modal-card" style={{ maxWidth: 380 }} role="dialog" aria-modal="true">
          <h3 className="m-modal-title">翻开你的身份</h3>
          <p className="m-modal-subtitle">点击卡牌确认你的角色</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0 18px' }}>
            {reversalCards.map((c, i) => {
              const isMy = c.revealed || myPick?.role === c.role;
              return (
                <button
                  key={i}
                  type="button"
                  className="m-card"
                  style={{
                    padding: '14px 16px',
                    textAlign: 'left',
                    border: isMy ? '1px solid rgba(34,197,94,0.6)' : '1px solid var(--m-border)',
                    background: isMy ? 'rgba(34,197,94,0.08)' : 'var(--m-surface)',
                    color: 'var(--m-text)',
                    cursor: c.revealed ? 'default' : 'pointer',
                    minHeight: 56,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                  onClick={() => {
                    if (!c.revealed) revealReversalCard(i);
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{ROLE_ICON[c.role]}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {c.revealed || isMy ? ROLE_LABEL[c.role] : '???'}
                    </span>
                  </span>
                  {isMy ? (
                    <span className="m-tag m-tag-up">已确认</span>
                  ) : (
                    <span className="m-tag">点我翻开</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="m-btn m-btn-primary m-btn-block"
            onClick={() => useGameStore.getState().enterPlaying()}
          >
            开始对局
          </button>
          <button
            type="button"
            className="m-btn m-btn-ghost m-btn-block"
            style={{ marginTop: 8 }}
            onClick={() => randomizeMyRole()}
          >
            重新随机
          </button>
        </div>
      </div>
    );
  }
  return null;
}

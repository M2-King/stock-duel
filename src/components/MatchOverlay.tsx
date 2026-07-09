import { useEffect, useState } from 'react';
import { useGameStore, Role } from '../store/gameStore';
import './MatchOverlay.css';

const roleLabel: Record<Role, string> = {
  dealer: '庄家 (Market Maker)',
  retail: '散户 (Retail Trader)',
  regulator: '监管 (SEC Agent)',
};

const roleShort: Record<Role, string> = {
  dealer: 'Market Maker',
  retail: 'Retail Trader',
  regulator: 'SEC Agent',
};

const roleIcon: Record<Role, string> = {
  dealer: '🏦',
  retail: '📈',
  regulator: '⚖️',
};

const defaultWaitingRoom = (mode: 'room' | 'quick' = 'quick') => {
  const { onlinePlayerCount } = useGameStore.getState();
  return {
    code: null as string | null,
    currentPlayers: 1,
    requiredPlayers: onlinePlayerCount,
    countdown: null as number | null,
    mode,
  };
};

export default function MatchOverlay() {
  const {
    gameStatus,
    reversalCards,
    revealReversalCard,
    setGameStatus,
    cancelWaiting,
    randomizeMyRole,
    matchFlow,
    backendMode,
    wsStatus,
    waitingRoom,
  } = useGameStore();

  // Auto-progress matching -> reversed
  useEffect(() => {
    if (gameStatus !== 'matching') return;
    const hasCards = reversalCards.length === 3;
    if (hasCards) {
      const t1 = setTimeout(() => setGameStatus('reversed'), 300);
      return () => clearTimeout(t1);
    }
    const fallback = setTimeout(() => {
      if (useGameStore.getState().gameStatus === 'matching') {
        console.warn('[overlay] 没等到 reversalCards，强行推进到 reversed');
        const cards: Role[] = ['dealer', 'retail', 'regulator'];
        const shuffled = [...cards].sort(() => Math.random() - 0.5);
        useGameStore.setState({
          reversalCards: shuffled.map((r, i) => ({ role: r, revealed: i === 0 })),
          role: shuffled[0],
          gameStatus: 'reversed',
        });
      }
    }, 5000);
    return () => clearTimeout(fallback);
  }, [gameStatus, reversalCards.length, setGameStatus]);

  if (gameStatus === 'idle' || gameStatus === 'playing' || gameStatus === 'settlement') {
    return null;
  }

  if (gameStatus === 'waiting') {
    const room = waitingRoom ?? defaultWaitingRoom(matchFlow === 'online' ? 'quick' : 'room');
    const backendError =
      matchFlow === 'online' && backendMode && (wsStatus === 'error' || wsStatus === 'disconnected')
        ? '后端连接中断，请检查网络或取消后重试'
        : matchFlow === 'online' && !backendMode
          ? '后端未连接，请稍后重试或使用单人练习'
          : !waitingRoom
            ? '正在同步房间状态...'
            : null;

    return (
      <WaitingScreen
        room={room}
        errorMessage={backendError}
        onCancel={() => { void cancelWaiting(); }}
      />
    );
  }

  if (gameStatus === 'matching') {
    return (
      <MatchingScreen
        onCancel={() => { void cancelWaiting(); }}
        subtitle="对手已就位，准备翻牌..."
      />
    );
  }

  if (gameStatus === 'reversed') {
    const myPick = reversalCards.find(c => c.revealed);
    return (
      <ReversalScreen
        cards={reversalCards}
        myRole={myPick?.role}
        onReveal={revealReversalCard}
        onReroll={randomizeMyRole}
        showReroll={matchFlow !== 'online' || !backendMode}
        onStart={() => { useGameStore.getState().enterPlaying(); }}
        onReset={() => useGameStore.setState({ gameStatus: 'idle', matchFlow: null, waitingRoom: null })}
      />
    );
  }

  return (
    <MatchingScreen
      onCancel={() => { void cancelWaiting(); }}
      subtitle={`连接对局中... (${gameStatus})`}
    />
  );
}

interface WaitingScreenProps {
  room: {
    code: string | null;
    currentPlayers: number;
    requiredPlayers: number;
    countdown: number | null;
    mode: 'room' | 'quick';
  };
  errorMessage?: string | null;
  onCancel: () => void;
}

function WaitingScreen({ room, errorMessage, onCancel }: WaitingScreenProps) {
  const [displayCountdown, setDisplayCountdown] = useState<number | null>(room.countdown);
  const isCountdown = displayCountdown !== null && displayCountdown > 0;
  const playerLabel = `${room.currentPlayers}/${room.requiredPlayers}`;

  useEffect(() => {
    if (room.countdown === null || room.countdown <= 0) {
      setDisplayCountdown(room.countdown);
      return;
    }
    let remaining = room.countdown;
    setDisplayCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setDisplayCountdown(remaining > 0 ? remaining : 0);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [room.countdown]);

  return (
    <div className="match-overlay">
      <div className="match-modal matching-modal waiting-modal">
        <div className="match-animation">
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay-1"></div>
          <div className="pulse-ring delay-2"></div>
          <div className="match-icon">{isCountdown ? '🚀' : '⏳'}</div>
        </div>

        <h3 className="match-title">
          {isCountdown ? '即将开始...' : '正在等待对手加入...'}
        </h3>
        <p className="match-subtitle">
          {isCountdown
            ? `${displayCountdown} 秒后翻牌分配身份`
            : room.mode === 'quick'
              ? '快速匹配队列中'
              : '分享房间码邀请好友加入'}
        </p>

        {errorMessage && (
          <p className="match-waiting-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="waiting-player-count">
          <span className="waiting-count-value">{playerLabel}</span>
          <span className="waiting-count-label">玩家</span>
        </div>

        {room.code && !isCountdown && (
          <div className="waiting-room-code">
            <span className="waiting-room-code-label">房间码</span>
            <span className="waiting-room-code-value">{room.code}</span>
            <button
              type="button"
              className="waiting-copy-btn"
              onClick={() => {
                navigator.clipboard?.writeText(room.code!);
                useGameStore.getState().showToast('房间码已复制', 'success');
              }}
            >
              复制
            </button>
          </div>
        )}

        {isCountdown && (
          <div className="waiting-countdown-ring">{displayCountdown}</div>
        )}

        {!isCountdown && (
          <div className="match-actions">
            <button type="button" className="cancel-match-btn" onClick={onCancel}>
              取消等待
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchingScreen({ onCancel, subtitle }: { onCancel: () => void; subtitle?: string }) {
  return (
    <div className="match-overlay">
      <div className="match-modal matching-modal">
        <div className="match-animation">
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay-1"></div>
          <div className="pulse-ring delay-2"></div>
          <div className="match-icon">🃏</div>
        </div>

        <h3 className="match-title">准备翻牌</h3>
        <p className="match-subtitle">{subtitle ?? '分配身份中...'}</p>

        <div className="match-actions">
          <button type="button" className="cancel-match-btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReversalScreenProps {
  cards: { role: Role; revealed: boolean }[];
  myRole?: Role;
  onReveal: (i: number) => void;
  onReroll: () => void;
  showReroll: boolean;
  onStart: () => void;
  onReset: () => void;
}

function ReversalScreen({ cards, myRole, onReveal, onReroll, showReroll, onStart, onReset }: ReversalScreenProps) {
  return (
    <div className="match-overlay">
      <div className="match-modal reversal-modal">
        <h3 className="match-title">身份揭晓</h3>
        <p className="match-subtitle">
          {myRole
            ? `您的身份已锁定 · ${roleShort[myRole]}`
            : '翻开一张卡确定你的身份，其余 2 张代表对手'}
        </p>

        <div className="reversal-cards">
          {cards.map((card, i) => {
            const isMyCard = card.revealed;
            return (
              <div
                key={i}
                className={`reversal-card ${isMyCard ? 'revealed' : ''} ${myRole && !isMyCard ? 'opponent-card' : ''}`}
                onClick={() => !card.revealed && onReveal(i)}
                role="button"
                aria-disabled={!!card.revealed}
              >
                {isMyCard ? (
                  <div className="card-revealed-content">
                    <div className="card-role-icon">{roleIcon[card.role]}</div>
                    <div className="card-role-label">{roleLabel[card.role]}</div>
                    <span className="you-tag">YOU</span>
                  </div>
                ) : (
                  <div className="card-hidden-content">
                    {myRole ? (
                      <>
                        <div className="card-icon-back">{roleIcon[card.role]}</div>
                        <div className="card-flip-hint">对手身份</div>
                      </>
                    ) : (
                      <>
                        <div className="card-icon-back">?</div>
                        <div className="card-flip-hint">点击翻开</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {myRole ? (
          <div className="identity-confirm-row">
            <button type="button" className="confirm-role-btn" onClick={onStart}>
              确认身份 · 开始对局
            </button>
            {showReroll && (
              <button type="button" className="reroll-btn" onClick={onReroll} title="随机再抽">
                🔄 重抽
              </button>
            )}
            <button type="button" className="cancel-reveal-btn" onClick={onReset}>
              放弃
            </button>
          </div>
        ) : (
          <p className="reveal-hint">↑ 在三张身份卡中选择一张作为你的角色</p>
        )}
      </div>
    </div>
  );
}

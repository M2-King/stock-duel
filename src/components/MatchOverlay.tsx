import { useEffect } from 'react';
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

export default function MatchOverlay() {
  const { gameStatus, reversalCards, revealReversalCard, setGameStatus, cancelMatch, randomizeMyRole } = useGameStore();

  // Auto-progress matching -> reversed (2.5s)
  useEffect(() => {
    if (gameStatus === 'matching') {
      const t1 = setTimeout(() => {
        // 已分配 3 张隐藏身份卡 -> 进入"揭晓"阶段
        setGameStatus('reversed');
      }, 2500);
      return () => clearTimeout(t1);
    }
  }, [gameStatus, setGameStatus]);

  // 进入 reversed 阶段时，随机翻开一张卡作为"我的身份"
  useEffect(() => {
    if (gameStatus === 'reversed') {
      const alreadyPicked = reversalCards.some(c => c.revealed);
      if (!alreadyPicked) {
        // 等用户主动翻——不再自动翻开，让用户主导
      }
    }
  }, [gameStatus, reversalCards]);

  if (gameStatus === 'idle' || gameStatus === 'playing') return null;

  if (gameStatus === 'matching') {
    return <MatchingScreen onCancel={cancelMatch} />;
  }

  if (gameStatus === 'reversed') {
    const myPick = reversalCards.find(c => c.revealed);
    return (
      <ReversalScreen
        cards={reversalCards}
        myRole={myPick?.role}
        onReveal={revealReversalCard}
        onReroll={randomizeMyRole}
        onStart={() => useGameStore.setState({ gameStatus: 'playing' })}
        onReset={() => useGameStore.setState({ gameStatus: 'idle' })}
      />
    );
  }

  return null;
}

function MatchingScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="match-overlay">
      <div className="match-modal matching-modal">
        <div className="match-animation">
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay-1"></div>
          <div className="pulse-ring delay-2"></div>
          <div className="match-icon">⚔️</div>
        </div>

        <h3 className="match-title">匹配中...</h3>
        <p className="match-subtitle">正在为您寻找对手</p>

        <div className="match-steps">
          <div className="match-step active">
            <span className="step-dot"></span>
            <span>搜索对手</span>
          </div>
          <div className="match-step">
            <span className="step-dot"></span>
            <span>分配身份</span>
          </div>
          <div className="match-step">
            <span className="step-dot"></span>
            <span>开始对局</span>
          </div>
        </div>

        <button className="cancel-match-btn" onClick={onCancel}>
          取消匹配
        </button>
      </div>
    </div>
  );
}

interface ReversalScreenProps {
  cards: { role: Role; revealed: boolean }[];
  myRole?: Role;
  onReveal: (i: number) => void;
  onReroll: () => void;
  onStart: () => void;
  onReset: () => void;
}

function ReversalScreen({ cards, myRole, onReveal, onReroll, onStart, onReset }: ReversalScreenProps) {
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
            <button className="confirm-role-btn" onClick={onStart}>
              确认身份 · 开始对局
            </button>
            <button className="reroll-btn" onClick={onReroll} title="随机再抽">
              🔄 重抽
            </button>
            <button className="cancel-reveal-btn" onClick={onReset}>
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

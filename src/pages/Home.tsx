import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './Home.css';

const roleFeatures = {
  dealer: {
    title: '庄家',
    description: '操控市场走势的幕后力量',
    abilities: [
      { icon: '📈', label: '拉升/打压股价' },
      { icon: '🔄', label: '吸筹/出货' },
      { icon: '🤝', label: '对敲交易' },
      { icon: '🎭', label: '假挂单迷惑' },
      { icon: '💰', label: '资金池管理' },
      { icon: '⚡', label: '能量系统' },
    ],
    color: 'var(--color-dealer)',
  },
  retail: {
    title: '散户',
    description: '追随市场趋势的智慧投资者',
    abilities: [
      { icon: '📊', label: 'K线分析' },
      { icon: '📉', label: '技术指标' },
      { icon: '� Five', label: '五档盘口' },
      { icon: '💡', label: '购买内幕' },
      { icon: '🔍', label: '图表工具' },
      { icon: '📋', label: '限价/市价单' },
    ],
    color: 'var(--color-retail)',
  },
  regulator: {
    title: '监管',
    description: '维护市场秩序的裁判员',
    abilities: [
      { icon: '👁️', label: '全视角观战' },
      { icon: '🚨', label: '异常检测' },
      { icon: '📋', label: '违规评分' },
      { icon: '⚖️', label: '处罚权限' },
      { icon: '📊', label: '数据分析' },
      { icon: '🔔', label: '实时告警' },
    ],
    color: 'var(--color-regulator)',
  },
};

export default function Home() {
  const { role, setGameStatus, setRole } = useGameStore();
  const [isMatching, setIsMatching] = useState(false);
  const [matchStep, setMatchStep] = useState(0);

  const features = roleFeatures[role];

  const handleStartMatch = () => {
    setIsMatching(true);
    setMatchStep(0);
    
    const steps = [
      '正在匹配对手...',
      '已找到对手',
      '正在分配身份...',
      '对局即将开始',
    ];
    
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setMatchStep(step);
      
      if (step >= 3) {
        clearInterval(interval);
        setTimeout(() => {
          setGameStatus('playing');
          setIsMatching(false);
        }, 500);
      }
    }, 800);
  };

  return (
    <div className="home">
      <div className="home-container">
        {/* Hero Section */}
        <section className="hero">
          <div className="hero-badge">实时1v1对战</div>
          <h1 className="hero-title">
            股票对局
            <span className="title-accent">Stock Double Play</span>
          </h1>
          <p className="hero-subtitle">
            5个交易日 · 实时行情 · 策略博弈<br />
            体验庄家与散户的极致对决
          </p>
          
          <div className="hero-cta">
            <button 
              className="btn-primary"
              onClick={handleStartMatch}
              disabled={isMatching}
            >
              {isMatching ? '匹配中...' : '开始匹配'}
              <span className="btn-icon">⚔️</span>
            </button>
          </div>
        </section>

        {/* Role Selection */}
        <section className="role-section">
          <h2 className="section-title">选择你的身份</h2>
          
          <div className="role-cards">
            {(Object.keys(roleFeatures) as Array<keyof typeof roleFeatures>).map((r) => (
              <button
                key={r}
                className={`role-card ${role === r ? 'active' : ''}`}
                onClick={() => setRole(r)}
                style={{ '--role-color': roleFeatures[r].color } as React.CSSProperties}
              >
                <div className="role-card-header">
                  <span className="role-icon-large">{r === 'dealer' ? '🏦' : r === 'retail' ? '📈' : '⚖️'}</span>
                  <span className="role-title">{roleFeatures[r].title}</span>
                </div>
                <p className="role-desc">{roleFeatures[r].description}</p>
                
                <div className="role-abilities">
                  {roleFeatures[r].abilities.map((ability, i) => (
                    <span key={i} className="ability-tag">
                      {ability.icon} {ability.label}
                    </span>
                  ))}
                </div>
                
                {role === r && (
                  <div className="role-selected-indicator">
                    <span>已选择</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Current Role Features */}
        <section className="features-section">
          <h2 className="section-title">
            <span className="title-icon">{role === 'dealer' ? '🏦' : role === 'retail' ? '📈' : '⚖️'}</span>
            {features.title}专属能力
          </h2>
          
          <div className="abilities-grid">
            {features.abilities.map((ability, i) => (
              <div 
                key={i} 
                className="ability-card"
                style={{ 
                  '--delay': `${i * 0.1}s`,
                  '--role-color': features.color 
                } as React.CSSProperties}
              >
                <span className="ability-icon">{ability.icon}</span>
                <span className="ability-label">{ability.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Game Rules */}
        <section className="rules-section">
          <h2 className="section-title">游戏规则</h2>
          
          <div className="rules-grid">
            <div className="rule-card">
              <div className="rule-icon">📅</div>
              <h3>5个交易日</h3>
              <p>每天7分钟，实时tick模拟</p>
            </div>
            
            <div className="rule-card">
              <div className="rule-icon">💵</div>
              <h3>1亿起始资金</h3>
              <p>庄家散户各持有一亿</p>
            </div>
            
            <div className="rule-card">
              <div className="rule-icon">🏆</div>
              <h3>资产定胜负</h3>
              <p>5天后资产多者获胜</p>
            </div>
            
            <div className="rule-card">
              <div className="rule-icon">🎯</div>
              <h3>信息差博弈</h3>
              <p>不同身份信息不对称</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="home-footer">
          <p>准备好迎接挑战了吗？</p>
        </footer>
      </div>

      {/* Matching Overlay */}
      {isMatching && (
        <div className="matching-overlay">
          <div className="matching-modal">
            <div className="matching-animation">
              <div className="pulse-ring"></div>
              <div className="pulse-ring delay-1"></div>
              <div className="pulse-ring delay-2"></div>
              <div className="matching-icon">🔍</div>
            </div>
            
            <h3 className="matching-title">匹配对手</h3>
            
            <div className="matching-steps">
              {['正在匹配对手...', '已找到对手', '正在分配身份...', '对局即将开始'].map((step, i) => (
                <div 
                  key={i} 
                  className={`matching-step ${i <= matchStep ? 'active' : ''}`}
                >
                  <span className="step-dot"></span>
                  <span className="step-text">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

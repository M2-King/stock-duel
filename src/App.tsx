import { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import Header from './components/Header';
import Sidebar, { NavSection } from './components/Sidebar';
import GameInfoSidebar from './components/GameInfoSidebar';
import StatusBar from './components/StatusBar';
import MatchOverlay from './components/MatchOverlay';
import SettlementModal from './components/SettlementModal';
import DailySettlementModal from './components/DailySettlementModal';
import Dashboard from './pages/Dashboard';
import RegulatorPanelPage from './pages/RegulatorPanel';
import Markets from './pages/Markets';
import Portfolio from './pages/Portfolio';
import Watchlist from './pages/Watchlist';
import News from './pages/News';
import Tools from './pages/Tools';
import Messages from './pages/Messages';
import Rankings from './pages/Rankings';
import Settings from './pages/Settings';
import MobileApp from './mobile/MobileApp';
import { useIsMobile, useViewportWidth } from './mobile/hooks/useViewportWidth';
import './App.css';

const MOBILE_BREAKPOINT = 768;

function PlayingBanner({ role, onBack }: { role: 'dealer' | 'retail' | 'regulator'; onBack: () => void }) {
  return (
    <div className="playing-banner" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '8px 14px',
      marginBottom: 12,
      background: 'linear-gradient(90deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))',
      border: '1px solid rgba(34,197,94,0.25)',
      borderRadius: 8,
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#22c55e',
          boxShadow: '0 0 8px #22c55e',
          animation: 'pulse 1.5s infinite',
        }}></span>
        <span style={{ color: 'var(--text-secondary)' }}>对局进行中</span>
        <span style={{ color: 'var(--text-tertiary)' }}>·</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {role === 'dealer' ? '🏦 Market Maker' : role === 'retail' ? '📈 Retail Trader' : '⚖️ SEC Agent'}
        </span>
      </div>
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: '4px 10px',
          background: 'var(--text-primary)',
          color: 'var(--bg-base)',
          border: 'none',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        返回对局面板
      </button>
    </div>
  );
}

function App() {
  const [section, setSection] = useState<NavSection>('overview');
  const [showSettlement, setShowSettlement] = useState(false);
  const isMobile = useIsMobile(MOBILE_BREAKPOINT);
  const viewportW = useViewportWidth();

  // 注入 viewport meta，确保手机有正确 viewport；保留 Netlify 注入的（如有）
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement('meta');
      vp.setAttribute('name', 'viewport');
      document.head.appendChild(vp);
    }
    vp.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    );
  }, []);

  const { role, gameStatus, endMatch, startSimulation, stopSimulation, connectBackend } = useGameStore();

  // Boot: try connecting to backend. Falls back to local simulation silently on failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let connected = false;
      try {
        connected = await connectBackend();
      } catch (err) {
        console.warn('[StockDuel] connectBackend threw', err);
      }
      if (cancelled) return;
      const mode = useGameStore.getState().backendMode;
      if (connected && mode) {
        console.info('[StockDuel] backend connected');
        return;
      }
      // No toast here — connectBackend already surfaced a friendly message
      console.info('[StockDuel] backend not available, using local simulation');
    })();
    return () => {
      cancelled = true;
    };
  }, [connectBackend]);

  // Mirror App section <-> store (sidebar uses local state; pages use store.setSection)
  useEffect(() => {
    useGameStore.setState({ currentSection: section });
  }, [section]);

  useEffect(() => {
    return useGameStore.subscribe((state, prev) => {
      if (state.currentSection !== prev.currentSection) {
        setSection(state.currentSection as NavSection);
      }
    });
  }, []);

  // Tick engine lifecycle
  useEffect(() => {
    console.log('[App] gameStatus effect fire; status=', gameStatus);
    if (gameStatus === 'playing') {
      startSimulation();
    } else {
      stopSimulation();
    }
    return () => {
      console.log('[App] gameStatus effect cleanup; status=', gameStatus);
      stopSimulation();
    };
  }, [gameStatus, startSimulation, stopSimulation]);
  
  // 结算由 store.endTradingDay 在最后一个交易日 15:00 收盘时触发（isFinalDay →
  // endMatch + gameStatus='settlement'）。这里不再用 currentDay>=maxDays 提前
  // 结束，否则第 5 天一开盘就会被强制结算。

  // Show settlement modal
  useEffect(() => {
    if (gameStatus === 'settlement') {
      setShowSettlement(true);
    }
  }, [gameStatus]);
  
  const handleCloseSettlement = () => {
    setShowSettlement(false);
    endMatch();
    setSection('overview');
  };

  // "再来一局"：先整局重置（清空持仓、现金回到 1 亿），再进入匹配流程
  const handlePlayAgain = () => {
    setShowSettlement(false);
    const st = useGameStore.getState();
    st.restartMatch();
    st.startMatch();
    setSection('overview');
  };

  const renderPageBySection = (s: NavSection) => {
    switch (s) {
      case 'overview':
        return <Dashboard />;
      case 'markets':
        return <Markets />;
      case 'portfolio':
        return <Portfolio />;
      case 'watchlist':
        return <Watchlist />;
      case 'news':
        return <News />;
      case 'tools':
        return <Tools />;
      case 'messages':
        return <Messages />;
      case 'rankings':
        return <Rankings />;
      case 'regulator':
        return <RegulatorPanelPage />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const handleBackToRolePanel = () => {
    setSection(role === 'regulator' ? 'regulator' : 'overview');
  };

  const renderContent = () => {
    // When playing: render the section. Tools 页自身会根据 gameStatus === 'playing'
    // 切到 DealerPanel/TradePanel/RegulatorPanel；这里不重复切换。
    if (gameStatus === 'playing') {
      if (section === 'overview' || section === 'regulator') {
        return (
          <>
            <PlayingBanner role={role} onBack={handleBackToRolePanel} />
            {renderPageBySection(section)}
          </>
        );
      }
      return (
        <>
          <PlayingBanner role={role} onBack={handleBackToRolePanel} />
          {renderPageBySection(section)}
        </>
      );
    }

    // Idle / matching / reversed: render the selected section directly
    if (section === 'tools') {
      return <Tools />;
    }
    if (section === 'regulator') {
      return <RegulatorPanelPage />;
    }
    return renderPageBySection(section);
  };

  // 双壳挂载 (CSS-level switching)：两个 shell 都被挂在 DOM，
  // 但通过 data-mobile + media query 决定哪个可见。这样
  // resize / 横竖屏切换时不需要重新挂载 React 子树，无闪烁；
  // 同时即便 useIsMobile 初始化有误（如 SSR 时返回 1024），
  // CSS media query 也会保证小屏下展示的是 .mobile-shell。
  //
  // 每个 shell 内部 if (!isMounted) return null; —— 不激活的
  // shell 完全不渲染任何子节点，避免重复 toast / 多份 WebSocket。
  return (
    <div className="app-shell" data-mobile={isMobile ? '1' : '0'} data-vw={viewportW}>
      {/* 桌面壳 */}
      <div className="desktop-shell" aria-hidden={isMobile}>
        {!isMobile && (
          <>
            <Sidebar
              activeSection={section}
              onSectionChange={setSection}
            />
            <Header />
            <main className="app-main">
              <GameInfoSidebar />
              <div className="content-area" key={`${section}-${role}`}>
                {renderContent()}
              </div>
            </main>
            <StatusBar />

            <Toast />
            <MatchAlertModal />
            <MatchOverlay />
            <DailySettlementModal />
            <SettlementModal
              open={showSettlement}
              onClose={handleCloseSettlement}
              onPlayAgain={handlePlayAgain}
            />
          </>
        )}
      </div>

      {/* 移动壳 */}
      <div className="mobile-shell" aria-hidden={!isMobile}>
        {isMobile && <MobileApp />}
      </div>
    </div>
  );
}

function MatchAlertModal() {
  const modal = useGameStore(s => s.modal);
  const dismissModal = useGameStore(s => s.dismissModal);
  const confirmSoloFallback = useGameStore(s => s._confirmSoloFallback);
  if (!modal) return null;

  const titleMap: Record<string, string> = {
    disconnect: '连接中断',
    forfeit: '弃权',
    room_destroyed: '房间已销毁',
    kicked: '监管处罚',
  };

  const isSoloConfirm = modal.type === 'solo_confirm';
  const isKicked = modal.type === 'kicked';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={isSoloConfirm || isKicked ? undefined : dismissModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          padding: '24px 28px',
          maxWidth: 400,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--text-primary)' }}>
          {modal.title ?? titleMap[modal.type] ?? '提示'}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {modal.message}
        </p>
        {isSoloConfirm ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => { void confirmSoloFallback(); }}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--text-primary)',
                color: 'var(--bg-base)',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              切换单人模式
            </button>
            <button
              type="button"
              onClick={() => {
                dismissModal();
                void useGameStore.getState().startOnlineQuickMatch();
              }}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              继续等待
            </button>
          </div>
        ) : isKicked ? (
          <button
            type="button"
            onClick={() => { dismissModal(); useGameStore.getState().setGameStatus('settlement'); }}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'var(--color-danger)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            确认
          </button>
        ) : (
          <button
            type="button"
            onClick={dismissModal}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'var(--text-primary)',
              color: 'var(--bg-base)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            知道了
          </button>
        )}
      </div>
    </div>
  );
}

function Toast() {
  const toast = useGameStore(s => s.toast);
  if (!toast) return null;
  const colorMap: Record<string, string> = {
    info: '#60a5fa',
    success: '#22c55e',
    warning: '#fb923c',
    danger: '#ef4444',
  };
  return (
    <div
      key={toast.id}
      style={{
        position: 'fixed',
        top: 84,
        right: 24,
        zIndex: 500,
        padding: '12px 18px',
        background: 'var(--bg-elevated)',
        border: `1px solid ${colorMap[toast.type]}`,
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        color: 'var(--text-primary)',
        fontSize: 14,
        maxWidth: 360,
        animation: 'slideInRight 0.25s ease-out',
      }}
    >
      <span style={{ color: colorMap[toast.type], fontWeight: 600, marginRight: 8 }}>
        ●
      </span>
      {toast.message}
    </div>
  );
}

export default App;

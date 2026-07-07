import { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import Header from './components/Header';
import Sidebar, { NavSection } from './components/Sidebar';
import GameInfoSidebar from './components/GameInfoSidebar';
import StatusBar from './components/StatusBar';
import MatchOverlay from './components/MatchOverlay';
import SettlementModal from './components/SettlementModal';
import Dashboard from './pages/Dashboard';
import TradePanel from './pages/TradePanel';
import DealerPanelPage from './pages/DealerPanel';
import RegulatorPanelPage from './pages/RegulatorPanel';
import Markets from './pages/Markets';
import Portfolio from './pages/Portfolio';
import Watchlist from './pages/Watchlist';
import News from './pages/News';
import Tools from './pages/Tools';
import Messages from './pages/Messages';
import Rankings from './pages/Rankings';
import Settings from './pages/Settings';
import './App.css';

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

  const { role, gameStatus, setGameStatus, currentDay, maxDays, endMatch, startSimulation, stopSimulation } = useGameStore();

  // Update currentSection in store
  useEffect(() => {
    useGameStore.setState({ currentSection: section });
  }, [section]);

  // Tick engine lifecycle
  useEffect(() => {
    if (gameStatus === 'playing') {
      startSimulation();
    } else {
      stopSimulation();
    }
    return () => stopSimulation();
  }, [gameStatus, startSimulation, stopSimulation]);
  
  // Auto-trigger settlement at end of game
  useEffect(() => {
    if (gameStatus === 'playing' && currentDay >= maxDays) {
      const t = setTimeout(() => {
        setGameStatus('settlement');
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [gameStatus, currentDay, maxDays, setGameStatus]);
  
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

  const renderRolePanel = () => {
    if (role === 'dealer') return <DealerPanelPage />;
    if (role === 'regulator') return <RegulatorPanelPage />;
    return <TradePanel />;
  };

  const handleBackToRolePanel = () => {
    setSection(role === 'regulator' ? 'regulator' : 'overview');
  };

  const renderContent = () => {
    // When playing: still allow sidebar navigation, but show a banner + the role panel as default tab
    if (gameStatus === 'playing') {
      // Tools / Markets / News / Portfolio / Watchlist / Messages / Rankings / Settings → render selected page
      // overview / regulator / (default) → render role panel
      if (section === 'overview' || section === 'regulator' || section === 'tools') {
        return (
          <>
            <PlayingBanner role={role} onBack={handleBackToRolePanel} />
            {section === 'tools' ? renderRolePanel() : renderPageBySection(section)}
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
    if (section === 'regulator' || section === 'tools') {
      return section === 'tools' ? <Tools /> : <RegulatorPanelPage />;
    }
    return renderPageBySection(section);
  };

  return (
    <div className="app">
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

      {/* Global Toast */}
      <Toast />

      {/* Match Flow Overlay (matching -> reversed) */}
      <MatchOverlay />

      {/* Settlement Modal */}
      <SettlementModal
        open={showSettlement}
        onClose={handleCloseSettlement}
      />
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

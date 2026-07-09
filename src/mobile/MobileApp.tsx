/**
 * 移动端根路由。
 * 5 Tab：home / markets / trade / portfolio / profile
 * 触控目标 >= 44px
 * 复用 gameStore；不改任何 store 逻辑。
 */

import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import MobileHome from './pages/Home';
import MobileMarkets from './pages/Markets';
import MobileTrade from './pages/Trade';
import MobilePortfolio from './pages/Portfolio';
import MobileProfile from './pages/Profile';
import MobileBottomNav, { MobileTab } from './components/BottomNav';
import MobileMatchOverlay from './components/MatchOverlay';
import MobileDailySettlementModal from './components/DailySettlementModal';
import MobileSettlementModal from './components/SettlementModal';
import { useViewportWidth } from './hooks/useViewportWidth';
import './mobile.css';

export default function MobileApp() {
  const [tab, setTab] = useState<MobileTab>('home');
  const w = useViewportWidth();
  const gameStatus = useGameStore((s) => s.gameStatus);
  const endMatch = useGameStore((s) => s.endMatch);
  const restartMatch = useGameStore((s) => s.restartMatch);
  const startMatch = useGameStore((s) => s.startMatch);
  const [showFinal, setShowFinal] = useState(false);
  const toast = useGameStore((s) => s.toast);

  // 切到 settlement 时弹最终结算
  useEffect(() => {
    if (gameStatus === 'settlement') setShowFinal(true);
  }, [gameStatus]);

  // 强制 >= 44px 的 viewport meta 检查
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement('meta');
      vp.setAttribute('name', 'viewport');
      document.head.appendChild(vp);
    }
    vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  }, []);

  // 其它页面通过 m-goto-tab CustomEvent 切 tab（如 Markets 的"买入"按钮跳到 Trade）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onGoto = (e: Event) => {
      const t = (e as CustomEvent<{ tab: MobileTab }>).detail?.tab;
      if (t && ['home', 'markets', 'trade', 'portfolio', 'profile'].includes(t)) {
        setTab(t);
      }
    };
    document.addEventListener('m-goto-tab', onGoto);
    return () => document.removeEventListener('m-goto-tab', onGoto);
  }, []);

  let page: React.ReactNode = null;
  if (tab === 'home') page = <MobileHome onTabChange={setTab} />;
  else if (tab === 'markets') page = <MobileMarkets />;
  else if (tab === 'trade') page = <MobileTrade />;
  else if (tab === 'portfolio') page = <MobilePortfolio />;
  else if (tab === 'profile') page = <MobileProfile />;

  return (
    <div className="m-app" data-vw={w}>
      <div className="m-page">{page}</div>
      <MobileBottomNav tab={tab} onTabChange={setTab} />

      {/* 浮 Toast */}
      {toast && (
        <div key={toast.id} className={`m-toast m-toast-${toast.type}`}>
          <span className="m-toast-dot" />
          {toast.message}
        </div>
      )}

      {/* 匹配流程遮罩（matching / reversed） */}
      <MobileMatchOverlay />

      {/* 午盘/收盘结算 */}
      <MobileDailySettlementModal />

      {/* 整局结算 */}
      {showFinal && (
        <MobileSettlementModal
          open
          onClose={() => { setShowFinal(false); endMatch(); setTab('home'); }}
          onPlayAgain={() => {
            setShowFinal(false);
            restartMatch();
            startMatch();
            setTab('home');
          }}
        />
      )}
    </div>
  );
}

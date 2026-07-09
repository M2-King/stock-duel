/**
 * 5 Tab 底部导航。
 * 触控目标 >= 44px。
 */

import { useGameStore } from '../../store/gameStore';

export type MobileTab = 'home' | 'markets' | 'trade' | 'portfolio' | 'profile';

interface TabDef {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  {
    id: 'home',
    label: '首页',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-6h4v6" />
      </svg>
    ),
  },
  {
    id: 'markets',
    label: '行情',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </svg>
    ),
  },
  {
    id: 'trade',
    label: '交易',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7h13l3 3v7h-3" />
        <path d="M3 7l3-3h6l3 3" />
        <path d="M8 14h6" />
        <circle cx="7" cy="17" r="1.5" />
        <circle cx="15" cy="17" r="1.5" />
      </svg>
    ),
  },
  {
    id: 'portfolio',
    label: '持仓',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="M8 6V4h8v2" />
        <path d="M3 11h18" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: '我的',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

interface Props {
  tab: MobileTab;
  onTabChange: (t: MobileTab) => void;
}

export default function MobileBottomNav({ tab, onTabChange }: Props) {
  const gameStatus = useGameStore((s) => s.gameStatus);
  const unreadAlerts = useGameStore((s) => s.alerts.length);
  // 交易 Tab 是主操作 — 对局进行中给一个高亮提示
  const tradeHot = gameStatus === 'playing';

  return (
    <nav className="m-bottom-nav" role="tablist" aria-label="主导航">
      {TABS.map((t) => {
        const active = t.id === tab;
        const isTrade = t.id === 'trade';
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            className={`m-tab ${active ? 'active' : ''} ${isTrade ? 'trade' : ''}`}
            onClick={() => onTabChange(t.id)}
            type="button"
          >
            <span className="m-tab-icon">
              {t.icon}
              {isTrade && tradeHot && <span className="m-tab-badge" aria-hidden="true" />}
              {t.id === 'profile' && unreadAlerts > 0 && (
                <span className="m-tab-red-dot" aria-hidden="true" />
              )}
            </span>
            <span className="m-tab-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

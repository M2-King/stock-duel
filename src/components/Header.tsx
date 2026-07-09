import { useState, useEffect, useRef } from 'react';

// 单一时钟：Header 只读 tick 引擎派生出的时间（clockFromTick），

// 不再维护独立的实时/roundTime 推进逻辑。

import { useGameStore, GameStatus, Role } from '../store/gameStore';

import { clockFromTick, sessionLabel } from '../utils/clock';

import MatchModePopover from './MatchModePopover';

import './Header.css';



const statusMap: Record<GameStatus, { label: string; color: string; live?: boolean }> = {

  idle: { label: 'Not Playing', color: 'var(--text-muted)' },

  waiting: { label: 'Waiting', color: 'var(--color-info)', live: true },

  matching: { label: 'Matchmaking', color: 'var(--color-warning)', live: true },

  reversed: { label: 'Reversed', color: 'var(--color-info)' },

  playing: { label: 'LIVE', color: 'var(--color-success)', live: true },

  settlement: { label: 'Settlement', color: 'var(--text-secondary)' },

};



const roleMeta: Record<Role, { label: string; icon: string; color: string; desc: string }> = {

  dealer: { label: 'Market Maker', icon: '🏦', color: '#a78bfa', desc: 'Influence market prices with 6 manipulation tools.' },

  retail: { label: 'Retail Investor', icon: '📈', color: '#60a5fa', desc: 'Standard trader with technical indicators and orders.' },

  regulator: { label: 'SEC Agent', icon: '⚖️', color: '#fb923c', desc: 'Oversee market integrity and enforce rules.' },

};



// Map currentTick (0..60 per half-session) to real A-share clock

// (clockFromTick is imported from ../utils/clock — single source of truth)



export default function Header() {

  const {

    role, userName, gameStatus, portfolioTotal, setRole,

    currentDay, maxDays, currentTick, simulation,

  } = useGameStore();

  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);

  const [matchPopoverOpen, setMatchPopoverOpen] = useState(false);

  const rolePopoverRef = useRef<HTMLDivElement>(null);

  const matchPopoverRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    if (!rolePopoverOpen) return;

    const onDoc = (e: MouseEvent) => {

      if (rolePopoverRef.current && !rolePopoverRef.current.contains(e.target as Node)) {

        setRolePopoverOpen(false);

      }

    };

    document.addEventListener('mousedown', onDoc);

    return () => document.removeEventListener('mousedown', onDoc);

  }, [rolePopoverOpen]);



  useEffect(() => {

    if (!matchPopoverOpen) return;

    const onDoc = (e: MouseEvent) => {

      if (matchPopoverRef.current && !matchPopoverRef.current.contains(e.target as Node)) {

        setMatchPopoverOpen(false);

      }

    };

    document.addEventListener('mousedown', onDoc);

    return () => document.removeEventListener('mousedown', onDoc);

  }, [matchPopoverOpen]);



  const session = simulation.session;

  const clock = gameStatus === 'playing' ? clockFromTick(session, currentTick) : '--:--';

  const sessionText = gameStatus === 'playing' ? sessionLabel[session] : 'Idle';



  const status = statusMap[gameStatus];

  const meta = roleMeta[role];



  const handleSelectRole = (r: Role) => {

    setRole(r);

    setRolePopoverOpen(false);

  };



  return (

    <header className="header">

      <div className="header-left">

        <div className="game-info">

          <div className="game-info-top">

            <span className="match-label">Online Match</span>

            <span className="live-badge" style={{ color: status.color }}>

              {status.live && <span className="live-dot" />}

              {status.label}

            </span>

          </div>

          <div className="game-info-bottom">

            {gameStatus === 'playing'

              ? `Round Day ${currentDay} / ${maxDays}`

              : 'Round Idle'}

          </div>

        </div>



        {gameStatus === 'idle' && (

          <div className="find-match-wrap" ref={matchPopoverRef}>

            <button

              type="button"

              className="find-match-btn"

              onClick={() => setMatchPopoverOpen((o) => !o)}

              aria-haspopup="dialog"

              aria-expanded={matchPopoverOpen}

            >

              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>

              </svg>

              Find Match

            </button>

            {matchPopoverOpen && (

              <MatchModePopover onClose={() => setMatchPopoverOpen(false)} />

            )}

          </div>

        )}

      </div>



      <div className="header-center">

        <div className="round-time mono">{clock}</div>

        <div className="market-status">

          {sessionText}

        </div>

      </div>



      <div className="header-right">

        <button className="header-btn" aria-label="Notifications" onClick={() => {

          useGameStore.setState({ currentSection: 'messages' });

        }}>

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">

            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>

            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>

          </svg>

          <span className="notif-dot"></span>

        </button>

        <button type="button" className="header-btn" aria-label="Help" title="游戏帮助" onClick={() => {

          useGameStore.setState({ currentSection: 'settings' });

        }}>

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">

            <circle cx="12" cy="12" r="10"/>

            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>

            <line x1="12" y1="17" x2="12.01" y2="17"/>

          </svg>

        </button>

        <button className="header-btn" aria-label="Settings" onClick={() => {

          useGameStore.setState({ currentSection: 'settings' });

        }}>

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">

            <circle cx="12" cy="12" r="3"/>

            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>

          </svg>

        </button>



        <div className="profile-wrap" ref={rolePopoverRef}>

          <button

            className={`profile-chip role-${role}`}

            onClick={() => setRolePopoverOpen(o => !o)}

            aria-haspopup="menu"

            aria-expanded={rolePopoverOpen}

          >

            <div className="profile-avatar" style={{ background: meta.color + '22' }}>

              <span className="avatar-emoji">{meta.icon}</span>

            </div>

            <div className="profile-info">

              <div className="profile-role">{meta.label}</div>

              <div className="profile-name">{userName}</div>

            </div>

            <div className="profile-balance mono">¥{(portfolioTotal / 10000).toFixed(0)}万</div>

            <svg className={`profile-chevron ${rolePopoverOpen ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">

              <polyline points="6 9 12 15 18 9"/>

            </svg>

          </button>



          {rolePopoverOpen && (

            <div className="role-popover" role="menu">

              <div className="popover-header">

                <span className="popover-title">Switch Role</span>

                <span className="popover-current">Active: {meta.label}</span>

              </div>

              {(Object.keys(roleMeta) as Role[]).map(r => {

                const m = roleMeta[r];

                const active = role === r;

                return (

                  <button

                    key={r}

                    className={`role-option ${active ? 'active' : ''}`}

                    onClick={() => handleSelectRole(r)}

                    role="menuitemradio"

                    aria-checked={active}

                    style={{ '--role-color': m.color } as React.CSSProperties}

                  >

                    <span className="role-option-icon">{m.icon}</span>

                    <span className="role-option-info">

                      <span className="role-option-label">{m.label}</span>

                      <span className="role-option-desc">{m.desc}</span>

                    </span>

                    {active && <span className="role-option-check">✓</span>}

                  </button>

                );

              })}

              <div className="popover-footer">

                <span>Tip: role changes take effect immediately across all panels.</span>

              </div>

            </div>

          )}

        </div>

      </div>

    </header>

  );

}


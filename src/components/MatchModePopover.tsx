import { useState, useEffect, useCallback } from 'react';
import { useGameStore, Role } from '../store/gameStore';
import { apiMatch } from '../services/apiService';
import './MatchModePopover.css';

type PopoverStep = 'mode' | 'online-players' | 'online-lobby' | 'offline-role';
type OnlineTab = 'quick' | 'create' | 'rooms';

const offlineOptions: { role: Role; icon: string; title: string; desc: string }[] = [
  { role: 'dealer', icon: '🏦', title: '庄家', desc: 'AI 散户 + AI 监管' },
  { role: 'retail', icon: '📈', title: '散户', desc: 'AI 庄家 + AI 监管' },
  { role: 'regulator', icon: '⚖️', title: '监管', desc: 'AI 庄家 + AI 散户' },
];

interface LobbyRoom {
  code: string;
  hostId: string;
  ageMs: number;
}

interface MatchModePopoverProps {
  onClose: () => void;
}

export default function MatchModePopover({ onClose }: MatchModePopoverProps) {
  const {
    backendMode,
    startOnlineQuickMatch, startOfflinePractice,
    createOnlineRoom, joinOnlineRoom,
    onlinePlayerCount,
  } = useGameStore();

  const [step, setStep] = useState<PopoverStep>('mode');
  const [onlineTab, setOnlineTab] = useState<OnlineTab>('quick');
  const [, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [lobbyLoading, setLobbyLoading] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLobbyLoading(true);
    if (backendMode) {
      const r = await apiMatch.lobby();
      if (r.code === 0 && r.data?.rooms) {
        setRooms(r.data.rooms);
      } else {
        setRooms([]);
      }
    } else {
      setRooms([
        { code: 'AB3K9X', hostId: 'guest_demo', ageMs: 120000 },
        { code: 'PQ7R2M', hostId: 'player_42', ageMs: 340000 },
      ]);
    }
    setLobbyLoading(false);
  }, [backendMode]);

  useEffect(() => {
    if (step === 'online-lobby' && onlineTab === 'rooms') {
      fetchRooms();
    }
  }, [step, onlineTab, fetchRooms]);

  const closeAndReset = () => {
    setStep('mode');
    setRoomCode(null);
    setOnlineTab('quick');
    onClose();
  };

  const goBack = () => {
    switch (step) {
      case 'mode':
        closeAndReset();
        break;
      case 'online-players':
        setStep('mode');
        break;
      case 'online-lobby':
        setRoomCode(null);
        setOnlineTab('quick');
        setStep('online-players');
        break;
      case 'offline-role':
        setStep('mode');
        break;
      default:
        break;
    }
  };

  const handleQuickMatch = async () => {
    setLoading(true);
    closeAndReset();
    await startOnlineQuickMatch();
    setLoading(false);
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    closeAndReset();
    await createOnlineRoom(onlinePlayerCount);
    setLoading(false);
  };

  const handleJoinRoom = async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    closeAndReset();
    await joinOnlineRoom(code.trim().toUpperCase());
    setLoading(false);
  };

  const handleOfflineStart = async (practiceRole: Role) => {
    setLoading(true);
    closeAndReset();
    await startOfflinePractice(practiceRole);
    setLoading(false);
  };

  const handleSelectPlayerCount = (count: 2 | 3) => {
    useGameStore.setState({ onlinePlayerCount: count });
    setStep('online-lobby');
  };

  const formatAge = (ms: number) => {
    const min = Math.floor(ms / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return `${min} 分钟前`;
    return `${Math.floor(min / 60)} 小时前`;
  };

  const stepTitle: Record<PopoverStep, string> = {
    mode: '选择模式',
    'online-players': '选择人数',
    'online-lobby': '在线大厅',
    'offline-role': '选择角色',
  };

  return (
    <div className="match-mode-popover" onClick={(e) => e.stopPropagation()}>
      <div className="match-popover-header">
        <button type="button" className="match-popover-back" onClick={goBack}>
          ←
        </button>
        <h3 className="match-popover-title">{stepTitle[step]}</h3>
      </div>

      {step === 'mode' && (
        <div className="match-popover-options">
          <button
            type="button"
            className="match-popover-option"
            onClick={() => setStep('online-players')}
            disabled={loading}
          >
            <span className="match-popover-option-icon">🔵</span>
            <div className="match-popover-option-text">
              <span className="match-popover-option-label">Online</span>
              <span className="match-popover-option-desc">在线对战</span>
            </div>
          </button>
          <button
            type="button"
            className="match-popover-option"
            onClick={() => setStep('offline-role')}
            disabled={loading}
          >
            <span className="match-popover-option-icon">⚫</span>
            <div className="match-popover-option-text">
              <span className="match-popover-option-label">Offline</span>
              <span className="match-popover-option-desc">单人练习</span>
            </div>
          </button>
        </div>
      )}

      {step === 'online-players' && (
        <div className="match-popover-options">
          <button
            type="button"
            className="match-popover-option"
            onClick={() => handleSelectPlayerCount(2)}
            disabled={loading}
          >
            <span className="match-popover-option-icon">👥</span>
            <div className="match-popover-option-text">
              <span className="match-popover-option-label">双人对战</span>
            </div>
          </button>
          <button
            type="button"
            className="match-popover-option"
            onClick={() => handleSelectPlayerCount(3)}
            disabled={loading}
          >
            <span className="match-popover-option-icon">👥👥</span>
            <div className="match-popover-option-text">
              <span className="match-popover-option-label">三人对战</span>
              <span className="match-popover-option-desc">庄家 · 散户 · 监管</span>
            </div>
          </button>
        </div>
      )}

      {step === 'offline-role' && (
        <div className="match-popover-options">
          {offlineOptions.map((opt) => (
            <button
              key={opt.role}
              type="button"
              className="match-popover-option"
              onClick={() => handleOfflineStart(opt.role)}
              disabled={loading}
            >
              <span className="match-popover-option-icon">{opt.icon}</span>
              <div className="match-popover-option-text">
                <span className="match-popover-option-label">{opt.title}</span>
                <span className="match-popover-option-desc">→ {opt.desc}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === 'online-lobby' && (
        <>
          <div className="match-popover-tabs">
            {(['quick', 'create', 'rooms'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`match-popover-tab ${onlineTab === tab ? 'active' : ''}`}
                onClick={() => { setOnlineTab(tab); setRoomCode(null); }}
              >
                {tab === 'quick' ? '快速匹配' : tab === 'create' ? '创建房间' : '房间列表'}
              </button>
            ))}
          </div>

          {onlineTab === 'quick' && (
            <>
              <p className="match-lobby-hint">匹配成功后由系统分配身份，翻牌揭晓</p>
              <button
                type="button"
                className="match-action-btn primary"
                onClick={handleQuickMatch}
                disabled={loading}
              >
                {loading ? '匹配中...' : '开始快速匹配'}
              </button>
            </>
          )}

          {onlineTab === 'create' && (
            <>
              <p className="match-lobby-hint">
                创建 {onlinePlayerCount} 人房间，分享房间码邀请好友
              </p>
              <button
                type="button"
                className="match-action-btn primary"
                onClick={handleCreateRoom}
                disabled={loading}
              >
                {loading ? '创建中...' : '创建房间'}
              </button>
            </>
          )}

          {onlineTab === 'rooms' && (
            <>
              <div className="match-rooms-header">
                <div className="match-section-label" style={{ margin: 0 }}>等待中的房间</div>
                <button
                  type="button"
                  className="match-action-btn secondary"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: 10 }}
                  onClick={fetchRooms}
                  disabled={lobbyLoading}
                >
                  {lobbyLoading ? '...' : '刷新'}
                </button>
              </div>
              <div className="match-room-list">
                {rooms.length === 0 ? (
                  <div className="match-room-empty">
                    {lobbyLoading ? '加载中...' : '暂无等待中的房间'}
                  </div>
                ) : (
                  rooms.map((r) => (
                    <div key={r.code} className="match-room-list-item">
                      <div>
                        <div className="match-room-list-code">{r.code}</div>
                        <div className="match-room-list-meta">{formatAge(r.ageMs)} · {r.hostId.slice(0, 8)}</div>
                      </div>
                      <button
                        type="button"
                        className="match-room-join-btn"
                        onClick={() => handleJoinRoom(r.code)}
                        disabled={loading}
                      >
                        加入
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div>
                <div className="match-section-label">输入房间码</div>
                <input
                  className="match-join-code-input"
                  placeholder="6 位房间码"
                  value={joinCode}
                  maxLength={6}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
              </div>
              <button
                type="button"
                className="match-action-btn primary"
                onClick={() => handleJoinRoom(joinCode)}
                disabled={loading || joinCode.length < 6}
              >
                加入房间
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

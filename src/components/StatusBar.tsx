import { useGameStore } from '../store/gameStore';
import { clockFromTickSeconds } from '../utils/clock';
import './StatusBar.css';

export default function StatusBar() {
  const { currentTick, simulation, gameStatus, backendMode, wsStatus } = useGameStore();

  // Single clock: same source of truth as Header.
  const tickClock = clockFromTickSeconds(simulation.session, currentTick);

  // 后端连接状态映射文案
  const connLabel = backendMode
    ? (wsStatus === 'connected' ? 'Backend Live' : wsStatus === 'connecting' ? 'Connecting…' : wsStatus === 'error' ? 'Backend Error' : 'Backend Idle')
    : 'Local Sim';
  const connClass = backendMode
    ? (wsStatus === 'connected' ? 'good' : 'warning')
    : 'local';

  return (
    <footer className="status-bar">
      <div className="status-left">
        <div className="status-item">
          <span className="status-label">⚡ Source</span>
          <span className={`status-value ${connClass}`}>{connLabel}</span>
        </div>
        <div className="status-item">
          <span className="status-label">📍 Mode</span>
          <span className="status-value">{backendMode ? 'Remote' : 'Local'}</span>
        </div>
        <div className="status-item">
          <span className="status-label">⏱ Tick</span>
          <span className="status-value mono">200ms</span>
        </div>
        <div className="status-item">
          <span className="status-label">⏰ Clock</span>
          <span className="status-value mono">{gameStatus === 'playing' ? tickClock : '--:--:--'}</span>
        </div>
      </div>

      <div className="status-right">
        <div className="status-item">
          <span className="status-label">ⓘ Disclaimer</span>
        </div>
        <div className="status-item">
          <span className="status-label">📜 Terms</span>
        </div>
      </div>
    </footer>
  );
}

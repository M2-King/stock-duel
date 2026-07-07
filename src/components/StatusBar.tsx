import { useGameStore } from '../store/gameStore';
import { useEffect, useState } from 'react';
import { clockFromTickSeconds } from '../utils/clock';
import './StatusBar.css';

export default function StatusBar() {
  const { currentTick, simulation, gameStatus } = useGameStore();
  const [latency] = useState(32);
  const [server] = useState('US East');
  const [connection] = useState('Good');

  // Single clock: same source of truth as Header.
  const tickClock = clockFromTickSeconds(simulation.session, currentTick);

  return (
    <footer className="status-bar">
      <div className="status-left">
        <div className="status-item">
          <span className="status-label">⚡ Connection</span>
          <span className={`status-value ${connection.toLowerCase()}`}>{connection}</span>
        </div>
        <div className="status-item">
          <span className="status-label">📍 Server</span>
          <span className="status-value">{server}</span>
        </div>
        <div className="status-item">
          <span className="status-label">⏱ Latency</span>
          <span className="status-value mono">{latency}ms</span>
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

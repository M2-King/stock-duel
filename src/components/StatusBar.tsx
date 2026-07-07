import { useGameStore } from '../store/gameStore';
import { useEffect, useState } from 'react';
import './StatusBar.css';

export default function StatusBar() {
  const { roundTime } = useGameStore();
  const [latency] = useState(32);
  const [server] = useState('US East');
  const [connection] = useState('Good');
  
  const h = String(Math.floor(roundTime / 3600)).padStart(2, '0');
  const m = String(Math.floor((roundTime % 3600) / 60)).padStart(2, '0');
  const s = String(roundTime % 60).padStart(2, '0');
  
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
          <span className="status-label">⏰ Round Time</span>
          <span className="status-value mono">{h}:{m}:{s}</span>
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

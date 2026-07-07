import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import DealerPanel from '../components/panels/DealerPanel';
import RetailPanel from '../components/panels/RetailPanel';
import RegulatorPanel from '../components/panels/RegulatorPanel';
import './GameRoom.css';

export default function GameRoom() {
  const { role, gameStatus } = useGameStore();
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    // Start game loop - 200ms per tick; engine is now owned by App.tsx
    if (gameStatus === 'playing') {
      tickRef.current = window.setInterval(() => {
        // tick handled by store.startSimulation
      }, 200);
    }

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
      }
    };
  }, [gameStatus]);

  const renderPanel = () => {
    switch (role) {
      case 'dealer':
        return <DealerPanel />;
      case 'retail':
        return <RetailPanel />;
      case 'regulator':
        return <RegulatorPanel />;
      default:
        return <RetailPanel />;
    }
  };

  return (
    <div className="game-room">
      <div className="game-layout">
        {/* Main Panel Area */}
        <div className="game-main">
          {renderPanel()}
        </div>
      </div>
    </div>
  );
}

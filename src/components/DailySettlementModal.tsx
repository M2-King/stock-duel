import { useGameStore } from '../store/gameStore';
import './DailySettlementModal.css';

export default function DailySettlementModal() {
  const settlement = useGameStore(s => s.simulation.dailySettlement);
  const resumeAfternoon = useGameStore(s => s.resumeAfternoon);
  const resumeNextDay = useGameStore(s => s.resumeNextDay);
  const session = useGameStore(s => s.simulation.session);
  const role = useGameStore(s => s.role);

  if (!settlement) return null;

  const isLunch = session === 'lunch';
  const isClosed = session === 'closed';
  const isUp = settlement.pnl >= 0;
  const priceUp = settlement.close >= settlement.open;
  const priceColor = priceUp ? 'var(--price-up)' : 'var(--price-down)';

  const title = isLunch
    ? `☕ 11:30 中午收盘`
    : `🔔 第 ${settlement.day} 日 15:00 收盘`;
  const subtitle = isLunch
    ? '上午盘结束，进入 90 分钟午休 — 1.5 分钟后自动重启下午盘'
    : '今日交易结束 — 2 分钟后自动进入下一交易日';
  const cta = isLunch ? '继续下午盘' : '进入下一日';

  return (
    <div className="daily-settlement-overlay">
      <div className="daily-settlement-modal">
        <div className="dsm-header">
          <div className="dsm-title">{title}</div>
          <div className="dsm-subtitle">{subtitle}</div>
        </div>

        <div className="dsm-stats">
          <div className="dsm-stat">
            <div className="dsm-stat-label">开盘价</div>
            <div className="dsm-stat-value mono">¥{settlement.open.toFixed(2)}</div>
          </div>
          <div className="dsm-stat">
            <div className="dsm-stat-label">收盘价</div>
            <div className="dsm-stat-value mono" style={{ color: priceColor }}>
              ¥{settlement.close.toFixed(2)}
            </div>
          </div>
          <div className="dsm-stat">
            <div className="dsm-stat-label">今日盈亏</div>
            <div className="dsm-stat-value mono" style={{ color: isUp ? 'var(--price-up)' : 'var(--price-down)' }}>
              {isUp ? '+' : ''}¥{(settlement.pnl / 10000).toFixed(2)}万
              <div className="dsm-stat-sub" style={{ color: isUp ? 'var(--price-up)' : 'var(--price-down)' }}>
                {isUp ? '+' : ''}{settlement.pnlPercent.toFixed(2)}%
              </div>
            </div>
          </div>
          <div className="dsm-stat">
            <div className="dsm-stat-label">累计交易</div>
            <div className="dsm-stat-value mono">{settlement.trades}</div>
          </div>
        </div>

        <div className="dsm-role-tip">
          {role === 'dealer' && (
            <>
              <span className="dsm-role-icon">🏦</span>
              庄家提示：中午 / 收盘是庄家洗盘调仓的黄金窗口，可补充现金/能量为下午操盘做准备。
            </>
          )}
          {role === 'retail' && (
            <>
              <span className="dsm-role-icon">📈</span>
              散户提示：午休复盘上午走势，下午 13:00 重新开盘 — 留有资金应对开盘跳空。
            </>
          )}
          {role === 'regulator' && (
            <>
              <span className="dsm-role-icon">⚖️</span>
              监管提示：午间 / 收盘后会发布当日监管日志；下午开盘重点关注开盘异动。
            </>
          )}
        </div>

        <div className="dsm-actions">
          <button
            className="dsm-btn dsm-btn-primary"
            onClick={isLunch ? resumeAfternoon : resumeNextDay}
          >
            {cta} →
          </button>
        </div>
      </div>
    </div>
  );
}

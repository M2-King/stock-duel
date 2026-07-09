/**
 * 移动端"午盘/收盘"结算弹窗 — 极简版
 */

import { useGameStore } from '../../store/gameStore';

export default function MobileDailySettlementModal() {
  const settlement = useGameStore((s) => s.simulation.dailySettlement);
  const session = useGameStore((s) => s.simulation.session);
  const totalAssets = useGameStore((s) => s.totalAssets);

  if (!settlement) return null;

  const isLunch = session === 'lunch';
  const isUp = settlement.pnl >= 0;
  const priceUp = settlement.close >= settlement.open;
  const priceColor = priceUp ? 'var(--price-up)' : 'var(--price-down)';

  const title = isLunch
    ? '☕ 11:30 中午收盘'
    : `🔔 第 ${settlement.day} 日 15:00 收盘`;
  const subtitle = isLunch
    ? '上午盘结束，进入午休 — 2 秒后自动重启下午盘'
    : '今日交易结束 — 2 秒后自动进入下一交易日';

  return (
    <div className="m-modal-shade">
      <div className="m-modal-card">
        <h3 className="m-modal-title">{title}</h3>
        <p className="m-modal-subtitle">{subtitle}</p>
        <div className="m-modal-stats">
          <div>
            <div className="label">开盘价</div>
            <div className="value m-mono">¥{settlement.open.toFixed(2)}</div>
          </div>
          <div>
            <div className="label">收盘价</div>
            <div className="value m-mono" style={{ color: priceColor }}>
              ¥{settlement.close.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="label">今日盈亏</div>
            <div className="value m-mono" style={{ color: isUp ? 'var(--price-up)' : 'var(--price-down)' }}>
              {isUp ? '+' : '−'}¥{Math.abs(settlement.pnl).toLocaleString()}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--m-text-3)', textAlign: 'center' }}>
          总资产 ¥{totalAssets.toLocaleString()} · 累计 {settlement.trades} 笔
        </div>
      </div>
    </div>
  );
}
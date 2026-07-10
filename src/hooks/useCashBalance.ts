/**
 * ⛳ 单点真相 — 资金 / 可用现金 / 资金池
 *
 * 历史教训：cash 字段曾经散落在 4 处：
 *   - GameState.cash               (主字段)
 *   - GameState.playerCash         (alias)
 *   - GameState.dealerResources.cash  (庄家侧别名)
 *   - GameState.dealerInfo.resources.cash (庄家侧别名)
 *
 * 工具栏和交易栏曾因为订阅不同的字段、或在本地算 cost 后没等
 * 后端回填就显示，导致两边数字不一致。
 *
 * 现在：
 *   - 所有组件必须用 useCashBalance() 读
 *   - 写 cash / playerCash / dealerResources.cash / dealerInfo.resources.cash
 *     只能走 store.cashSyncPatch() / _syncPortfolioFromServer()
 *   - 不允许在组件里 useState 一个 cash / capital / availableCash
 *   - 不允许组件自己算 cash -= cost / cash += proceeds
 */

import { useGameStore } from '../store/gameStore';

export interface CashSnapshot {
  /** 主字段 — 唯一权威 */
  cash: number;
  /** 杠杆放大后的购买力 = max(0, cash * leverage - borrowed) */
  buyingPower: number;
  /** 当前杠杆倍率 */
  leverage: number;
  /** 借款（用于杠杆买入超过 cash 时记账） */
  borrowed: number;
  /** 持仓总市值（按当前价计算） */
  positionValue: number;
  /** 总资产 = cash + positionValue - borrowed */
  totalAssets: number;
}

/**
 * 订阅 cash / leverage / borrowed / holdings，单一渲染源。
 * 返回的对象引用在每次状态变化时会刷新，所以消费方应当直接解构，
 * 而不要用 React.memo + shallow compare (会失效)。
 */
export function useCashBalance(): CashSnapshot {
  const cash = useGameStore((s) => s.cash);
  const leverage = useGameStore((s) => s.leverage);
  const borrowed = useGameStore((s) => s.borrowed);
  const holdings = useGameStore((s) => s.holdings);
  const stockPrices = useGameStore((s) => s.stockPrices);

  const positionValue = holdings.reduce((sum, h) => {
    const px = stockPrices[h.symbol] ?? h.marketPrice ?? h.avgPrice ?? 0;
    return sum + px * h.shares;
  }, 0);

  const buyingPower = Math.max(0, cash * leverage - borrowed);
  const totalAssets = cash + positionValue - borrowed;

  return { cash, leverage, borrowed, positionValue, totalAssets, buyingPower };
}

/**
 * 庄家专用 — 包含 riskIndex。
 * 同样用单一来源，不读 dealerResources.cash（与 cashSyncPatch 同步）。
 */
export function useDealerResources() {
  const cash = useGameStore((s) => s.cash);
  const riskIndex = useGameStore((s) => s.dealerResources?.riskIndex ?? 0);
  return { cash, riskIndex };
}
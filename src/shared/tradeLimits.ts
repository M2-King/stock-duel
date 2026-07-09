export const DEFAULT_TRADE_MAX_SINGLE = 5_000_000;
export const DEFAULT_TRADE_MAX_DAILY = 50_000_000;
export const FREEZE_TICKS = 70;
export const WARN_TICKS = 30;
export const FREEZE_SINGLE_RATIO = 0.1;
export const FREEZE_DAILY_RATIO = 0.3;
export const WARN_SINGLE_RATIO = FREEZE_SINGLE_RATIO * 1.2;
export const WARN_DAILY_RATIO = FREEZE_DAILY_RATIO * 1.2;

export interface StockRestriction {
  symbol: string;
  maxSingle: number;
  maxDaily: number;
  expiresTick: number;
  reason?: string;
  restrictionType?: 'warn' | 'freeze';
}

export function formatWan(amount: number): string {
  if (amount >= 10_000) return `¥${(amount / 10_000).toFixed(0)}万`;
  return `¥${amount.toLocaleString()}`;
}

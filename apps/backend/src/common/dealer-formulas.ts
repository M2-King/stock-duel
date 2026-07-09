/**
 * Dealer cost/effect formulas — MUST match frontend src/shared/dealerFormulas.ts
 */
import { getStockMeta, MARKET_CAP_BASELINE } from './stock-meta';

export type DealerToolType =
  | 'pump'
  | 'press'
  | 'accumulate'
  | 'distribute'
  | 'wash'
  | 'fake'
  | 'spoof';

export function normalizeDealerToolType(type: string): DealerToolType {
  if (type === 'fake') return 'spoof';
  return type as DealerToolType;
}

export const DEALER_BASE_COST: Record<DealerToolType, number> = {
  pump: 5_000_000,
  press: 5_000_000,
  accumulate: 8_000_000,
  distribute: 8_000_000,
  wash: 3_000_000,
  fake: 1_000_000,
  spoof: 1_000_000,
};

export const MANIPULATION_FACTOR: Record<DealerToolType, number> = {
  pump: 5,
  press: 5,
  accumulate: 3,
  distribute: 3,
  wash: 4,
  fake: 2,
  spoof: 2,
};

export const BASE_RISK: Record<DealerToolType, number> = {
  pump: 10,
  press: 10,
  accumulate: 6,
  distribute: 6,
  wash: 8,
  fake: 5,
  spoof: 5,
};

function clampPower(power: number): number {
  return Math.max(1, Math.min(100, Math.floor(power)));
}

export function computeDealerActionCost(
  type: string,
  symbol: string,
  power: number = 100,
): number {
  const t = normalizeDealerToolType(type);
  const meta = getStockMeta(symbol);
  const baseCost = DEALER_BASE_COST[t];
  const p = clampPower(power);
  const cost = baseCost * (meta.marketCap / MARKET_CAP_BASELINE) * (p / 100);
  return Math.round(cost);
}

export function computeDealerActionEffect(
  type: string,
  symbol: string,
  power: number = 100,
  costOverride?: number,
): number {
  const t = normalizeDealerToolType(type);
  const meta = getStockMeta(symbol);
  const cost = costOverride ?? computeDealerActionCost(type, symbol, power);
  const factor = MANIPULATION_FACTOR[t];
  return (cost / meta.marketCap) * 100 * factor;
}

export function computeDealerRiskIncrease(type: string, effectPct: number): number {
  const t = normalizeDealerToolType(type);
  const baseRisk = BASE_RISK[t];
  return baseRisk * (effectPct / 5);
}

export function previewDealerAction(type: string, symbol: string, power: number = 100) {
  const cost = computeDealerActionCost(type, symbol, power);
  const effectPct = computeDealerActionEffect(type, symbol, power, cost);
  const riskIncrease = computeDealerRiskIncrease(type, effectPct);
  return { cost, effectPct, riskIncrease };
}

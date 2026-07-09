import { getStockMeta, MARKET_CAP_BASELINE } from './stockMeta';

export type DealerToolType =
  | 'pump'
  | 'press'
  | 'accumulate'
  | 'distribute'
  | 'wash'
  | 'fake'
  | 'spoof';

/** Normalize frontend `fake` → backend `spoof`. */
export function normalizeDealerToolType(type: string): DealerToolType {
  if (type === 'fake') return 'spoof';
  return type as DealerToolType;
}

/** Base cost at power=100 on MARKET_CAP_BASELINE stock. */
export const DEALER_BASE_COST: Record<DealerToolType, number> = {
  pump: 5_000_000,
  press: 5_000_000,
  accumulate: 8_000_000,
  distribute: 8_000_000,
  wash: 3_000_000,
  fake: 1_000_000,
  spoof: 1_000_000,
};

/** manipulationFactor(tool) — scales price/volume impact. */
export const MANIPULATION_FACTOR: Record<DealerToolType, number> = {
  pump: 5,
  press: 5,
  accumulate: 3,
  distribute: 3,
  wash: 4,
  fake: 2,
  spoof: 2,
};

/** baseRisk for regulator riskIncrease = baseRisk * (effect% / 5). */
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

/**
 * cost = baseCost * (marketCap / 5_000_000_000) * (power / 100)
 */
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

/**
 * effect% = (cost / marketCap) * 100 * manipulationFactor
 */
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

/**
 * riskIncrease = baseRisk * (effect% / 5)
 * Small cap big move → risk rises fast; large cap small move → slow.
 */
export function computeDealerRiskIncrease(type: string, effectPct: number): number {
  const t = normalizeDealerToolType(type);
  const baseRisk = BASE_RISK[t];
  return baseRisk * (effectPct / 5);
}

export function formatDealerCost(n: number): string {
  if (n >= 100_000_000) return `¥${(n / 100_000_000).toFixed(2)}亿`;
  if (n >= 10_000) return `¥${(n / 10_000).toFixed(0)}万`;
  return `¥${n.toLocaleString()}`;
}

export function formatDealerEffectLabel(type: string, effectPct: number): string {
  const t = normalizeDealerToolType(type);
  const pct = effectPct.toFixed(2);
  switch (t) {
    case 'pump':
      return `约涨 ${pct}%`;
    case 'press':
      return `约跌 ${pct}%`;
    case 'distribute':
      return `约跌 ${(effectPct * 0.3).toFixed(2)}% · 量 +${pct}%`;
    case 'accumulate':
      return `量 +${pct}%`;
    case 'wash':
      return `量 +${pct}%`;
    case 'fake':
    case 'spoof':
      return `盘口扰动 ${pct}%`;
    default:
      return `效果 ${pct}%`;
  }
}

export interface DealerActionPreview {
  cost: number;
  effectPct: number;
  riskIncrease: number;
  effectLabel: string;
}

export function previewDealerAction(
  type: string,
  symbol: string,
  power: number = 100,
): DealerActionPreview {
  const cost = computeDealerActionCost(type, symbol, power);
  const effectPct = computeDealerActionEffect(type, symbol, power, cost);
  const riskIncrease = computeDealerRiskIncrease(type, effectPct);
  return {
    cost,
    effectPct,
    riskIncrease,
    effectLabel: formatDealerEffectLabel(type, effectPct),
  };
}

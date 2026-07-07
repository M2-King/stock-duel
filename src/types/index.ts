// Shared types consumed by the Zustand store (src/store/gameStore.ts).
//
// The store is the single source of truth for most runtime shapes (Quote, KLine,
// OrderBook, Player, NewsItem, Indicators, etc. are all defined there). This file
// only retains the types the store imports — the rich DealerInfo hierarchy and
// RegulatoryScores — to avoid duplicate/divergent definitions.

// 庄家资源（与 store 的 dealerResources 字段保持一致的规范形状）
export interface DealerResources {
  cash: number;
  energy: number;
  riskIndex: number;
}

export interface FinancialData {
  revenue: number;
  profit: number;
  pe: number;
  pb: number;
  dividend: number;
  quarter: string;
}

export interface InsiderInfo {
  type: 'buy' | 'sell';
  amount: number;
  ratio: number;
  timestamp: number;
  isFake: boolean;
}

export interface QuantFlow {
  direction: 'in' | 'out' | 'neutral';
  amount: number;
  strength: number;
}

export interface QuantFlowData {
  main: QuantFlow;
  retail: QuantFlow;
  foreign: QuantFlow;
  timestamp: number;
}

// 庄家信息（资源 + 隐藏信息），store 的 dealerInfo 字段使用该形状
export interface DealerInfo {
  resources: DealerResources;
  hiddenInfo: {
    realFinancials: FinancialData;
    insiderTrading: InsiderInfo[];
    quantFlow: QuantFlowData;
  };
}

// 监管指数（与 store 的 scores 字段保持一致）
export interface RegulatoryScores {
  manipulation: number;
  insider: number;
  misinformation: number;
}

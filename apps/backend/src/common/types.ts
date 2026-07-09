/**
 * 全局通用类型 — 与前端 src/types 对齐。
 * Domain types 也散落在各模块 service 里就近定义。
 */

export type Role = 'dealer' | 'retail' | 'regulator';
export type MatchStatus = 'idle' | 'matching' | 'playing' | 'reversed' | 'settlement' | 'finished';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'filled' | 'pending' | 'cancelled';
export type NewsType = 'verified' | 'unverified' | 'warning';

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: number;
}

export interface KLine {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface Indicators {
  ma5: number;
  ma10: number;
  ma20: number;
  macd: { diff: number; dea: number; bar: number };
  rsi: number;
  boll: { upper: number; middle: number; lower: number };
}

export interface Holding {
  symbol: string;
  shares: number;
  avgPrice: number;
  marketPrice: number;
  pnl: number;
  pnlPercent: number;
  sector: string;
}

export interface Stock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: string;
  pe: number;
}

export interface NewsItem {
  id: string;
  type: NewsType;
  title: string;
  source: string;
  tick: number;
  time: string;
  timestamp: number;
  content?: string;
  tags?: string[];
}

export interface Alert {
  id: string;
  matchId?: string;
  userId?: string;
  symbol?: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  timestamp: number;
  source: string;
  resolved?: boolean;
  indexType?: 'manipulation' | 'insider' | 'misinformation';
}

export interface DealerResources {
  cash: number;
  energy: number;
  riskIndex: number;
}

export interface DealerInfo {
  resources: DealerResources;
  hiddenInfo: any | null;
}

export interface RegulatoryScores {
  manipulation: number;
  insider: number;
  misinformation: number;
}

export interface UserDto {
  id: string;
  username: string;
  avatar: string;
  level: number;
  balance: number;
  totalMatches: number;
  wins: number;
  losses: number;
  winStreak: number;
  bestReturn: number;
  totalPnl: number;
  createdAt: number;
}

export interface PortfolioDto {
  cash: number;
  borrowed: number;
  holdings: Holding[];
  totalAssets: number;
  unrealizedPnl: number;
  todayPnl: number;
  todayPnlPercent: number;
  leverage: number;
  initialAssets: number;
}

import { create } from 'zustand';
import type { DealerInfo, RegulatoryScores, DealerResources } from '../types';
import { previewDealerAction } from '../shared/dealerFormulas';
import {
  type StockRestriction,
  FREEZE_SINGLE_RATIO,
  FREEZE_DAILY_RATIO,
  FREEZE_TICKS,
  WARN_SINGLE_RATIO,
  WARN_DAILY_RATIO,
  WARN_TICKS,
  formatWan,
} from '../shared/tradeLimits';
import * as apiService from '../services/apiService';
import * as wsSvc from '../services/wsService';
export { STOCK_META, getStockMeta, formatStockMetaLine } from '../shared/stockMeta';

/** StrictMode 双调用时复用同一次 connectBackend，避免竞态 */
let connectBackendInFlight: Promise<boolean> | null = null;

/** backend 模式：placeOrder 等待 trade:result 的一次性回调 */
let pendingTradeResult: ((payload: any) => void) | null = null;

function waitForTradeResult(timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingTradeResult) {
        pendingTradeResult = null;
        reject(new Error('交易确认超时'));
      }
    }, timeoutMs);
    pendingTradeResult = (payload) => {
      clearTimeout(timer);
      pendingTradeResult = null;
      resolve(payload);
    };
  });
}

/** 在线对局：走 WS/REST 权威资金。离线练习永远 false（即使后端在线）。 */
export function usesBackendGameState(
  state: Pick<GameState, 'backendMode' | 'matchId' | 'matchFlow'>,
): boolean {
  return state.backendMode && !!state.matchId && state.matchFlow !== 'offline';
}

export type Role = 'dealer' | 'retail' | 'regulator';

// 对局速度预设：1 交易日 = 120 tick，tickInterval = 3000 / speed(ms)
// 所以一天现实时长 = 120 * 3000 / speed / 1000 / 60 = 6 / speed 分钟。
// 默认标准档一天 6 分钟，落在需求要求的 5~7 分钟区间内。
export interface SpeedPreset {
  label: string;
  speed: number;
  minutesPerDay: number | null;
}
export const SPEED_PRESETS: SpeedPreset[] = [
  { label: '慢速 · 7 分钟/天', speed: 6 / 7, minutesPerDay: 7 },
  { label: '标准 · 6 分钟/天', speed: 1, minutesPerDay: 6 },
  { label: '快速 · 5 分钟/天', speed: 6 / 5, minutesPerDay: 5 },
  { label: '快进 ⏩ 测试', speed: 4, minutesPerDay: null },
];

export interface NewsItem {
  id: string;
  type: 'verified' | 'unverified' | 'warning';
  title: string;
  source: string;
  tick: number;
  time: string;
  timestamp: number;
  content?: string;
  tags?: string[];
}

export interface Message {
  id: string;
  from: string;
  fromRole: Role;
  subject: string;
  preview: string;
  content: string;
  timestamp: number;
  read: boolean;
  type: 'system' | 'player' | 'regulator';
}

export type GameStatus = 'idle' | 'waiting' | 'matching' | 'reversed' | 'playing' | 'settlement';
export type MatchFlow = 'online' | 'offline' | null;

export interface WaitingRoomState {
  code: string | null;
  currentPlayers: number;
  requiredPlayers: number;
  countdown: number | null;
  mode: 'room' | 'quick';
}

interface Quote {
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

interface KLine {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OrderBookEntry {
  price: number;
  quantity: number;
  orders: number;
}

interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

interface Indicators {
  ma5: number;
  ma10: number;
  ma20: number;
  macd: { diff: number; dea: number; bar: number };
  rsi: number;
  boll: { upper: number; middle: number; lower: number };
  kdj: { k: number; d: number; j: number };
  wr: number;
  dmi: { pdi: number; mdi: number; adx: number; adxr: number };
  vr: number;
}

export interface IndicatorSeries {
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  macd: { diff: (number | null)[]; dea: (number | null)[]; bar: (number | null)[] };
  rsi: (number | null)[];
  boll: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
  kdj: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] };
  wr: (number | null)[];
  dmi: { pdi: (number | null)[]; mdi: (number | null)[]; adx: (number | null)[]; adxr: (number | null)[] };
  vr: (number | null)[];
}

interface Holding {
  symbol: string;
  shares: number;
  avgPrice: number;
  marketPrice: number;
  pnl: number;
  pnlPercent: number;
  sector: string;
}

interface Stock {
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

interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  timestamp: number;
  source: string;
  resolved?: boolean;
  symbol?: string;
}

interface Player {
  id: string;
  name: string;
  avatar?: string;
  rank: number;
  totalAssets: number;
  weeklyReturn: number;
  role: 'dealer' | 'retail' | 'regulator';
}

interface InsiderData {
  revenue: string;
  profit: string;
  eps: string;
  pe: string;
  dividend: string;
}

interface UserSettings {
  notifications: boolean;
  soundEffects: boolean;
  darkMode: boolean;
  riskWarnings: boolean;
  autoInvest: boolean;
  defaultLeverage: number;
  language: 'zh' | 'en';
}

export type { UserSettings };

export interface OrderRecord {
  id: string;
  symbol: string;
  type: 'market' | 'limit' | 'stop';
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  status: 'filled' | 'pending' | 'cancelled';
  timestamp: number;
  leverage?: number;
}

interface ReversalCard {
  role: Role;
  revealed: boolean;
}

interface SimulationState {
  timer: ReturnType<typeof setInterval> | null;
  klineTimer: ReturnType<typeof setInterval> | null;
  newsTimer: ReturnType<typeof setTimeout> | null;
  blackSwanTimer: ReturnType<typeof setInterval> | null;
  indicatorTimer: ReturnType<typeof setInterval> | null;
  lastKlineOpen: { price: number; time: number } | null;
  lastIndexTrigger: { manipulation: number; insider: number; misinformation: number; [key: string]: any };
  fakeOrderRestore: ReturnType<typeof setTimeout> | null;
  settlementComputed: boolean;
  initialAssets: number;
  opponentAssets: number;
  finalAssets?: number;
  returnRate?: number;
  // Pacing: which session are we in?
  session: 'morning' | 'lunch' | 'afternoon' | 'closed';
  // Daily close settlement modal
  dailySettlement: {
    day: number;
    open: number;
    close: number;
    pnl: number;
    pnlPercent: number;
    trades: number;
    isFinal: boolean;
  } | null;
  // Daily running P&L for the settlement modal
  dayOpenAssets: number;
  dayOpenPrice: number;
  // Auto-advance timers
  lunchAutoTimer: ReturnType<typeof setTimeout> | null;
  dayAutoTimer: ReturnType<typeof setTimeout> | null;
  // Simulation speed multiplier (1 = 12s/morning, 2 = 6s, 4 = 3s)
  speed: number;
  // Internal counter for backend mode: number of market:tick received (used to
  // throttle aggregateKline / recalculateIndicators). Not user-facing.
  _serverTickCount?: number;
  // Internal: last wall-clock time a timeline point was accepted (used to throttle
  // server 200ms ticks into 2.5s timeline points). Not user-facing.
  _lastTimelineTick?: number;
  // Internal: last wall-clock time holdings GBM was applied (used to throttle
  // server 200ms ticks into tickInterval-cadence holdings updates). Not user-facing.
  _lastHoldingsUpdate?: number;
  /** Set true by startSimulation; guards session-close until the tick engine is armed. */
  _sessionInitialized?: boolean;
  _tickLogCount?: number;
  /** Backend: last portfolio REST sync (ms) — keeps cash aligned with server */
  _lastPortfolioRefresh?: number;
}

interface GameState {
  // User
  role: Role;
  userName: string;

  // Game
  gameStatus: GameStatus;
  /** Distinguishes online flip-overlay flow vs offline direct-to-playing */
  matchFlow: MatchFlow;
  currentDay: number;
  currentTick: number;
  maxDays: number;
  maxTicksPerDay: number;
  // roundTime removed — single clock now derived from (simulation.session, currentTick)
  // in src/utils/clock.ts and consumed by Header + StatusBar.

  // Quote (Current selected stock)
  currentQuote: Quote;
  klines: KLine[];
  timelineData: number[];
  /** 每只股票独立保存的 timeline 价格点序列。key = symbol */
  timelineBySymbol: Record<string, number[]>;
  /** 每只股票独立保存的 K 线。key = symbol */
  klinesBySymbol: Record<string, KLine[]>;
  orderBook: OrderBook;
  indicators: Indicators;
  indicatorSeries: IndicatorSeries;

  // Market Data
  allStocks: Stock[];
  watchlist: string[];
  // Per-symbol live price for multi-symbol mark-to-market
  stockPrices: Record<string, number>;
  indices: { name: string; value: number; change: number }[];

  // Portfolio
  holdings: Holding[];
  portfolioTotal: number;
  totalAssets: number; // mirrors portfolioTotal for clarity across pages
  cash: number;
  // playerCash is a public alias for cash. Components (RegulatorPanel / RetailPanel
  // / TradePanel) read playerCash; setters below keep both fields in sync.
  // ⛳ 所有组件只能通过 useCashBalance() 读 cash，禁止直接 useGameStore((s) => s.playerCash)。
  //   写 cash 必须走 cashSyncPatch() 或 _syncPortfolioFromServer()，
  //   禁止在组件或别处 useState 一个 cash / capital / availableCash。
  playerCash: number;
  todayPnl: number;
  todayPnlPercent: number;
  unrealizedPnl: number;
  leverage: number;
  // Borrowed margin debt. When a buy exceeds settled cash (up to cash*leverage),
  // the uncovered portion becomes borrowed. Net worth = cash + positionValue - borrowed.
  borrowed: number;
  orderHistory: OrderRecord[];
  totalTradeCount: number;
  bestTradePnl: number;

  // News
  news: NewsItem[];
  newsPool: { title: string; content: string; source: string; sentiment: 'bullish' | 'bearish' | 'neutral' }[];

  // Players
  players: Player[];
  leaderboard: Player[];

  // Dealer
  dealerResources: DealerResources | null;
  // dealerInfo is the full DealerInfo shape (resources + hiddenInfo); components
  // that need the rich shape read this. The leaner dealerResources stays for
  // the tick engine and DealerPanel fallback.
  dealerInfo: DealerInfo | null;
  insiderData: InsiderData | null;

  // Insider tip: a REAL purchased tip locks the direction of the next news event
  // (up=bullish, down=bearish) until expiresTick. Trading in that direction while
  // active flags the player for insider trading. Fake tips do NOT set this.
  pendingInsiderTip: { direction: 'up' | 'down'; expiresTick: number } | null;

  // Regulator
  alerts: Alert[];
  regulatoryScores: { manipulation: number; insider: number; misinformation: number };
  scores: RegulatoryScores;
  justiceScore: number;
  stockRestrictions: Record<string, StockRestriction>;
  stockDailyTraded: Record<string, number>;

  // Messages
  messages: Message[];

  // Settings
  settings: UserSettings;

  // Reversal cards
  reversalCards: ReversalCard[];

  // Matching
  matchOpponentName: string;
  waitingRoom: WaitingRoomState | null;
  onlinePlayerCount: 2 | 3;

  // Simulation
  simulation: SimulationState;

  // Toast (for in-game alerts)
  toast: { id: string; message: string; type: 'info' | 'warning' | 'success' | 'danger' } | null;

  // Modal (disconnect / forfeit / room destroyed)
  modal: { type: 'disconnect' | 'forfeit' | 'room_destroyed' | 'solo_confirm' | 'kicked'; message: string; title?: string } | null;
  showModal: (type: 'disconnect' | 'forfeit' | 'room_destroyed' | 'solo_confirm' | 'kicked', message: string, title?: string) => void;
  dismissModal: () => void;

  // ============================================================
  // Backend adapter (REST + WebSocket bridge)
  // ============================================================
  // backendMode: true 时，由 socket.io 推送的行情/成交/庄家结果驱动 store；
  //              false 时，全部走本地 processTick/placeOrder 等模拟器。
  //  - wsStatus 当前连接状态（idle | connecting | connected | disconnected | error）
  //  - authToken / matchId 用来在重连时恢复对局
  //  - connectBackend() 会在 app boot 时被调用一次；
  //    ping 成功就 set(true)，失败保持本地模拟（不 throw）。
  // ============================================================
  backendMode: boolean;
  wsStatus: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  authToken: string | null;
  matchId: string | null;
  userId: string;
  connectBackend: () => Promise<boolean>;
  disconnectBackend: () => void;
  // Internal helpers invoked by wsService event handlers (prefixed with _ to
  // signal "don't call from React components directly").
  _applyServerTick: (payload: {
    // Old shape:
    //   { symbol, quote, orderBook, timeline }
    symbol?: string;
    quote?: any;
    orderBook?: any;
    timeline?: any;
    // New shape:
    //   { quotes: { [symbol]: Quote }, orderBooks: { [symbol]: OrderBook } }
    quotes?: Record<string, any>;
    orderBooks?: Record<string, any>;
  }) => void;
  _syncPortfolioFromServer: (portfolio: {
    cash: number;
    borrowed?: number;
    holdings?: Holding[];
    totalAssets?: number;
    unrealizedPnl?: number;
    todayPnl?: number;
    todayPnlPercent?: number;
    leverage?: number;
  }, dealerResources?: { cash?: number; energy?: number; riskIndex?: number } | null) => void;
  /** 从后端拉取 portfolio，用真值覆盖 store.cash（backend 模式操盘/交易前必调） */
  refreshPortfolioFromServer: () => Promise<boolean>;
  _applyServerSnapshot: (snap: {
    matchId: string;
    role: string;
    symbol: string;
    quote: any;
    klines: any[];
    orderBook: any;
    indicators: any;
    timeline?: any[];
    currentDay?: number;
    currentTick?: number;
    session?: string;
    portfolio?: {
      cash: number;
      borrowed?: number;
      holdings?: Holding[];
      totalAssets?: number;
      unrealizedPnl?: number;
      todayPnl?: number;
      todayPnlPercent?: number;
      leverage?: number;
    } | null;
    dealerResources?: { cash: number; energy: number; riskIndex: number } | null;
  }) => void;
  _applyServerNews: (news: any) => void;
  _applyServerBlackSwan: (payload: { symbol: string; newPrice: number; label: string; multiplier: number }) => void;
  _applyServerMarketUpdate: (payload: { symbol: string; quote: any; klines: any[]; orderBook: any; indicators: any; timeline: any[] }) => void;
  _applyTradeResult: (payload: { side: 'buy' | 'sell'; code: number; data: any; message: string }) => void;
  _applyDealerResult: (payload: { code: number; data: any; message: string }) => void;
  _applyRegulatorFreeze: (payload: { symbol: string; maxSingle: number; maxDaily: number; expiresTick: number; durationTicks?: number; freezeTicks?: number; restrictionType?: 'warn' | 'freeze' }) => void;
  _applyRegulatorKick: (payload: { penalizedUserId: string; opponentId?: string; fine: number; symbol?: string }) => void;
  _applyRegulatorResult: (payload: { code: number; data?: any; message?: string; _alertId?: string }) => void;
  _applyMatchTick: (payload: { currentTick: number }) => void;
  _applyMatchEnd: (payload: { matchId: string; winnerId?: string }) => void;
  _handleMatchTimeout: (payload: { message?: string }) => void;
  _handleRoomUpdate: (payload: { code?: string; currentPlayers: number; requiredPlayers: number; mode?: 'room' | 'quick' }) => void;
  _handleRoomCountdown: (payload: { seconds?: number }) => void;
  _handleMatchStart: (payload: { matchId: string; role: string; opponent?: string }) => Promise<void>;
  _confirmSoloFallback: () => Promise<void>;
  _handleMatchForfeit: (payload: { matchId: string; userId: string; winnerId?: string; message?: string; self?: boolean }) => void;
  _handleMatchDestroyed: (payload: { matchId?: string; code?: string; reason?: string; message?: string }) => void;
  _handleDisconnectWarning: (payload: { message?: string }) => void;
  _attemptReconnectMatch: () => Promise<void>;
  _resetMatchToIdle: () => void;
  _joinBackendMatch: (matchId: string, role: string | null) => Promise<void>;
  _resetCashForMatchEntry: () => void;

  // Actions
  setRole: (role: Role) => void;
  setGameStatus: (status: GameStatus) => void;

  currentSection: string;
  setSection: (section: string) => void;

  updateQuote: (quote: Partial<Quote>) => void;
  setKlines: (klines: KLine[]) => void;
  appendKLine: (kline: KLine) => void;
  setOrderBook: (orderBook: OrderBook) => void;
  setIndicators: (indicators: Indicators) => void;

  selectSymbol: (symbol: string) => void;
  toggleWatchlist: (symbol: string) => void;

  placeOrder: (order: Omit<OrderRecord, 'id' | 'timestamp'>) => Promise<{ success: boolean; error?: string }>;
  setLeverage: (leverage: number) => void;
  setSpeed: (speed: number) => void;
  closePosition: (symbol: string, price: number) => Promise<{ success: boolean; error?: string }>;

  addNews: (news: NewsItem) => void;
  markNewsRead: (id: string) => void;

  addAlert: (alert: Alert) => void;
  resolveAlert: (id: string) => void;
  adjustScores: (delta: Partial<{ manipulation: number; insider: number; misinformation: number }>) => void;
  applyRegulatoryAction: (alertId: string, action: 'warn' | 'freeze' | 'kick' | 'dismiss', symbol?: string) => Promise<boolean>;
  getStockRestriction: (symbol: string) => StockRestriction | null;

  executeDealerAction: (action: { type: string; power: number; cost?: number }) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  triggerBlackSwan: () => void;
  purchaseInsiderInfo: (newsId: string, cost: number) => { success: boolean; tip?: string; trustworthy?: boolean; error?: string };

  setReversalCards: (cards: ReversalCard[]) => void;
  revealReversalCard: (index: number) => void;
  randomizeMyRole: () => void;

  startMatch: () => void;
  startSoloMatch: () => Promise<void>;
  startOnlineQuickMatch: () => Promise<void>;
  startOfflinePractice: (role: Role) => Promise<void>;
  createOnlineRoom: (playerCount?: 2 | 3) => Promise<string | null>;
  joinOnlineRoom: (code: string) => Promise<void>;
  cancelMatch: () => void;
  cancelWaiting: () => Promise<void>;
  endMatch: () => void;
  restartMatch: () => void;
  setDealerInfo: (info: DealerInfo | null) => void;
  /** Reset day/tick/session to Day 1 09:30 morning — call before entering playing. */
  resetGameSession: () => void;
  /** Reset session state and transition to playing (canonical match-start entry). */
  enterPlaying: () => void;

  // Tick engine
  startSimulation: () => void;
  stopSimulation: () => void;
  endLunchBreak: () => void;
  resumeAfternoon: () => void;
  endTradingDay: () => void;
  resumeNextDay: () => void;
  processTick: () => void;
  aggregateKline: () => void;
  pushRandomNews: () => void;
  maybeTriggerBlackSwan: () => void;
  recalculateIndicators: () => void;
  refreshOrderBook: () => void;
  showToast: (message: string, type?: 'info' | 'warning' | 'success' | 'danger') => void;

  updateSettings: (settings: Partial<UserSettings>) => void;

  readMessage: (id: string) => void;
  sendMessage: (to: Role, subject: string, content: string) => void;
}

// =====================
// Initial Data
// =====================

const initialQuote: Quote = {
  symbol: 'QDN',
  name: 'Quantum Dynamics',
  price: 94.89,
  change: 2.34,
  changePercent: 2.53,
  volume: 2480000,
  amount: 188200000,
  high: 98.76,
  low: 92.45,
  open: 92.55,
  prevClose: 92.55,
  timestamp: Date.now(),
};

const initialIndicators: Indicators = {
  ma5: 94.20,
  ma10: 93.85,
  ma20: 93.40,
  macd: { diff: 0.45, dea: 0.32, bar: 0.13 },
  rsi: 62.4,
  boll: { upper: 96.20, middle: 93.80, lower: 91.40 },
  kdj: { k: 50, d: 50, j: 50 },
  wr: -50,
  dmi: { pdi: 25, mdi: 15, adx: 20, adxr: 20 },
  vr: 100,
};

const initialIndicatorSeries: IndicatorSeries = {
  ma5: [],
  ma10: [],
  ma20: [],
  macd: { diff: [], dea: [], bar: [] },
  rsi: [],
  boll: { upper: [], middle: [], lower: [] },
  kdj: { k: [], d: [], j: [] },
  wr: [],
  dmi: { pdi: [], mdi: [], adx: [], adxr: [] },
  vr: [],
};

const allStocks: Stock[] = [
  { symbol: 'QDN', name: 'Quantum Dynamics', sector: 'Technology', price: 94.89, change: 2.34, changePercent: 2.53, volume: 2480000, marketCap: '12.4B', pe: 45.2 },
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', price: 182.33, change: 1.25, changePercent: 0.69, volume: 58200000, marketCap: '2.85T', pe: 28.4 },
  { symbol: 'TSLA', name: 'Tesla Motors', sector: 'Automotive', price: 248.85, change: -3.10, changePercent: -1.23, volume: 42100000, marketCap: '789B', pe: 65.8 },
  { symbol: 'NVDA', name: 'NVIDIA Corp', sector: 'Semiconductors', price: 495.12, change: 8.45, changePercent: 1.74, volume: 38900000, marketCap: '1.22T', pe: 52.3 },
  { symbol: 'MSFT', name: 'Microsoft Corp', sector: 'Technology', price: 412.65, change: 3.45, changePercent: 0.84, volume: 22400000, marketCap: '3.07T', pe: 35.2 },
  { symbol: 'GOOGL', name: 'Alphabet Inc', sector: 'Technology', price: 158.21, change: -0.85, changePercent: -0.53, volume: 24800000, marketCap: '1.97T', pe: 25.6 },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Technology', price: 485.32, change: 5.21, changePercent: 1.08, volume: 18200000, marketCap: '1.24T', pe: 28.9 },
  { symbol: 'AMZN', name: 'Amazon.com', sector: 'Consumer', price: 178.45, change: 1.85, changePercent: 1.05, volume: 28400000, marketCap: '1.86T', pe: 62.1 },
  { symbol: 'BABA', name: 'Alibaba Group', sector: 'Consumer', price: 78.32, change: -1.45, changePercent: -1.82, volume: 14200000, marketCap: '195B', pe: 12.4 },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financial', price: 198.76, change: 0.92, changePercent: 0.46, volume: 8900000, marketCap: '571B', pe: 11.8 },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'Financial', price: 412.34, change: 2.45, changePercent: 0.60, volume: 2400000, marketCap: '142B', pe: 15.2 },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', price: 116.85, change: -0.45, changePercent: -0.38, volume: 14800000, marketCap: '462B', pe: 13.7 },
  { symbol: 'CVX', name: 'Chevron Corp', sector: 'Energy', price: 154.21, change: 0.85, changePercent: 0.55, volume: 7200000, marketCap: '281B', pe: 12.9 },
  { symbol: 'PFE', name: 'Pfizer Inc', sector: 'Healthcare', price: 28.45, change: -0.32, changePercent: -1.11, volume: 28500000, marketCap: '161B', pe: 22.4 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', price: 152.34, change: 0.45, changePercent: 0.30, volume: 6800000, marketCap: '367B', pe: 24.6 },
];

const initialIndices = [
  { name: 'S&P 500', value: 5212.34, change: 0.12 },
  { name: 'NASDAQ', value: 16823.17, change: -0.78 },
  { name: 'DOW', value: 39456.78, change: 0.34 },
  { name: 'RUSSELL', value: 2087.45, change: 0.18 },
  { name: 'VIX', value: 14.32, change: -2.15 },
  { name: 'BTC', value: 67432.50, change: 1.45 },
];

const initialPlayers: Player[] = [
  { id: 'p1', name: 'WhaleKing_88', rank: 1, totalAssets: 245678900, weeklyReturn: 18.4, role: 'dealer' },
  { id: 'p2', name: 'AlphaHunter', rank: 2, totalAssets: 198456700, weeklyReturn: 14.2, role: 'retail' },
  { id: 'p3', name: 'MetaTrader', rank: 3, totalAssets: 176543200, weeklyReturn: 12.8, role: 'dealer' },
  { id: 'p4', name: 'QuantumLeap', rank: 4, totalAssets: 154321000, weeklyReturn: 11.5, role: 'retail' },
  { id: 'p5', name: 'Investor_007', rank: 5, totalAssets: 134567800, weeklyReturn: 10.2, role: 'retail' },
  { id: 'p6', name: 'SEC_Enforcer', rank: 6, totalAssets: 98765400, weeklyReturn: 0, role: 'regulator' },
];

// 所有玩家初始资产一致：1亿现金 + 空仓 = 1亿
// IMPORTANT: starting assets must match simulation.initialAssets (1亿) for the player whose role matches.
// Otherwise the settlement ranking shows a phantom "loss" at game start.
const STARTING_ASSETS = 100000000;

/** 唯一 cash 写入点 — 同步 cash / playerCash / dealerResources / dealerInfo */
function cashSyncPatch(
  state: Pick<GameState, 'dealerResources' | 'dealerInfo'>,
  cash: number,
  opts?: { riskIndex?: number },
): Pick<GameState, 'cash' | 'playerCash' | 'dealerResources' | 'dealerInfo'> {
  const riskIndex = opts?.riskIndex ?? state.dealerResources?.riskIndex ?? 0;
  const dealerResources: DealerResources | null = state.dealerResources
    ? { cash, energy: 0, riskIndex }
    : null;
  const dealerInfo: DealerInfo | null = state.dealerInfo
    ? {
        ...state.dealerInfo,
        resources: {
          ...state.dealerInfo.resources,
          cash,
          energy: 0,
          riskIndex,
        },
      }
    : null;
  return { cash, playerCash: cash, dealerResources, dealerInfo };
}

const TIMELINE_MAX_POINTS = 500;
/** 本地 / 离线 GBM 波动率（与后端 GBM_SIGMA 同量级） */
const LOCAL_GBM_SIGMA = 0.06;

/** 行情推送：更新序列最后一个点，使图表末端与 headline 价格同步 */
function patchTimelineLastPoint(timeline: number[], price: number): number[] {
  if (!Number.isFinite(price) || price <= 0) return timeline;
  if (timeline.length === 0) return [price];
  return [...timeline.slice(0, -1), price];
}

/** 游戏 tick（约 3s）：为分时图追加一个新点 */
function appendTimelineGameTick(
  timelineBySymbol: Record<string, number[]>,
  stockPrices: Record<string, number>,
  symbols: string[],
): Record<string, number[]> {
  const next = { ...timelineBySymbol };
  for (const sym of symbols) {
    const px = stockPrices[sym];
    if (!Number.isFinite(px) || px <= 0) continue;
    const cur = next[sym] ?? [];
    next[sym] = [...cur, px].slice(-TIMELINE_MAX_POINTS);
  }
  return next;
}
const initialPlayersInGame: Player[] = [
  { id: 'p1', name: 'Market Maker', rank: 0, totalAssets: STARTING_ASSETS, weeklyReturn: 0, role: 'dealer' },
  { id: 'p2', name: 'Retail Investor', rank: 0, totalAssets: STARTING_ASSETS, weeklyReturn: 0, role: 'retail' },
  { id: 'p3', name: 'SEC Agent', rank: 0, totalAssets: STARTING_ASSETS, weeklyReturn: 0, role: 'regulator' },
];

const initialNews: NewsItem[] = [
  { id: 'n1', type: 'unverified', title: '[RUMOR] Unexpected regulatory probe announced', source: 'Insider Whisper', tick: 104, time: '2m ago', timestamp: Date.now() - 120000, tags: ['RUMOR', 'REGULATORY'] },
  { id: 'n2', type: 'unverified', title: '[RUMOR] Supply chain issues cause production delays', source: 'Anonymous Source', tick: 102, time: '5m ago', timestamp: Date.now() - 300000, tags: ['RUMOR', 'SUPPLY'] },
  { id: 'n3', type: 'verified', title: 'QDN announces quarterly earnings beat estimates', source: 'Bloomberg', tick: 87, time: '15m ago', timestamp: Date.now() - 900000, content: 'Quantum Dynamics Inc reported Q4 earnings of $2.45 per share, beating consensus estimates of $2.18 by 12%. Revenue came in at $2.4B, up 18% YoY.', tags: ['EARNINGS', 'QDN'] },
  { id: 'n4', type: 'verified', title: 'Fed signals potential rate cut in upcoming meeting', source: 'Reuters', tick: 84, time: '1h ago', timestamp: Date.now() - 3600000, content: 'Federal Reserve officials indicated growing support for a rate cut at the next FOMC meeting, citing softening labor market data.', tags: ['FED', 'RATES'] },
  { id: 'n5', type: 'warning', title: 'Market volatility expected ahead of CPI release', source: 'CNBC', tick: 78, time: '2h ago', timestamp: Date.now() - 7200000, tags: ['MARKET', 'VOLATILITY'] },
  { id: 'n6', type: 'verified', title: 'Tech sector rallies on AI breakthrough news', source: 'WSJ', tick: 72, time: '3h ago', timestamp: Date.now() - 10800000, content: 'Major technology companies see significant gains following new AI model announcements from leading research labs.', tags: ['TECH', 'AI'] },
];

const initialAlerts: Alert[] = [
  { id: 'a1', severity: 'high', title: '连续拉升异常', description: '庄家在短时间内连续买入造成股价异常波动', timestamp: Date.now() - 120000, source: 'Automated Detection' },
  { id: 'a2', severity: 'medium', title: '大额挂单检测', description: '检测到盘口出现异常大额委托挂单', timestamp: Date.now() - 240000, source: 'Order Flow Analyzer' },
  { id: 'a3', severity: 'low', title: '可疑对敲交易', description: '相同价格短时间内多次成交，可能存在对敲', timestamp: Date.now() - 360000, source: 'Wash Trade Detector' },
  { id: 'a4', severity: 'medium', title: '内幕交易嫌疑', description: '检测到重大消息发布前交易量异常激增', timestamp: Date.now() - 480000, source: 'Insider Trading Monitor' },
];

const initialMessages: Message[] = [
  {
    id: 'm1',
    from: 'System',
    fromRole: 'regulator',
    subject: '欢迎来到 Blackwall Street Empire',
    preview: '您的账户已激活。准备好开始您的交易之旅。',
    content: '欢迎来到 Blackwall Street Empire！\n\n您的账户已成功激活。\n\n您现在可以：\n- 查看实时市场数据\n- 与其他玩家进行 1v1 对战\n- 使用专业级技术分析工具\n\n祝您交易顺利！',
    timestamp: Date.now() - 3600000,
    read: false,
    type: 'system'
  },
  {
    id: 'm2',
    from: 'WhaleKing_88',
    fromRole: 'dealer',
    subject: '挑战邀请',
    preview: 'Hey，让我们来一场交易对决？',
    content: 'Hey，看到你的战绩很亮眼，让我们来一场 1v1 交易对决如何？我选择庄家身份，让我看看你的散户策略！',
    timestamp: Date.now() - 1800000,
    read: false,
    type: 'player'
  },
  {
    id: 'm3',
    from: 'AlphaHunter',
    fromRole: 'retail',
    subject: '复盘交流',
    preview: '刚才的对局很有趣，能聊聊策略吗？',
    content: '刚才的对局很有趣，你的策略很有意思。能分享一下你是怎么判断进出场时机的吗？',
    timestamp: Date.now() - 7200000,
    read: true,
    type: 'player'
  },
  {
    id: 'm4',
    from: 'SEC_Enforcer',
    fromRole: 'regulator',
    subject: '合规提醒',
    preview: '请注意交易行为规范',
    content: '您的近期交易记录已被系统审查。请确保您的交易行为符合市场规范，避免异常交易模式。',
    timestamp: Date.now() - 86400000,
    read: true,
    type: 'regulator'
  },
];

const initialSettings: UserSettings = {
  notifications: true,
  soundEffects: true,
  darkMode: true,
  riskWarnings: true,
  autoInvest: false,
  defaultLeverage: 2,
  language: 'zh',
};

// ============================================================
// Per-symbol timeline/K线 helpers — inlined in selectSymbol / server handlers.
// ============================================================

export const useGameStore = create<GameState>((set, get) => ({
  // User
  role: 'retail',
  userName: 'Investor_007',

  // Game
  gameStatus: 'idle',
  matchFlow: null,
  currentDay: 1,
  currentTick: 0,
  maxDays: 5,
  maxTicksPerDay: 120, // 60 上午 + 60 下午（午休不计入 tick）
  // (roundTime removed; clock now lives in src/utils/clock.ts)
  
  currentQuote: initialQuote,
  klines: [],
  timelineData: [],
  timelineBySymbol: {},
  klinesBySymbol: {},
  orderBook: {
    bids: [
      { price: 94.85, quantity: 1500, orders: 12 },
      { price: 94.80, quantity: 2200, orders: 18 },
      { price: 94.75, quantity: 1800, orders: 15 },
      { price: 94.70, quantity: 3500, orders: 22 },
      { price: 94.65, quantity: 2800, orders: 19 },
    ],
    asks: [
      { price: 94.90, quantity: 1800, orders: 14 },
      { price: 94.95, quantity: 2400, orders: 16 },
      { price: 95.00, quantity: 1600, orders: 11 },
      { price: 95.05, quantity: 2900, orders: 21 },
      { price: 95.10, quantity: 2200, orders: 17 },
    ],
  },
  indicators: initialIndicators,
  indicatorSeries: initialIndicatorSeries,

  allStocks,
  watchlist: ['QDN', 'AAPL', 'TSLA', 'NVDA'],
  indices: initialIndices,
  // Per-symbol live price, seeded from allStocks so multi-symbol
  // mark-to-market has a baseline for every holding.
  stockPrices: allStocks.reduce<Record<string, number>>((acc, s) => {
    acc[s.symbol] = s.price;
    return acc;
  }, {}),

  holdings: [],
  portfolioTotal: STARTING_ASSETS,
  totalAssets: STARTING_ASSETS,
  cash: STARTING_ASSETS,
  playerCash: STARTING_ASSETS,
  todayPnl: 0,
  todayPnlPercent: 0,
  unrealizedPnl: 0,
  leverage: 2,
  borrowed: 0,
  orderHistory: [
    { id: 'o1', symbol: 'QDN', type: 'market', side: 'buy', price: 90.12, quantity: 500, status: 'filled', timestamp: Date.now() - 86400000 },
    { id: 'o2', symbol: 'AAPL', type: 'limit', side: 'buy', price: 175.45, quantity: 200, status: 'filled', timestamp: Date.now() - 172800000 },
    { id: 'o3', symbol: 'TSLA', type: 'market', side: 'buy', price: 245.10, quantity: 100, status: 'filled', timestamp: Date.now() - 259200000 },
  ],
  totalTradeCount: 0,
  bestTradePnl: 0,

  news: initialNews,
  newsPool: [
    { title: '央行意外加息 25 个基点', content: '央行宣布将基准利率上调 25 个基点，市场流动性收紧', source: 'Reuters', sentiment: 'bearish' },
    { title: '科技股领涨大盘', content: '受 AI 利好消息推动，科技板块整体上涨 3.2%', source: 'Bloomberg', sentiment: 'bullish' },
    { title: '央行降准 0.5 个百分点', content: '中国人民银行下调存款准备金率释放流动性', source: '新华社', sentiment: 'bullish' },
    { title: '地缘政治紧张局势升级', content: '中东局势可能影响原油供应链', source: 'CNBC', sentiment: 'bearish' },
    { title: '芯片巨头财报超预期', content: 'QDN 季度营收同比增长 38%，超华尔街预期', source: 'Bloomberg', sentiment: 'bullish' },
    { title: '新能源汽车销量下滑', content: 'TSLA 4 月销量环比下降 12%，市场担忧产能过剩', source: 'Reuters', sentiment: 'bearish' },
    { title: '美联储维持利率不变', content: '鲍威尔表示将观察通胀数据再决定下一步行动', source: 'Federal Reserve', sentiment: 'neutral' },
    { title: '互联网监管新规出台', content: '网信办发布新规，要求平台企业加强合规管理', source: '网信办', sentiment: 'bearish' },
    { title: '医疗创新药获批上市', content: 'JNJ 新一代抗癌药物获 FDA 批准', source: 'FDA', sentiment: 'bullish' },
    { title: '油价创年内新高', content: 'OPEC+ 减产协议延长，布伦特原油突破 90 美元', source: 'Bloomberg', sentiment: 'bullish' },
    { title: '欧盟启动反垄断调查', content: '针对大型科技公司展开新一轮反垄断调查', source: 'FT', sentiment: 'bearish' },
    { title: '宏观数据稳健', content: 'Q1 GDP 同比增长 5.2%，经济复苏势头良好', source: '国家统计局', sentiment: 'bullish' },
    { title: '国际油价大幅下跌', content: '需求担忧导致原油价格单日跌超 5%', source: 'Reuters', sentiment: 'bearish' },
    { title: '巴菲特增持金融股', content: '伯克希尔哈撒韦 13F 显示加仓银行板块', source: 'SEC', sentiment: 'bullish' },
    { title: '半导体出口管制升级', content: '美方宣布新一轮芯片出口限制措施', source: 'Reuters', sentiment: 'bearish' },
    { title: '公司治理结构优化', content: '多家上市公司宣布回购计划，金额超 500 亿', source: '上交所', sentiment: 'bullish' },
  ],
  players: initialPlayersInGame,
  leaderboard: initialPlayers,
  dealerResources: { cash: STARTING_ASSETS, energy: 0, riskIndex: 0 },
  dealerInfo: null,
  insiderData: {
    revenue: '¥2.4B',
    profit: '¥340M',
    eps: '¥2.45',
    pe: '45.2x',
    dividend: '2.4%',
  },
  pendingInsiderTip: null,
  alerts: initialAlerts,
  regulatoryScores: { manipulation: 32.5, insider: 18.2, misinformation: 12.8 },
  scores: { manipulation: 32.5, insider: 18.2, misinformation: 12.8 },
  justiceScore: 0,
  stockRestrictions: {},
  stockDailyTraded: {},
  messages: initialMessages,
  settings: initialSettings,

  reversalCards: [
    { role: 'dealer', revealed: false },
    { role: 'retail', revealed: false },
    { role: 'regulator', revealed: false },
  ],

  matchOpponentName: 'WhaleKing_88',
  waitingRoom: null,
  onlinePlayerCount: 2,

simulation: {
    timer: null,
    klineTimer: null,
    newsTimer: null,
    blackSwanTimer: null,
    indicatorTimer: null,
    lastKlineOpen: null,
    lastIndexTrigger: { manipulation: 0, insider: 0, misinformation: 0 },
    fakeOrderRestore: null,
    settlementComputed: false,
    initialAssets: STARTING_ASSETS,
    opponentAssets: STARTING_ASSETS,
    session: 'morning',
    dailySettlement: null,
    // Day-open anchor: cash + position value at the moment the day started.
    // Initialized to STARTING_ASSETS (no holdings, no prior trading).
    dayOpenAssets: STARTING_ASSETS,
    dayOpenPrice: 94.85,
    lunchAutoTimer: null,
    dayAutoTimer: null,
    speed: 1,
    _serverTickCount: 0,
    _lastTimelineTick: 0,
    _lastHoldingsUpdate: 0,
    _sessionInitialized: false,
  },

  toast: null,
  modal: null,

  // Backend adapter (default = local simulation)
  backendMode: false,
  wsStatus: 'idle',
  authToken: null,
  matchId: null,
  userId: `guest_${Math.random().toString(36).slice(2, 10)}`,

  // Section for navigation
  currentSection: 'overview' as string,
  
  setSection: (section) => set({ currentSection: section }),

  // Actions
  setRole: (role) => set({ role }),

  setGameStatus: (gameStatus) => set({ gameStatus }),

  setDealerInfo: (info) => set((s) => {
    if (!info) return { dealerInfo: null, dealerResources: null };
    const patched = cashSyncPatch(s, s.cash, { riskIndex: info.resources.riskIndex });
    return {
      ...patched,
      dealerInfo: {
        ...info,
        resources: { ...info.resources, cash: s.cash, energy: 0 },
      },
    };
  }),
  
  updateQuote: (quote) => set((s) => ({ currentQuote: { ...s.currentQuote, ...quote } })),
  
  setKlines: (klines) => set({ klines }),
  appendKLine: (kline) => set((s) => ({ klines: [...s.klines.slice(-99), kline] })),
  setOrderBook: (orderBook) => set({ orderBook }),
  setIndicators: (indicators) => set({ indicators }),
  
  selectSymbol: (symbol) => {
    const state = get();
    const stock = state.allStocks.find(s => s.symbol === symbol);
    if (!stock) return;
    const price = state.stockPrices[symbol] ?? stock.price;
    const prevClose = stock.price - stock.change;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : stock.changePercent;
    // 关键修复：切换股票时把对应 symbol 的 timeline/klines 同步到顶层字段
    // 这样 MarketChart 读取 timelineData 时看到的是目标股票的数据，而不是上一只的。
    const tl = state.timelineBySymbol[symbol] ?? [];
    const kl = state.klinesBySymbol[symbol] ?? [];
    set({
      currentQuote: {
        ...state.currentQuote,
        symbol: stock.symbol,
        name: stock.name,
        price,
        change,
        changePercent,
        volume: stock.volume,
        open: price,
        high: price,
        low: price,
        prevClose,
        timestamp: Date.now(),
      },
      timelineData: tl,
      klines: kl,
    });
    get().refreshOrderBook();
  },
  
  toggleWatchlist: (symbol) => set((s) => ({
    watchlist: s.watchlist.includes(symbol)
      ? s.watchlist.filter(s => s !== symbol)
      : [...s.watchlist, symbol]
  })),
  
  placeOrder: async (order) => {
    const state = get();
    const amount = order.price * order.quantity;
    const restriction = get().getStockRestriction(order.symbol);
    if (restriction) {
      if (amount > restriction.maxSingle) {
        get().showToast('该股票已被监管限制', 'warning');
        return { success: false, error: '该股票已被监管限制' };
      }
      const dailyUsed = state.stockDailyTraded[order.symbol] ?? 0;
      if (dailyUsed + amount > restriction.maxDaily) {
        get().showToast('该股票已被监管限制', 'warning');
        return { success: false, error: '该股票已被监管限制' };
      }
    }
    // Backend mode: 唯一资金池 user_match_state.cash — 卖入回款与操盘扣款同一字段
    if (usesBackendGameState(state)) {
      if (!state.matchId) {
        get().showToast('尚未加入对局', 'warning');
        return { success: false, error: '未入对局' };
      }
      const payload = {
        matchId: state.matchId,
        symbol: order.symbol,
        price: order.price,
        quantity: order.quantity,
        leverage: order.leverage ?? state.leverage,
      };
      try {
        const synced = await get().refreshPortfolioFromServer();
        if (!synced) {
          get().showToast('无法同步服务器资金，下单已取消', 'danger');
          return { success: false, error: '资金未同步' };
        }
        const ws = await import('../services/wsService');
        await ws.waitForAuth(8000);
        const resultPromise = waitForTradeResult(15000);
        if (order.side === 'buy') ws.sendBuy(payload);
        else ws.sendSell({ ...payload });
        const result = await resultPromise;
        if (result?.code !== 0) {
          if (result?.data?.portfolio) {
            get()._syncPortfolioFromServer(result.data.portfolio);
          } else {
            await get().refreshPortfolioFromServer();
          }
          return { success: false, error: result?.message ?? '交易失败' };
        }
        return { success: true };
      } catch (err) {
        console.error('[Trade] WS not ready', err);
        get().showToast(`下单失败: ${(err as Error).message}`, 'danger');
        return { success: false, error: (err as Error).message };
      }
    }

    // Pre-flight validation (local mode)
    const orderLeverage = order.leverage ?? state.leverage;
    if (order.side === 'buy') {
      const buyingPower = state.cash * orderLeverage;
      if (amount > buyingPower) {
        get().showToast(`资金不足: 需要 ¥${amount.toLocaleString()}，可用杠杆购买力 ¥${buyingPower.toLocaleString()}`, 'warning');
        return { success: false, error: '资金不足' };
      }
    } else {
      const h = state.holdings.find(x => x.symbol === order.symbol);
      if (!h || h.shares < order.quantity) {
        get().showToast(`持仓不足: ${order.symbol} 持有 ${h?.shares ?? 0} 股`, 'warning');
        return { success: false, error: '持仓不足' };
      }
    }

    const id = `order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let tradePnl = 0;

    set((s) => {
      const orderHistory = [{ ...order, id, timestamp: Date.now() }, ...s.orderHistory.slice(0, 49)];
      // Borrowed-margin accounting: cash stays >= 0. A buy first spends settled
      // cash, then borrows the remainder. A sell's proceeds first repay borrowed
      // debt, then top up cash.
      let cash = s.cash;
      let borrowed = s.borrowed;
      if (order.side === 'buy') {
        const fromCash = Math.min(s.cash, amount);
        const borrow = amount - fromCash;
        cash = s.cash - fromCash;
        borrowed = s.borrowed + borrow;
      } else {
        const repay = Math.min(s.borrowed, amount);
        borrowed = s.borrowed - repay;
        cash = s.cash + (amount - repay);
      }
      // Update holdings
      let holdings = s.holdings;
      const idx = holdings.findIndex(h => h.symbol === order.symbol);
      if (order.side === 'buy') {
        if (idx >= 0) {
          const h = holdings[idx];
          const totalShares = h.shares + order.quantity;
          const totalCost = h.avgPrice * h.shares + order.price * order.quantity;
          const avgPrice = totalCost / totalShares;
          holdings = holdings.map((hh, i) => i === idx ? {
            ...hh,
            shares: totalShares,
            avgPrice,
            marketPrice: order.price,
            pnl: (order.price - avgPrice) * totalShares,
            pnlPercent: ((order.price - avgPrice) / avgPrice) * 100,
          } : hh);
        } else {
          holdings = [...holdings, {
            symbol: order.symbol,
            shares: order.quantity,
            avgPrice: order.price,
            marketPrice: order.price,
            pnl: 0,
            pnlPercent: 0,
            sector: s.allStocks.find(st => st.symbol === order.symbol)?.sector || 'Other',
          }];
        }
      } else {
        if (idx >= 0) {
          const h = holdings[idx];
          const remaining = h.shares - order.quantity;
          tradePnl = (order.price - h.avgPrice) * order.quantity;
          if (remaining <= 0) {
            holdings = holdings.filter((_, i) => i !== idx);
          } else {
            holdings = holdings.map((hh, i) => i === idx ? {
              ...hh,
              shares: remaining,
              marketPrice: order.price,
              pnl: (order.price - hh.avgPrice) * remaining,
              pnlPercent: ((order.price - hh.avgPrice) / hh.avgPrice) * 100,
            } : hh);
          }
        }
      }
      const unrealizedPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);
      const positionValue = holdings.reduce((sum, h) => sum + h.marketPrice * h.shares, 0);
      const portfolioTotal = cash + positionValue - borrowed;
      const todayPnl = portfolioTotal - s.simulation.initialAssets;
      const todayPnlPercent = (todayPnl / s.simulation.initialAssets) * 100;
      const dailyKey = order.symbol;
      const prevDaily = s.stockDailyTraded[dailyKey] ?? 0;
      return {
        orderHistory,
        ...cashSyncPatch(s, cash),
        borrowed,
        holdings,
        unrealizedPnl,
        portfolioTotal,
        totalAssets: portfolioTotal,
        todayPnl,
        todayPnlPercent,
        totalTradeCount: s.totalTradeCount + 1,
        bestTradePnl: tradePnl > s.bestTradePnl ? tradePnl : s.bestTradePnl,
        currentTick: s.currentTick + 1,
        stockDailyTraded: { ...s.stockDailyTraded, [dailyKey]: prevDaily + amount },
      };
    });

    // Timed insider-trade detection: trading in the direction of an active REAL
    // insider tip (before it expires) flags the player for insider trading.
    const tip = state.pendingInsiderTip;
    if (
      tip &&
      state.currentTick <= tip.expiresTick &&
      ((tip.direction === 'up' && order.side === 'buy') ||
        (tip.direction === 'down' && order.side === 'sell'))
    ) {
      get().adjustScores({ insider: 8 });
      get().addAlert({
        id: `insider_trade_${Date.now()}`,
        severity: 'high',
        title: '内幕交易嫌疑',
        description: `在内幕消息生效期间${order.side === 'buy' ? '买入' : '卖出'} ${order.symbol}，涉嫌利用内部信息交易`,
        timestamp: Date.now(),
        source: 'Insider Trading Monitor',
      });
    }

    get().showToast(
      `${order.side === 'buy' ? '买入' : '卖出'} ${order.symbol} ${order.quantity}股 @ ¥${order.price.toFixed(2)}`,
      'success'
    );
    return { success: true };
  },
  
  closePosition: async (symbol, price) => {
    const state = get();
    const h = state.holdings.find((x) => x.symbol === symbol);
    if (!h || h.shares <= 0) {
      return { success: false, error: '无持仓' };
    }

    // 在线对局：必须走后端卖出；离线练习始终本地单池
    if (usesBackendGameState(state)) {
      return get().placeOrder({
        side: 'sell',
        type: 'market',
        symbol,
        price,
        quantity: h.shares,
        status: 'filled',
      });
    }

    set((s) => {
      const proceeds = h.shares * price;
      // Proceeds repay borrowed debt first, then add to settled cash.
      const repay = Math.min(s.borrowed, proceeds);
      const borrowed = s.borrowed - repay;
      const cash = s.cash + (proceeds - repay);
      const newOrder: OrderRecord = {
        id: `close_${Date.now()}`,
        symbol,
        type: 'market',
        side: 'sell',
        price,
        quantity: h.shares,
        status: 'filled',
        timestamp: Date.now(),
      };
      const holdings = s.holdings.filter(x => x.symbol !== symbol);
      const positionValue = holdings.reduce((sum, hh) => sum + hh.marketPrice * hh.shares, 0);
      const portfolioTotal = cash + positionValue - borrowed;
      return {
        ...cashSyncPatch(s, cash),
        borrowed,
        holdings,
        portfolioTotal,
        totalAssets: portfolioTotal,
        orderHistory: [newOrder, ...s.orderHistory].slice(0, 50),
      };
    });
    return { success: true };
  },

  setLeverage: (leverage) => set({ leverage }),

  setSpeed: (speed) => {
    // 下限放宽到 0.5，以支持"慢速 7 分钟/天"(speed≈0.857) 这类分数档位。
    const clamped = Math.max(0.5, Math.min(8, speed));
    const state = get();
    set({ simulation: { ...state.simulation, speed: clamped } });
    // Re-arm timers if currently playing so the new interval takes effect
    if (state.gameStatus === 'playing') {
      get().stopSimulation();
      get().startSimulation();
    }
  },

  restartMatch: () => {
    // Stop timers, reset core state, return to idle (MatchOverlay will appear)
    get().stopSimulation();
    const seedStock = get().allStocks[0];
    set({
      gameStatus: 'idle',
      currentDay: 1,
      currentTick: 0,
      currentQuote: {
        symbol: seedStock.symbol,
        name: seedStock.name,
        price: seedStock.price,
        prevClose: seedStock.price,
        open: seedStock.price,
        high: seedStock.price,
        low: seedStock.price,
        change: 0,
        changePercent: 0,
        volume: 0,
        amount: 0,
        timestamp: Date.now(),
      },
      klines: [],
      timelineData: [],
      timelineBySymbol: {},
      klinesBySymbol: {},
      holdings: [],
      orderHistory: [],
      cash: STARTING_ASSETS,
      playerCash: STARTING_ASSETS,
      portfolioTotal: STARTING_ASSETS,
      totalAssets: STARTING_ASSETS,
      borrowed: 0,
      todayPnl: 0,
      todayPnlPercent: 0,
      unrealizedPnl: 0,
      totalTradeCount: 0,
      bestTradePnl: 0,
      // Reset dealer resources so risk / capital don't persist across matches.
      // （已移除 energy 字段 — 庄家操作只用 cash）
      dealerResources: { cash: STARTING_ASSETS, energy: 0, riskIndex: 0 },
      pendingInsiderTip: null,
      simulation: {
        ...get().simulation,
        session: 'morning',
        dayOpenAssets: 100000000,
        dayOpenPrice: get().currentQuote.price,
        dailySettlement: null,
        lunchAutoTimer: null,
        dayAutoTimer: null,
        initialAssets: 100000000,
        opponentAssets: 100000000,
        finalAssets: undefined,
        returnRate: undefined,
        settlementComputed: false,
        _serverTickCount: 0,
        _lastTimelineTick: 0,
        _lastHoldingsUpdate: 0,
        _sessionInitialized: false,
      },
      regulatoryScores: { manipulation: 0, insider: 0, misinformation: 0 },
      scores: { manipulation: 0, insider: 0, misinformation: 0 },
      justiceScore: 0,
      stockRestrictions: {},
      stockDailyTraded: {},
      dealerInfo: null,
      indicators: initialIndicators,
      indicatorSeries: initialIndicatorSeries,
      alerts: [],
      toast: null,
    });
  },
  
  addNews: (news) => set((s) => ({
    news: [news, ...s.news].slice(0, 30)
  })),
  
  markNewsRead: (id) => set((s) => ({
    news: s.news.map(n => n.id === id ? { ...n, type: 'verified' } : n)
  })),
  
  addAlert: (alert) => set((s) => ({
    alerts: [alert, ...s.alerts].slice(0, 50)
  })),

  resolveAlert: (id) => {
    const state = get();
    const alert = state.alerts.find(a => a.id === id);
    if (!alert) return;
    // Determine which score to lower based on alert source/title
    const source = alert.source.toLowerCase();
    const title = alert.title.toLowerCase();
    const delta: { manipulation?: number; insider?: number; misinformation?: number } = {};
    if (source.includes('manipulation') || title.includes('操纵') || title.includes('对敲') || title.includes('拉升') || title.includes('压价') || title.includes('黑天鹅') || title.includes('black swan')) {
      delta.manipulation = -5 - Math.random() * 5;
    } else if (source.includes('insider') || title.includes('内幕')) {
      delta.insider = -5 - Math.random() * 5;
    } else if (source.includes('misinformation') || title.includes('虚假') || title.includes('谣言')) {
      delta.misinformation = -5 - Math.random() * 5;
    } else {
      // default: reduce all
      delta.manipulation = -2;
      delta.insider = -2;
      delta.misinformation = -2;
    }
    get().adjustScores(delta);
    set((s) => ({
      alerts: s.alerts.map(a => a.id === id ? { ...a, resolved: true } : a).filter(a => !a.resolved),
    }));
  },
  
  adjustScores: (delta) => set((s) => {
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const next = {
      manipulation: clamp(s.regulatoryScores.manipulation + (delta.manipulation ?? 0)),
      insider: clamp(s.regulatoryScores.insider + (delta.insider ?? 0)),
      misinformation: clamp(s.regulatoryScores.misinformation + (delta.misinformation ?? 0)),
    };
    return {
      regulatoryScores: next,
      scores: next,
    };
  }),
  
  getStockRestriction: (symbol) => {
    const state = get();
    const r = state.stockRestrictions[symbol];
    if (!r) return null;
    if (r.expiresTick <= state.currentTick) return null;
    return r;
  },

  applyRegulatoryAction: async (alertId, action, symbolArg) => {
    const state = get();
    const alert = state.alerts.find((a) => a.id === alertId);
    const symbol = symbolArg ?? alert?.symbol ?? state.currentQuote.symbol;

    const estimateLocalLimits = (type: 'warn' | 'freeze') => {
      const klines = state.klinesBySymbol[symbol] ?? [];
      const avgVol = klines.length > 0
        ? klines.slice(-30).reduce((s, k) => s + k.volume, 0) / Math.min(30, klines.length)
        : state.currentQuote.volume;
      const avgTickTurnover = state.currentQuote.price * Math.max(1, avgVol);
      const avgDailyTurnover = avgTickTurnover * 240;
      const singleRatio = type === 'warn' ? WARN_SINGLE_RATIO : FREEZE_SINGLE_RATIO;
      const dailyRatio = type === 'warn' ? WARN_DAILY_RATIO : FREEZE_DAILY_RATIO;
      return {
        maxSingle: Math.max(10_000, Math.floor(avgTickTurnover * singleRatio)),
        maxDaily: Math.max(50_000, Math.floor(avgDailyTurnover * dailyRatio)),
        durationTicks: type === 'warn' ? WARN_TICKS : FREEZE_TICKS,
        restrictionType: type,
      };
    };

    const runLocal = () => {
      if (action === 'freeze' || action === 'warn') {
        const limits = estimateLocalLimits(action);
        const reason = action === 'freeze' ? '监管冻结' : '监管警告';
        set((s) => ({
          stockRestrictions: {
            ...s.stockRestrictions,
            [symbol]: {
              symbol,
              maxSingle: limits.maxSingle,
              maxDaily: limits.maxDaily,
              expiresTick: state.currentTick + limits.durationTicks,
              reason,
              restrictionType: limits.restrictionType,
            },
          },
          alerts: s.alerts.filter((a) => a.id !== alertId),
        }));
        const label = action === 'freeze' ? '冻结' : '警告';
        get().showToast(
          `${symbol} ${label}：单笔上限 ${formatWan(limits.maxSingle)}，持续 ${limits.durationTicks} tick`,
          action === 'freeze' ? 'warning' : 'success',
        );
        if (state.role === 'retail') {
          get().showToast(`监管对 ${symbol} 实施了交易限制`, 'info');
        }
      } else if (action === 'kick') {
        const holding = state.holdings.find((h) => h.symbol === symbol);
        const positionValue = holding ? holding.marketPrice * holding.shares : 0;
        const fine = positionValue > 0
          ? Math.floor(positionValue * 0.3)
          : Math.floor(state.totalAssets * 0.1);
        set((s) => ({
          ...cashSyncPatch(s, Math.max(0, s.cash - fine)),
          alerts: s.alerts.filter((a) => a.id !== alertId),
          gameStatus: 'settlement',
        }));
        get().showModal('kicked', `你被监管踢出，罚款 ${formatWan(fine)}`, '监管处罚');
      } else {
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== alertId) }));
        get().showToast('已忽略告警', 'info');
      }
      if (action === 'freeze' || action === 'warn') {
        get().adjustScores({ manipulation: -2, insider: -2, misinformation: -2 });
      }
      if (action === 'freeze' || action === 'kick') {
        const manip = get().regulatoryScores.manipulation;
        const delta = manip > 50 ? 10 : manip < 30 ? -5 : 0;
        if (delta !== 0) set((s) => ({ justiceScore: s.justiceScore + delta }));
      }
      return true;
    };

    if (state.backendMode && state.matchId) {
      try {
        const ws = await import('../services/wsService');
        await ws.waitForAuth(8000);
        const resultPromise = ws.onceWithTimeout<{ code: number; data?: any; message?: string }>('regulator:result', 8000);
        ws.sendRegulatorAction({ matchId: state.matchId, alertId, action, symbol });
        const payload = await resultPromise;
        get()._applyRegulatorResult({ ...payload, _alertId: alertId });
        return payload.code === 0;
      } catch (err) {
        console.error('[Regulator] WS failed', err);
        get().showToast('监管操作失败，请检查网络连接', 'warning');
        return false;
      }
    }

    return runLocal();
  },
  
  /**
   * 庄家操盘 action。
   * 已移除 energy 机制 — cost 来自后端 preview-cost 接口（与 action 一致公式），
   * 前端只做"显示 + 涨跌停 + 资金"预检，真正执行交给后端。
   */
  executeDealerAction: async ({ type, power, cost: advisoryCost }: { type: string; power: number; cost?: number }) => {
    const state = get();
    const symbol = state.currentQuote.symbol;

    const restriction = get().getStockRestriction(symbol);
    if (restriction) {
      const remaining = restriction.expiresTick - state.currentTick;
      get().showToast(`${symbol} 操盘工具已被监管锁定，还剩 ${remaining} tick`, 'warning');
      return { success: false, error: '监管锁定' };
    }

    const curPrice = state.currentQuote.price;
    const prevClose = state.currentQuote.prevClose || curPrice;
    const upper = prevClose * 1.10;
    const lower = prevClose * 0.90;

    // ---- 涨跌停预检（前端立刻反馈，不必等后端 ack） ----
    if (type === 'pump' && curPrice >= upper - 0.0001) {
      get().showToast(`已达涨停 ¥${upper.toFixed(2)}，无法再拉升`, 'warning');
      return { success: false, error: '涨停' };
    }
    if (type === 'press' && curPrice <= lower + 0.0001) {
      get().showToast(`已达跌停 ¥${lower.toFixed(2)}，无法再压价`, 'warning');
      return { success: false, error: '跌停' };
    }

    // ---- 取 cost / effect（后端优先，本地用共享公式） ----
    let realCost = advisoryCost ?? 0;
    let effectPct = 0;
    let riskIncrease = 0;
    const localPreview = previewDealerAction(type, symbol, power);
    if (usesBackendGameState(state)) {
      try {
        const api = await import('../services/apiService');
        const res = await api.get(`/api/dealer/preview-cost?type=${type}&power=${power}&symbol=${symbol}`);
        if (res?.code === 0 && typeof res.data?.cost === 'number') {
          realCost = res.data.cost;
          effectPct = res.data.effectPct ?? localPreview.effectPct;
          riskIncrease = res.data.riskIncrease ?? localPreview.riskIncrease;
        } else {
          realCost = localPreview.cost;
          effectPct = localPreview.effectPct;
          riskIncrease = localPreview.riskIncrease;
        }
      } catch {
        realCost = localPreview.cost;
        effectPct = localPreview.effectPct;
        riskIncrease = localPreview.riskIncrease;
      }
    } else {
      realCost = localPreview.cost;
      effectPct = localPreview.effectPct;
      riskIncrease = localPreview.riskIncrease;
    }

    // ---- 在线对局: 先同步后端 cash，再发 WS ----
    if (usesBackendGameState(state)) {
      if (!state.matchId) {
        get().showToast('尚未加入对局', 'warning');
        return { success: false, error: '未入对局' };
      }
      const synced = await get().refreshPortfolioFromServer();
      if (!synced) {
        get().showToast('无法同步服务器资金，请检查网络后重试', 'danger');
        return { success: false, error: '资金未同步' };
      }
      const freshCash = get().cash;
      if (freshCash < realCost) {
        get().showToast(
          `资金不足: 需要 ¥${realCost.toLocaleString()}，可用 ¥${freshCash.toLocaleString()}`,
          'warning',
        );
        return { success: false, error: '资金不足' };
      }
      try {
        const ws = await import('../services/wsService');
        await ws.waitForAuth(8000);
        ws.sendDealerAction({
          matchId: state.matchId!,
          type: type as any,
          power,
          symbol,
        });
        return { success: true };
      } catch (err) {
        get().showToast(`庄家指令发送失败: ${(err as Error).message}`, 'danger');
        return { success: false, error: '发送失败' };
      }
    }

    // ---- Local mode: 本地模拟（离线练习） ----
    if (state.cash < realCost) {
      get().showToast(`资金不足: 需要 ¥${realCost.toLocaleString()}，可用 ¥${state.cash.toLocaleString()}`, 'warning');
      return { success: false, error: '资金不足' };
    }

    const intensity = power / 100;
    let newPrice = state.currentQuote.price;
    let newVolume = state.currentQuote.volume;
    let extraCashEffect = 0;
    let fakeOrderBookRestore: typeof state.orderBook | null = null;

    switch (type) {
      case 'pump': {
        newPrice = state.currentQuote.price * (1 + effectPct / 100);
        if (newPrice > upper) newPrice = upper;
        break;
      }
      case 'press': {
        newPrice = state.currentQuote.price * (1 - effectPct / 100);
        if (newPrice < lower) newPrice = lower;
        break;
      }
      case 'accumulate': {
        newVolume = state.currentQuote.volume * (1 + effectPct / 100);
        extraCashEffect = 0;
        break;
      }
      case 'distribute': {
        newVolume = state.currentQuote.volume * (1 + effectPct / 100);
        extraCashEffect = power * 100 * state.currentQuote.price;
        newPrice = state.currentQuote.price * (1 - (effectPct * 0.3) / 100);
        if (newPrice < lower) newPrice = lower;
        break;
      }
      case 'wash':
        newVolume = state.currentQuote.volume * (1 + effectPct / 100);
        break;
      case 'fake': {
        const fakeBook: OrderBook = JSON.parse(JSON.stringify(state.orderBook));
        const idx = Math.floor(Math.random() * 5);
        fakeBook.asks[idx] = { ...fakeBook.asks[idx], quantity: fakeBook.asks[idx].quantity * 8 };
        fakeOrderBookRestore = fakeBook;
        break;
      }
    }

    newPrice = Math.max(1, newPrice);
    const newChange = newPrice - state.currentQuote.prevClose;
    const newChangePct = (newChange / state.currentQuote.prevClose) * 100;

    const scoreDelta: { manipulation?: number; insider?: number; misinformation?: number } = {};
    if (type === 'wash') scoreDelta.manipulation = (scoreDelta.manipulation ?? 0) + intensity * 2;
    if (['pump', 'press', 'wash', 'fake'].includes(type)) {
      scoreDelta.manipulation = (scoreDelta.manipulation ?? 0) + intensity * 1.5;
    }
    if (type === 'fake') {
      scoreDelta.misinformation = intensity / 2;
    }

    set((s) => {
      const sym = s.currentQuote.symbol;
      const cur = s.timelineBySymbol[sym] ?? [];
      const newTimeline = patchTimelineLastPoint(cur, newPrice);
      const newCash = s.cash - realCost + extraCashEffect;
      const dr = s.dealerResources;
      const positionValue = s.holdings.reduce((sum, h) => {
        const px = h.symbol === sym ? newPrice : (s.stockPrices[h.symbol] ?? h.marketPrice ?? h.avgPrice);
        return sum + h.shares * px;
      }, 0);
      const totalAssets = Math.max(0, newCash + positionValue - s.borrowed);
      const nextRisk = Math.min(100, (dr?.riskIndex ?? 0) + riskIncrease);
      return {
        currentQuote: {
          ...s.currentQuote,
          price: newPrice,
          change: newChange,
          changePercent: newChangePct,
          volume: newVolume,
          timestamp: Date.now(),
        },
        stockPrices: { ...s.stockPrices, [sym]: newPrice },
        orderBook: fakeOrderBookRestore ?? s.orderBook,
        ...cashSyncPatch(s, newCash, { riskIndex: nextRisk }),
        totalAssets,
        portfolioTotal: totalAssets,
        timelineData: newTimeline,
        timelineBySymbol: { ...s.timelineBySymbol, [sym]: newTimeline },
        holdings: s.holdings.map((h) => h.symbol === sym
          ? {
              ...h,
              marketPrice: newPrice,
              pnl: (newPrice - h.avgPrice) * h.shares,
              pnlPercent: h.avgPrice > 0 ? ((newPrice - h.avgPrice) / h.avgPrice) * 100 : 0,
            }
          : h),
      };
    });

    get().recalculateIndicators();

    if (Object.keys(scoreDelta).length > 0) {
      get().adjustScores(scoreDelta);
    }

    if (intensity > 0.4) {
      const alertLabels: Record<string, string> = {
        pump: '可疑拉升',
        press: '可疑压价',
        accumulate: '低位异常吸筹',
        distribute: '高位异常出货',
        wash: '对敲交易嫌疑',
        fake: '虚假挂单嫌疑',
      };
      get().addAlert({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        severity: intensity > 0.6 ? 'high' : 'medium',
        title: alertLabels[type] || '市场异常行为',
        description: `庄家执行了 ${type} 操作（强度 ${power}%），触发自动监控`,
        timestamp: Date.now(),
        source: 'Automated Detection',
      });
    }

    if (fakeOrderBookRestore && state.simulation.fakeOrderRestore) {
      clearTimeout(state.simulation.fakeOrderRestore);
    }
    if (fakeOrderBookRestore) {
      const original = state.orderBook;
      const t = setTimeout(() => {
        set((s) => ({ orderBook: original, simulation: { ...s.simulation, fakeOrderRestore: null } }));
      }, 3000);
      set((s) => ({ simulation: { ...s.simulation, fakeOrderRestore: t } }));
    }

    const labelMap: Record<string, string> = { pump: '拉升', press: '压价', accumulate: '吸筹', distribute: '出货', wash: '对敲', fake: '假挂单' };
    get().showToast(`庄家${labelMap[type] || type}执行成功（花费 ¥${realCost.toLocaleString()}）`, 'info');

    return { success: true };
  },
  
  triggerBlackSwan: () => {
    const state = get();
    if (state.role !== 'dealer') return;
    if (state.gameStatus !== 'playing') return;
    const crash = -0.15 - Math.random() * 0.10; // -15% ~ -25%
    const newPrice = Math.max(0.01, state.currentQuote.price * (1 + crash));
    set({
      currentQuote: {
        ...state.currentQuote,
        price: newPrice,
        change: newPrice - state.currentQuote.prevClose,
        changePercent: ((newPrice - state.currentQuote.prevClose) / state.currentQuote.prevClose) * 100,
        timestamp: Date.now(),
      },
      stockPrices: { ...state.stockPrices, [state.currentQuote.symbol]: newPrice },
      dealerResources: state.dealerResources ? {
        ...state.dealerResources,
        riskIndex: Math.min(100, state.dealerResources.riskIndex + 25),
      } : null,
      regulatoryScores: {
        manipulation: Math.min(100, state.regulatoryScores.manipulation + 15),
        insider: state.regulatoryScores.insider,
        misinformation: state.regulatoryScores.misinformation,
      },
    });
    get().addAlert({
      id: `bs_${Date.now()}`,
      severity: 'high',
      title: '⚠️ Black Swan 事件触发',
      description: `市场崩盘 -${Math.abs(crash * 100).toFixed(1)}%，所有股票大幅下跌`,
      timestamp: Date.now(),
      source: 'Black Swan Trigger',
    });
  },
  
  purchaseInsiderInfo: (_newsId, cost) => {
    const state = get();
    if (state.cash < cost) {
      get().showToast(`资金不足: 内幕信息需 ¥${cost.toLocaleString()}，可用 ¥${state.cash.toLocaleString()}`, 'warning');
      return { success: false, error: '资金不足' };
    }
    const trustworthy = Math.random() < 0.6;
    // A real tip forecasts the direction of the NEXT news event; the tip text is
    // chosen to match that locked direction so it turns out accurate.
    const INSIDER_TIP_WINDOW = 20; // ticks the tip stays actionable / detectable
    const direction: 'up' | 'down' = Math.random() < 0.5 ? 'up' : 'down';
    const realTips: Record<'up' | 'down', string> = {
      up: '机构正在大举建仓，主力资金持续流入（利好在即）',
      down: '主力资金持续出逃，警惕即将到来的回调（利空在即）',
    };
    const fakeTips = [
      '坊间传闻公司将被收购（已证伪）',
      '明日有重大利好公告（虚假信息）',
      '高管即将集体增持（信息有误）',
    ];
    const tip = trustworthy
      ? realTips[direction]
      : fakeTips[Math.floor(Math.random() * fakeTips.length)];
    const nextCash = state.cash - cost;
    const nextScores = {
      ...state.regulatoryScores,
      insider: Math.min(100, state.regulatoryScores.insider + 5),
      misinformation: trustworthy
        ? Math.min(100, state.regulatoryScores.misinformation + 1)
        : Math.min(100, state.regulatoryScores.misinformation + 4),
    };
    set({
      ...cashSyncPatch(state, nextCash),
      regulatoryScores: nextScores,
      scores: {
        manipulation: nextScores.manipulation,
        insider: nextScores.insider,
        misinformation: nextScores.misinformation,
      },
      // Only a real tip locks the next news direction; fake tips mislead.
      pendingInsiderTip: trustworthy
        ? { direction, expiresTick: state.currentTick + INSIDER_TIP_WINDOW }
        : null,
    });
    get().addAlert({
      id: `insider_${Date.now()}`,
      severity: 'medium',
      title: '内幕交易嫌疑',
      description: `检测到用户购买了内部消息（费用 ¥${cost.toLocaleString()}），触发监管告警`,
      timestamp: Date.now(),
      source: 'Insider Trading Monitor',
    });
    get().showToast(
      `${trustworthy ? '✅ 真消息' : '⚠️ 假消息'}: ${tip}`,
      trustworthy ? 'success' : 'warning',
    );
    return { success: true, tip, trustworthy };
  },
  
  setReversalCards: (cards) => set({ reversalCards: cards }),

  /**
   * 单人 Demo 入口：直接调 /api/match/solo，不走 quick-match 排队。
   * 用户点击"单人练习"按钮时调它；startMatch 3s 超时也会自动 fallback 到这。
   */
  startSoloMatch: async () => {
    await get().startOfflinePractice(get().role);
  },

  startOnlineQuickMatch: async () => {
    const state = get();
    const playerCount = state.onlinePlayerCount;
    set({
      matchFlow: 'online',
      gameStatus: 'waiting',
      waitingRoom: {
        code: null,
        currentPlayers: 0,
        requiredPlayers: playerCount,
        countdown: null,
        mode: 'quick',
      },
    });
    if (state.backendMode) {
      const api = await import('../services/apiService');
      const r = await api.apiMatch.quickMatch(state.userId, undefined, playerCount);
      if (r.code !== 0 || !r.data) {
        get().showToast(`快速匹配失败: ${r.message}`, 'warning');
        set({ gameStatus: 'idle', matchFlow: null, waitingRoom: null });
        return;
      }
      if (r.data.matchId) {
        await get()._joinBackendMatch(r.data.matchId, r.data.role);
        return;
      }
      set({
        waitingRoom: {
          code: null,
          currentPlayers: r.data.currentPlayers ?? 1,
          requiredPlayers: r.data.requiredPlayers ?? playerCount,
          countdown: null,
          mode: 'quick',
        },
      });
      get().showToast('正在等待对手加入...', 'info');
      return;
    }
    set({
      gameStatus: 'matching',
      waitingRoom: null,
      reversalCards: [
        { role: 'dealer', revealed: false },
        { role: 'retail', revealed: false },
        { role: 'regulator', revealed: false },
      ],
    });
  },

  startOfflinePractice: async (role: Role) => {
    const aiRoles: Record<Role, [Role, Role]> = {
      dealer: ['retail', 'regulator'],
      retail: ['dealer', 'regulator'],
      regulator: ['dealer', 'retail'],
    };
    const [ai1, ai2] = aiRoles[role];
    // 离线练习 = 纯本地模拟（单资金池 store.cash），不走后端 solo 对局
    set({
      matchFlow: 'offline',
      role,
      matchId: null,
      matchOpponentName: 'AI Bot',
      reversalCards: [
        { role, revealed: true },
        { role: ai1, revealed: false },
        { role: ai2, revealed: false },
      ],
    });
    get().showToast('离线练习 · 本地模拟（交易与操盘共用现金）', 'info');
    get().enterPlaying();
  },

  createOnlineRoom: async (playerCount: 2 | 3 = 2) => {
    const state = get();
    if (!state.backendMode) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      set({
        matchFlow: 'online',
        gameStatus: 'waiting',
        onlinePlayerCount: playerCount,
        waitingRoom: {
          code,
          currentPlayers: 1,
          requiredPlayers: playerCount,
          countdown: null,
          mode: 'room',
        },
      });
      get().showToast(`本地模式：房间码 ${code}（演示）`, 'info');
      return code;
    }
    const api = await import('../services/apiService');
    set({
      matchFlow: 'online',
      gameStatus: 'waiting',
      onlinePlayerCount: playerCount,
      waitingRoom: {
        code: null,
        currentPlayers: 1,
        requiredPlayers: playerCount,
        countdown: null,
        mode: 'room',
      },
    });
    const r = await api.apiMatch.createRoom(state.userId, playerCount);
    if (r.code !== 0 || !r.data?.code) {
      get().showToast(`创建房间失败: ${r.message}`, 'warning');
      set({ gameStatus: 'idle', matchFlow: null, waitingRoom: null });
      return null;
    }
    set({
      waitingRoom: {
        code: r.data.code,
        currentPlayers: r.data.currentPlayers,
        requiredPlayers: r.data.requiredPlayers,
        countdown: null,
        mode: 'room',
      },
    });
    get().showToast('房间已创建，等待对手加入...', 'info');
    return r.data.code;
  },

  joinOnlineRoom: async (code: string) => {
    const state = get();
    if (!state.backendMode) {
      get().showToast('本地模式：模拟加入房间', 'info');
      await get().startOfflinePractice(state.role);
      return;
    }
    set({
      matchFlow: 'online',
      gameStatus: 'waiting',
      waitingRoom: {
        code: code.toUpperCase(),
        currentPlayers: 0,
        requiredPlayers: state.onlinePlayerCount,
        countdown: null,
        mode: 'room',
      },
    });
    const api = await import('../services/apiService');
    const r = await api.apiMatch.joinRoom(state.userId, code);
    if (r.code !== 0 || !r.data) {
      get().showToast(`加入房间失败: ${r.message}`, 'warning');
      set({ gameStatus: 'idle', matchFlow: null, waitingRoom: null });
      return;
    }
    if (r.data.matchId && r.data.role) {
      await get()._joinBackendMatch(r.data.matchId, r.data.role);
      return;
    }
    set({
      waitingRoom: {
        code: r.data.code,
        currentPlayers: r.data.currentPlayers,
        requiredPlayers: r.data.requiredPlayers,
        countdown: null,
        mode: 'room',
      },
    });
    get().showToast('已加入房间，等待其他玩家...', 'info');
  },

  /**
   * 把任意 backend matchId 接进 store 的私有 helper：
   *   - 调 ws.join-match
   *   - 等 server 推 match:snapshot（通过 _applyServerSnapshot 已挂载）
   *   - 失败回 idle
   */
  _joinBackendMatch: async (matchId: string, role: string | null) => {
    if (!matchId) return;
    // ⛳ 关键：进入新对局瞬间，store 里的 cash 还是上一局的旧值（或默认值）。
    //   在这里先把所有 cash 相关字段统一重置为 0，避免 Tools / Trade / Home 页面
    //   在 snapshot 到达前显示错乱的旧资金。
    //   等 _applyServerSnapshot 拿到后端 portfolio 后，会再用真实值覆盖。
    get()._resetCashForMatchEntry();
    const ws = await import('../services/wsService');
    // 关键修复：socket.io 在未连接时会 buffer emit，但 ack 可能在 backend 看到
    // auth 完成之前就到达 — 后端 session.userId 为空 → 返回 {ok:false} → 前端误判 401。
    // 这里先 await connect + auth，再 emit join-match。
    try {
      console.log('[join] waiting for WS connect + auth…');
      await ws.waitForAuth(10000);
      console.log('[join] WS auth OK, emitting join-match', matchId);
      console.log('[solo] emitting join-match', matchId);
      const ack = await ws.joinMatch(matchId);
      console.log('[solo] join-match ack', ack);
      console.log('[join] join-match ack', ack);
      if (!ack?.ok) {
        const reason = ack?.reason === 'not_in_match'
          ? '用户不在该对局中（userId 与创建对局时不一致）'
          : ack?.reason === 'no_session'
            ? 'WS 未鉴权，请先连接后端'
            : (ack?.message || '鉴权或房间不存在');
        get().showToast(`加入对局失败: ${reason}`, 'warning');
        set({ gameStatus: 'idle', matchId: null, matchFlow: null });
        return;
      }
      set({
        matchId,
        role: (role as Role) ?? (ack.role as Role) ?? get().role,
        gameStatus: 'matching',
        waitingRoom: null,
      });
      get().showToast(`已加入对局 ${matchId} (${role ?? ack.role})`, 'success');
      // snapshot 由 _applyServerSnapshot 异步灌入
    } catch (err) {
      console.error('[join] error', err);
      get().showToast(`加入对局失败: ${(err as Error).message}`, 'danger');
      set({ gameStatus: 'idle', matchId: null, matchFlow: null });
    }
  },
  
  revealReversalCard: (index) => set((s) => {
    if (s.reversalCards[index].revealed) return s;
    const useBackendRole = s.matchFlow === 'online' && s.backendMode && !!s.matchId;
    const pickedRole = useBackendRole ? s.role : s.reversalCards[index].role;
    return {
      role: pickedRole,
      reversalCards: s.reversalCards.map((c, i) =>
        i === index ? { ...c, revealed: true, role: pickedRole } : c
      ),
    };
  }),

  randomizeMyRole: () => {
    const state = get();
    if (state.matchFlow === 'online' && state.backendMode) return;
    set((_s) => {
      const cards: [Role, Role, Role] = ['dealer', 'retail', 'regulator'];
      const shuffled = [...cards].sort(() => Math.random() - 0.5);
      const myIndex = Math.floor(Math.random() * 3);
      const myRole = shuffled[myIndex];
      return {
        role: myRole,
        reversalCards: shuffled.map((r, i) => ({ role: r, revealed: i === myIndex })),
      };
    });
  },
  
  startMatch: () => {
    void get().startOnlineQuickMatch();
  },
  
  cancelMatch: () => {
    void get().cancelWaiting();
  },

  cancelWaiting: async () => {
    const state = get();
    if (state.backendMode && (state.waitingRoom || state.gameStatus === 'waiting')) {
      const api = await import('../services/apiService');
      await api.apiMatch.cancelWaiting(state.userId);
    }
    set({
      gameStatus: 'idle',
      matchFlow: null,
      waitingRoom: null,
      matchId: null,
    });
  },
  
  endMatch: () => {
    const state = get();
    // Compute final assets
    const finalCash = state.cash;
    const finalPositions = state.holdings.reduce((sum, h) => sum + h.marketPrice * h.shares, 0);
    const finalAssets = finalCash + finalPositions - state.borrowed;
    const initialAssets = state.simulation.initialAssets;
    const returnRate = ((finalAssets - initialAssets) / initialAssets) * 100;
    // Mock opponent: simulate opponent return ~ random
    const opponentReturn = (Math.random() - 0.45) * 18; // opponent bias slightly down
    const opponentAssets = Math.round(initialAssets * (1 + opponentReturn / 100));

    set({
      gameStatus: 'idle',
      currentDay: 1,
      currentTick: 0,
      simulation: {
        ...state.simulation,
        settlementComputed: true,
        finalAssets,
        initialAssets,
        opponentAssets,
        returnRate,
        session: 'closed',
        dailySettlement: null,
        lunchAutoTimer: null,
        dayAutoTimer: null,
      } as SimulationState,
    });
    if (state.simulation.lunchAutoTimer) clearTimeout(state.simulation.lunchAutoTimer);
    if (state.simulation.dayAutoTimer) clearTimeout(state.simulation.dayAutoTimer);
    get().stopSimulation();
  },
  
  updateSettings: (newSettings) => set((s) => ({
    settings: { ...s.settings, ...newSettings }
  })),
  
  readMessage: (id) => set((s) => ({
    messages: s.messages.map(m => m.id === id ? { ...m, read: true } : m)
  })),
  
  sendMessage: (_to, subject, content) => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const state = get();
    set((s) => ({
      messages: [{
        id,
        from: state.userName,
        fromRole: state.role,
        subject,
        preview: content.slice(0, 80),
        content,
        timestamp: Date.now(),
        read: true,
        type: 'player'
      }, ...s.messages]
    }));
  },

  // ============ Tick Engine & Live Simulation ============

  showToast: (message, type = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    set({ toast: { id, message, type } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3500);
  },

  showModal: (type, message, title) => {
    set({ modal: { type, message, title } });
  },

  dismissModal: () => set({ modal: null }),

  resetGameSession: () => {
    const state = get();
    const sim = state.simulation;
    if (sim.lunchAutoTimer) clearTimeout(sim.lunchAutoTimer);
    if (sim.dayAutoTimer) clearTimeout(sim.dayAutoTimer);
    const positionValue = state.holdings.reduce((s, h) => s + h.marketPrice * h.shares, 0);
    const totalAssets = state.cash + positionValue - state.borrowed;
    set({
      currentDay: 1,
      currentTick: 0,
      simulation: {
        ...sim,
        session: 'morning',
        dailySettlement: null,
        lunchAutoTimer: null,
        dayAutoTimer: null,
        dayOpenAssets: totalAssets > 0 ? totalAssets : STARTING_ASSETS,
        dayOpenPrice: state.currentQuote.price,
        _serverTickCount: 0,
        _lastTimelineTick: 0,
        _lastHoldingsUpdate: 0,
        _sessionInitialized: false,
      },
    });
  },

  enterPlaying: () => {
    get().resetGameSession();
    set({ gameStatus: 'playing' });
    const st = get();
    if (usesBackendGameState(st) && st.matchId) {
      void st.refreshPortfolioFromServer();
    }
  },

  _resetMatchToIdle: () => {
    set({
      gameStatus: 'idle',
      matchFlow: null,
      matchId: null,
      waitingRoom: null,
      modal: null,
    });
    get().setSection('overview');
  },

  endLunchBreak: () => {
    const state = get();
    if (state.gameStatus !== 'playing') return;
    get().stopSimulation();

    // Mid-day stats (morning session P&L)
    const positions = state.holdings.reduce((s, h) => s + h.marketPrice * h.shares, 0);
    const totalAssets = state.cash + positions - state.borrowed;
    const dayPnl = totalAssets - state.simulation.dayOpenAssets;
    const dayPnlPct = (dayPnl / state.simulation.dayOpenAssets) * 100;
    const lastPrice = state.currentQuote.price;

    set({
      gameStatus: 'idle',
      currentTick: 0,
      simulation: {
        ...state.simulation,
        session: 'lunch',
        dailySettlement: {
          day: state.currentDay,
          open: state.simulation.dayOpenPrice,
          close: lastPrice,
          pnl: dayPnl,
          pnlPercent: dayPnlPct,
          trades: state.totalTradeCount,
          isFinal: false,
        },
        dayOpenPrice: lastPrice,
        dayOpenAssets: totalAssets,
      },
    });

    get().showToast('11:30 中午收盘｜13:00 下午开盘', 'info');

    // Auto-resume afternoon after 2s lunch pause
    if (state.simulation.lunchAutoTimer) clearTimeout(state.simulation.lunchAutoTimer);
    const t = setTimeout(() => {
      if (get().simulation.session === 'lunch') {
        get().resumeAfternoon();
      }
    }, 2000);
    set((s) => ({ simulation: { ...s.simulation, lunchAutoTimer: t } }));
  },

  resumeAfternoon: () => {
    const state = get();
    if (state.gameStatus !== 'idle' || state.simulation.session !== 'lunch') return;
    if (state.simulation.lunchAutoTimer) {
      clearTimeout(state.simulation.lunchAutoTimer);
    }
    set({
      gameStatus: 'playing',
      simulation: { ...state.simulation, session: 'afternoon', dailySettlement: null, lunchAutoTimer: null, _sessionInitialized: false },
    });
    get().startSimulation();
  },

  endTradingDay: () => {
    const state = get();
    if (state.gameStatus !== 'playing') return;
    get().stopSimulation();

    const closedDay = state.currentDay;
    const isFinalDay = closedDay >= state.maxDays;

    // Compute daily settlement stats
    const positions = state.holdings.reduce((s, h) => s + h.marketPrice * h.shares, 0);
    const totalAssets = state.cash + positions - state.borrowed;
    const dayPnl = totalAssets - state.simulation.dayOpenAssets;
    const dayPnlPct = (dayPnl / state.simulation.dayOpenAssets) * 100;
    const lastPrice = state.currentQuote.price;
    const todayOpen = state.simulation.dayOpenPrice;

    if (isFinalDay) {
      get().showToast(`第 ${closedDay} 日 15:00 收盘｜全部交易日结束`, 'success');
      get().endMatch();
      set({ gameStatus: 'settlement' });
      return;
    }

    set({
      gameStatus: 'idle',
      currentTick: 0,
      simulation: {
        ...state.simulation,
        session: 'closed',
        dailySettlement: {
          day: closedDay,
          open: todayOpen,
          close: lastPrice,
          pnl: dayPnl,
          pnlPercent: dayPnlPct,
          trades: state.totalTradeCount,
          isFinal: false,
        },
      },
    });

    // Auto-advance to next day after 2s close pause
    if (state.simulation.dayAutoTimer) clearTimeout(state.simulation.dayAutoTimer);
    const t = setTimeout(() => {
      if (get().simulation.session === 'closed') {
        get().resumeNextDay();
      }
    }, 2000);
    set((s) => ({ simulation: { ...s.simulation, dayAutoTimer: t } }));
  },

  resumeNextDay: () => {
    const state = get();
    if (state.gameStatus !== 'idle' || state.simulation.session !== 'closed') return;
    const lastPrice = state.currentQuote.price;

    if (state.simulation.dayAutoTimer) {
      clearTimeout(state.simulation.dayAutoTimer);
    }

    set({
      gameStatus: 'playing',
      currentDay: state.currentDay + 1,
      currentTick: 0,
      currentQuote: {
        ...state.currentQuote,
        prevClose: lastPrice,
        open: lastPrice,
        high: lastPrice,
        low: lastPrice,
        change: 0,
        changePercent: 0,
        timestamp: Date.now(),
      },
      timelineData: [],
      timelineBySymbol: {},
      klinesBySymbol: {},
      klines: [],
      orderBook: {
        bids: Array.from({ length: 5 }, (_, i) => ({
          price: Math.round((lastPrice - 0.01 * (i + 1)) * 100) / 100,
          quantity: 50 + Math.floor(Math.random() * 450),
          orders: 5 + Math.floor(Math.random() * 20),
        })),
        asks: Array.from({ length: 5 }, (_, i) => ({
          price: Math.round((lastPrice + 0.01 * (i + 1)) * 100) / 100,
          quantity: 50 + Math.floor(Math.random() * 450),
          orders: 5 + Math.floor(Math.random() * 20),
        })),
      },
      simulation: {
        ...state.simulation,
        session: 'morning',
        dailySettlement: null,
        dayOpenPrice: lastPrice,
        dayOpenAssets: state.cash + state.holdings.reduce((s, h) => s + h.marketPrice * h.shares, 0) - state.borrowed,
        dayAutoTimer: null,
        _sessionInitialized: false,
      },
    });
    get().startSimulation();
  },

  startSimulation: () => {
    const state = get();
    console.log('[startSim] called; status=', state.gameStatus, 'backend=', state.backendMode, 'tickInterval=', Math.max(60, Math.floor(3000 / (state.simulation.speed || 1))));
    if (state.gameStatus !== 'playing') return;
    // 防御性：如果已有 timer，先清再起，避免双开
    if (state.simulation.timer) {
      clearInterval(state.simulation.timer);
    }
    if (state.simulation.klineTimer) clearInterval(state.simulation.klineTimer);
    if (state.simulation.indicatorTimer) clearInterval(state.simulation.indicatorTimer);
    if (state.simulation.blackSwanTimer) clearInterval(state.simulation.blackSwanTimer);

    // Backend mode & 本地模式共享同一套 timer 框架，差别只在 processTick 内部：
    //   backend → 价格从 server quote 拉，本 tick 只推 timeline / 维护 K 线
    //   local   → GBM 算价格
    // K 线聚合由独立 timer 触发（klineInterval = tickInterval * 8，约 24s @ 1x）。

    // Pacing: 1 day = 120 ticks (60 morning + 60 afternoon, lunch break collapsed).
    // Default speed (1x) targets ~6 min per simulated trading day.
    //   1x → 3000ms/tick → 120 ticks = 360s = 6 min/day
    //   2x → 1500ms/tick → 120 ticks = 180s = 3 min/day
    //   4x →  750ms/tick → 120 ticks =  90s = 1.5 min/day

    // Pacing: 1 day = 120 ticks (60 morning + 60 afternoon, lunch break collapsed).
    // Default speed (1x) targets ~6 min per simulated trading day.
    //   1x → 3000ms/tick → 120 ticks = 360s = 6 min/day
    //   2x → 1500ms/tick → 120 ticks = 180s = 3 min/day
    //   4x →  750ms/tick → 120 ticks =  90s = 1.5 min/day
    const speed = Math.max(0.5, Math.min(8, state.simulation.speed || 1));
    const tickInterval = Math.max(60, Math.floor(3000 / speed));
    const klineInterval = Math.max(2000, tickInterval * 8);
    const newsBase = Math.max(8000, tickInterval * 20);
    const newsRand = Math.max(4000, tickInterval * 20);

    // Initialize kline baseline
    set({
      simulation: {
        ...state.simulation,
        lastKlineOpen: state.simulation.lastKlineOpen ?? { price: state.currentQuote.price, time: Date.now() },
        lastIndexTrigger: { manipulation: state.regulatoryScores.manipulation, insider: state.regulatoryScores.insider, misinformation: state.regulatoryScores.misinformation },
      },
    });

    // Tick: geometric Brownian motion price update (interval scales with speed)
    const tickTimer = setInterval(() => {
      get().processTick();
    }, tickInterval);

    // Aggregate K-line
    const klineTimer = setInterval(() => {
      get().aggregateKline();
    }, klineInterval);

    // Random news
    const scheduleNews = () => {
      const delay = newsBase + Math.random() * newsRand;
      const t = setTimeout(() => {
        if (get().gameStatus === 'playing') {
          get().pushRandomNews();
          scheduleNews();
        }
      }, delay);
      set((s) => ({ simulation: { ...s.simulation, newsTimer: t } }));
    };
    scheduleNews();

    // Black Swan chance per day (10%) — check every 60s
    const blackSwanTimer = setInterval(() => {
      get().maybeTriggerBlackSwan();
    }, 60000);

    // Recompute indicators every 5s
    const indicatorTimer = setInterval(() => {
      get().recalculateIndicators();
    }, 5000);

    set({
      simulation: {
        ...get().simulation,
        timer: tickTimer,
        klineTimer,
        blackSwanTimer,
        indicatorTimer,
        _sessionInitialized: true,
      },
    });

    get().refreshOrderBook();
  },

  stopSimulation: () => {
    const s = get().simulation;
    console.log('[stopSim] clearing timer=' + !!s.timer);
    if (s.timer) clearInterval(s.timer);
    if (s.klineTimer) clearInterval(s.klineTimer);
    if (s.newsTimer) clearTimeout(s.newsTimer);
    if (s.blackSwanTimer) clearInterval(s.blackSwanTimer);
    if (s.indicatorTimer) clearInterval(s.indicatorTimer);
    if (s.fakeOrderRestore) clearTimeout(s.fakeOrderRestore);
    set({
      simulation: {
        timer: null,
        klineTimer: null,
        newsTimer: null,
        blackSwanTimer: null,
        indicatorTimer: null,
        lastKlineOpen: null,
        lastIndexTrigger: { manipulation: 0, insider: 0, misinformation: 0 },
        fakeOrderRestore: null,
        settlementComputed: s.settlementComputed,
        initialAssets: s.initialAssets,
        opponentAssets: s.opponentAssets,
        // 保留结算结果，避免 endMatch 计算完 finalAssets 后被 stopSimulation 抹掉。
        finalAssets: s.finalAssets,
        returnRate: s.returnRate,
        session: s.session,
        dailySettlement: s.dailySettlement,
        dayOpenAssets: s.dayOpenAssets,
        dayOpenPrice: s.dayOpenPrice,
        lunchAutoTimer: s.lunchAutoTimer,
        dayAutoTimer: s.dayAutoTimer,
        speed: s.speed,
        _serverTickCount: s._serverTickCount,
        _lastTimelineTick: s._lastTimelineTick,
        _lastHoldingsUpdate: s._lastHoldingsUpdate,
      },
    });
  },

  processTick: () => {
    const state = get();
    // 不要在 tick 自己里 stopSimulation — 因为这一帧的 state.gameStatus 可能还在 transitioning
    // （Playwright / Strict Mode 偶发）。改为只警告不 stop。
    if (state.gameStatus !== 'playing') return;
    // 每 50 次打一次心跳，避免 console flood
    if (!get().simulation._tickLogCount) get().simulation._tickLogCount = 0;
    const lc = get().simulation._tickLogCount as number;
    if (lc % 30 === 0) console.log('[processTick] tick#' + state.currentTick + ' backend=' + state.backendMode + ' price=' + state.currentQuote.price);
    // Backend mode: 价格由 server market:tick 驱动（见 _applyServerTick）。
    // 但当前 all-in-one 的 processTick 也负责 tick 计数 / 时钟 / 午休 / 收盘。
    // 我们分开做：backend mode 只推进“时间/日程/结算”等，不再对 prices 做额外 GBM。
    const isBackend = state.backendMode;

    // 1) 价格
    //    - local mode：由本地 GBM 驱动（包括 holdings 里的其它 symbol）
    //    - backend mode：价格直接来自 _applyServerTick 推送的全量 market:tick，不做本地兜底 GBM
    let newPrice: number;
    let nextStockPrices: Record<string, number>;
    let newVolume: number;
    const gbmStep = (prevPrice: number) => {
      const sigma = LOCAL_GBM_SIGMA;
      const drift = (Math.random() - 0.48) * sigma;
      const noise = (Math.random() - 0.5) * sigma * 0.5;
      const prevClose = state.currentQuote.prevClose || prevPrice;
      const upper = prevClose * 1.10;
      const lower = prevClose * 0.90;
      let next = Math.max(1, prevPrice * (1 + drift + noise));
      if (next > upper) next = upper;
      if (next < lower) next = lower;
      return next;
    };
    const gbmHeldSymbol = (sym: string): number => {
      const held = state.holdings.find((h) => h.symbol === sym);
      const prev = state.stockPrices[sym] ?? held?.avgPrice ?? held?.marketPrice ?? 1;
      return gbmStep(prev);
    };
    if (isBackend) {
      // 后端模式：current symbol 用 server 推过来的价格（全量 prices 也已经在 _applyServerTick 更新）
      newPrice = state.currentQuote.price;
      nextStockPrices = { ...state.stockPrices };
      nextStockPrices[state.currentQuote.symbol] = newPrice;
      newVolume = state.currentQuote.volume;
    } else {
      // 本地模式：current symbol 自己 GBM；持仓的其它 symbol 各自 GBM
      const selectedPrevPrice = state.stockPrices[state.currentQuote.symbol] ?? state.currentQuote.price;
      newPrice = gbmStep(selectedPrevPrice);
      nextStockPrices = { ...state.stockPrices };
      nextStockPrices[state.currentQuote.symbol] = newPrice;
      for (const h of state.holdings) {
        if (h.symbol === state.currentQuote.symbol) continue;
        nextStockPrices[h.symbol] = gbmHeldSymbol(h.symbol);
      }
      newVolume = state.currentQuote.volume + Math.floor(Math.random() * 100);
    }

    const newChange = newPrice - state.currentQuote.prevClose;
    const newChangePct = (newChange / state.currentQuote.prevClose) * 100;

    // Dealer energy regen 已移除 — 取消 energy 机制后庄家只受 cash 约束
    const cashPatch = cashSyncPatch(state, state.cash, {
      riskIndex: state.dealerResources?.riskIndex ?? 0,
    });

    const sym2 = state.currentQuote.symbol;
    const timelineSymbols = new Set<string>([
      sym2,
      ...state.holdings.map((h) => h.symbol),
      ...Object.keys(state.timelineBySymbol),
    ]);

    let tlNext = state.timelineData;
    let tlBySymbolNext = state.timelineBySymbol;
    if (!isBackend) {
      // 本地模式：每个游戏 tick 追加一点；GBM 已在上面更新过价格
      tlBySymbolNext = appendTimelineGameTick(
        state.timelineBySymbol,
        nextStockPrices,
        [...timelineSymbols],
      );
      tlNext = tlBySymbolNext[sym2] ?? [];
    } else {
      // 后端模式：游戏 tick 追加新点；盘内 200ms 行情在 _applyServerTick 里 patch 末点
      tlBySymbolNext = appendTimelineGameTick(
        state.timelineBySymbol,
        nextStockPrices,
        [...timelineSymbols],
      );
      tlNext = tlBySymbolNext[sym2] ?? state.timelineData;
    }
    // 后端模式 currentQuote.price 已经被 _applyServerTick 实时更新，这里 newPrice === state.currentQuote.price 是 no-op；
    //   但 high/low/timestamp 还是要维护。stockPrices 同理。
    set({
      currentQuote: {
        ...state.currentQuote,
        price: newPrice,
        change: newChange,
        changePercent: state.currentQuote.prevClose > 0 ? newChangePct : state.currentQuote.changePercent,
        volume: newVolume,
        high: Math.max(state.currentQuote.high, newPrice),
        low: Math.min(state.currentQuote.low, newPrice),
        timestamp: Date.now(),
      },
      timelineData: tlNext,
      timelineBySymbol: tlBySymbolNext,
      currentTick: state.currentTick + 1,
      stockPrices: nextStockPrices,
      ...cashPatch,
    });

    // Daily pacing: 4 trading segments separated by 11:30 lunch break and 15:00 close
    // 09:30-10:30 (60)  10:30-11:30 (60)  lunch  13:00-14:00 (60)  14:00-15:00 (60)
    // 1 上午/下午盘 = 60 tick = ~3 min 现实时间（1x 速度）
    // 1 整天 = 120 tick (60 上午 + 60 下午，午休在 store 端跳过不进 timeline)
    const TICKS_PER_HALF = 60;
    const nextTick = state.currentTick + 1;
    const session = state.simulation.session;
    // Only evaluate session boundaries once the tick engine is armed and we have
    // advanced past the opening tick — prevents stale tick/day from firing at match start.
    let sessionTransitioned = false;
    if (state.simulation._sessionInitialized) {
      if (session === 'morning' && nextTick >= TICKS_PER_HALF) {
        // 11:30 上午收盘 → 午休
        get().endLunchBreak();
        sessionTransitioned = true;
      } else if (session === 'afternoon' && nextTick >= TICKS_PER_HALF) {
        // 15:00 全天收盘
        get().endTradingDay();
        sessionTransitioned = true;
      }
    }
    if (sessionTransitioned) return;

    // Multi-symbol mark-to-market: every holding uses its own stockPrices[symbol].
    // Holdings of symbols not currently selected still get marked at their last known price.
    set((s) => {
      if (s.holdings.length === 0) return s;
      const holdings = s.holdings.map(h => {
        const marketPrice = s.stockPrices[h.symbol] ?? h.marketPrice ?? h.avgPrice;
        return {
          ...h,
          marketPrice,
          pnl: (marketPrice - h.avgPrice) * h.shares,
          pnlPercent: h.avgPrice > 0 ? ((marketPrice - h.avgPrice) / h.avgPrice) * 100 : 0,
        };
      });
      const positionValue = holdings.reduce((sum, h) => sum + h.marketPrice * h.shares, 0);
      const unrealizedPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);
      const portfolioTotal = s.cash + positionValue - s.borrowed;
      const initialAssets = s.simulation.initialAssets || STARTING_ASSETS;
      const todayPnl = portfolioTotal - initialAssets;
      const todayPnlPercent = initialAssets > 0 ? (todayPnl / initialAssets) * 100 : 0;
      return { holdings, portfolioTotal, totalAssets: portfolioTotal, unrealizedPnl, todayPnl, todayPnlPercent };
    });

    // Update order book occasionally (every 5 ticks)
    if (state.currentTick % 5 === 0) {
      get().refreshOrderBook();
    }

    // Check regulatory index thresholds
    const scores = state.regulatoryScores;
    const last = state.simulation.lastIndexTrigger;
    const fiveMin = 5 * 60 * 1000;
    const now = Date.now();
    const checkAndAlert = (key: 'manipulation' | 'insider' | 'misinformation', threshold: number, title: string, desc: string) => {
      if (scores[key] <= threshold) return;
      // Don't repeat within 5 min
      const lastTime = (last as any)[`${key}Time`] as number | undefined;
      if (lastTime && now - lastTime < fiveMin) return;
      get().addAlert({
        id: `idx_${key}_${now}`,
        severity: scores[key] > 80 ? 'high' : 'medium',
        title,
        description: desc,
        timestamp: now,
        source: 'Index Threshold Monitor',
      });
      (last as any)[`${key}Time`] = now;
    };
    checkAndAlert('manipulation', 60, '操纵指数异常', `操纵指数 ${scores.manipulation.toFixed(1)} 超过 60 阈值`);
    checkAndAlert('insider', 50, '内幕交易指数异常', `内幕交易指数 ${scores.insider.toFixed(1)} 超过 50 阈值`);
    checkAndAlert('misinformation', 40, '虚假信息指数异常', `虚假信息指数 ${scores.misinformation.toFixed(1)} 超过 40 阈值`);
  },

  aggregateKline: () => {
    const state = get();
    if (!state.simulation.lastKlineOpen) {
      set((s) => ({
        simulation: { ...s.simulation, lastKlineOpen: { price: state.currentQuote.price, time: Date.now() } },
      }));
      return;
    }
    const last = state.simulation.lastKlineOpen;
    const sym3 = state.currentQuote.symbol;
    const recent = state.timelineBySymbol[sym3] ?? state.timelineData;
    const slice = recent.length > 0 ? recent : [state.currentQuote.price];
    const open = last.price;
    const close = state.currentQuote.price;
    const high = Math.max(...slice, open);
    const low = Math.min(...slice, open);
    const volume = state.currentQuote.volume;
    const kline = { timestamp: last.time, open, high, low, close, volume };
    set((s) => {
      const curKl = s.klinesBySymbol[sym3] ?? [];
      const newKl = [...curKl, kline].slice(-100);
      return {
        klines: sym3 === s.currentQuote.symbol ? newKl : s.klines,
        klinesBySymbol: { ...s.klinesBySymbol, [sym3]: newKl },
        simulation: { ...s.simulation, lastKlineOpen: { price: close, time: Date.now() } },
      };
    });
  },

  recalculateIndicators: () => {
    const state = get();
    const closes = state.klines.map(k => k.close);
    const n = closes.length;
    if (n < 5) return;

    const sma = (arr: number[], period: number) => {
      const out: (number | null)[] = new Array(arr.length).fill(null);
      for (let i = 0; i < arr.length; i++) {
        if (i + 1 < period) continue;
        let s = 0;
        for (let j = i + 1 - period; j <= i; j++) s += arr[j];
        out[i] = s / period;
      }
      return out;
    };
    const ma5Series = sma(closes, 5);
    const ma10Series = sma(closes, 10);
    const ma20Series = sma(closes, 20);

    // EMA series
    const ema = (arr: number[], period: number) => {
      const k = 2 / (period + 1);
      const out: (number | null)[] = new Array(arr.length).fill(null);
      let e = arr[0];
      out[0] = e;
      for (let i = 1; i < arr.length; i++) {
        e = arr[i] * k + e * (1 - k);
        out[i] = e;
      }
      return out;
    };
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const diffSeries = ema12.map((v, i) => v !== null && ema26[i] !== null ? (v as number) - (ema26[i] as number) : null);
    const deaSeries = ema(diffSeries as number[], 9);
    const barSeries = diffSeries.map((v, i) => v !== null && deaSeries[i] !== null ? ((v as number) - (deaSeries[i] as number)) * 2 : null);

    // RSI(14) series
    const rsiSeries: (number | null)[] = new Array(n).fill(null);
    for (let i = 14; i < n; i++) {
      let gains = 0, losses = 0;
      for (let j = i - 13; j <= i; j++) {
        const d = closes[j] - closes[j - 1];
        if (d > 0) gains += d; else losses -= d;
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      if (avgLoss === 0) rsiSeries[i] = 100;
      else rsiSeries[i] = 100 - 100 / (1 + avgGain / avgLoss);
    }

    // BOLL(20, 2) series
    const bollUpper: (number | null)[] = new Array(n).fill(null);
    const bollMid: (number | null)[] = new Array(n).fill(null);
    const bollLower: (number | null)[] = new Array(n).fill(null);
    for (let i = 19; i < n; i++) {
      const slice = closes.slice(i - 19, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / 20;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / 20;
      const std = Math.sqrt(variance);
      bollUpper[i] = mean + 2 * std;
      bollMid[i] = mean;
      bollLower[i] = mean - 2 * std;
    }

    // KDJ(9, 3, 3) — random walk-index style. Needs high/low too.
    const kdjK: (number | null)[] = new Array(n).fill(null);
    const kdjD: (number | null)[] = new Array(n).fill(null);
    const kdjJ: (number | null)[] = new Array(n).fill(null);
    const highs = state.klines.map(k => k.high);
    const lows = state.klines.map(k => k.low);
    let prevK = 50, prevD = 50;
    for (let i = 0; i < n; i++) {
      if (i + 1 < 9) continue;
      const start = i + 1 - 9;
      const sliceHigh = Math.max(...highs.slice(start, i + 1));
      const sliceLow = Math.min(...lows.slice(start, i + 1));
      const rsv = sliceHigh === sliceLow ? 0 : ((closes[i] - sliceLow) / (sliceHigh - sliceLow)) * 100;
      const k = (2 * prevK + rsv) / 3;
      const d = (2 * prevD + k) / 3;
      const j = 3 * k - 2 * d;
      kdjK[i] = k; kdjD[i] = d; kdjJ[i] = j;
      prevK = k; prevD = d;
    }

    // WR(14) — Williams %R. Range 0..-100; render in -100..0 in UI.
    const wrSeries: (number | null)[] = new Array(n).fill(null);
    for (let i = 13; i < n; i++) {
      const start = i + 1 - 14;
      const hh = Math.max(...highs.slice(start, i + 1));
      const ll = Math.min(...lows.slice(start, i + 1));
      wrSeries[i] = hh === ll ? 0 : ((hh - closes[i]) / (hh - ll)) * -100;
    }

    // DMI / ADX (14) — needs +DM/-DM/TR, smoothed via Wilder.
    const pdiSeries: (number | null)[] = new Array(n).fill(null);
    const mdiSeries: (number | null)[] = new Array(n).fill(null);
    const adxSeries: (number | null)[] = new Array(n).fill(null);
    const adxrSeries: (number | null)[] = new Array(n).fill(null);
    if (n >= 15) {
      const tr: number[] = new Array(n).fill(0);
      const plusDM: number[] = new Array(n).fill(0);
      const minusDM: number[] = new Array(n).fill(0);
      for (let i = 1; i < n; i++) {
        const up = highs[i] - highs[i - 1];
        const dn = lows[i - 1] - lows[i];
        plusDM[i] = up > dn && up > 0 ? up : 0;
        minusDM[i] = dn > up && dn > 0 ? dn : 0;
        tr[i] = Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1]),
        );
      }
      // Wilder smoothing over 14 periods
      const period = 14;
      const smooth = (arr: number[]) => {
        const out: (number | null)[] = new Array(n).fill(null);
        let acc = 0;
        for (let i = 1; i <= period && i < n; i++) acc += arr[i];
        if (period < n) out[period] = acc;
        for (let i = period + 1; i < n; i++) {
          acc = acc - acc / period + arr[i];
          out[i] = acc;
        }
        return out;
      };
      const trS = smooth(tr);
      const pdmS = smooth(plusDM);
      const mdmS = smooth(minusDM);
      for (let i = period; i < n; i++) {
        const t = trS[i] as number;
        if (t === 0) continue;
        const pdi = (pdmS[i] as number) / t * 100;
        const mdi = (mdmS[i] as number) / t * 100;
        pdiSeries[i] = pdi;
        mdiSeries[i] = mdi;
      }
      // ADX: avg of last 14 DX values, with Wilder smoothing
      const dxArr: (number | null)[] = new Array(n).fill(null);
      for (let i = period; i < n; i++) {
        const p = pdiSeries[i] as number;
        const m = mdiSeries[i] as number;
        dxArr[i] = p + m === 0 ? 0 : (Math.abs(p - m) / (p + m)) * 100;
      }
      // First ADX at i = 2*period = 28
      let adxAcc = 0;
      for (let i = period; i < 2 * period && i < n; i++) adxAcc += (dxArr[i] as number);
      if (2 * period <= n - 1) {
        adxSeries[2 * period] = adxAcc / period;
        for (let i = 2 * period + 1; i < n; i++) {
          adxSeries[i] = ((adxSeries[i - 1] as number) * (period - 1) + (dxArr[i] as number)) / period;
        }
      }
      // ADXR = (ADX[i] + ADX[i-period]) / 2
      for (let i = 2 * period; i < n; i++) {
        const prev = adxSeries[i - period];
        if (prev !== null) adxrSeries[i] = ((adxSeries[i] as number) + prev) / 2;
      }
    }

    // VR(24) — Volume Ratio. Needs volume per kline.
    const vrSeries: (number | null)[] = new Array(n).fill(null);
    for (let i = 23; i < n; i++) {
      const slice = state.klines.slice(i - 23, i + 1);
      let upVol = 0, dnVol = 0, eqVol = 0;
      for (const k of slice) {
        if (k.close > k.open) upVol += k.volume;
        else if (k.close < k.open) dnVol += k.volume;
        else eqVol += k.volume;
      }
      const denom = (dnVol + eqVol / 2);
      vrSeries[i] = denom === 0 ? null : ((upVol + eqVol / 2) / denom) * 100;
    }

    // Latest snapshot (scalar)
    const last = (s: (number | null)[]) => s[n - 1] ?? 0;
    const lastBar = last(barSeries);
    const indicators: Indicators = {
      ma5: last(ma5Series),
      ma10: last(ma10Series),
      ma20: last(ma20Series),
      macd: { diff: last(diffSeries), dea: last(deaSeries), bar: lastBar },
      rsi: last(rsiSeries),
      boll: { upper: last(bollUpper), middle: last(bollMid), lower: last(bollLower) },
      kdj: { k: last(kdjK), d: last(kdjD), j: last(kdjJ) },
      wr: last(wrSeries),
      dmi: { pdi: last(pdiSeries), mdi: last(mdiSeries), adx: last(adxSeries), adxr: last(adxrSeries) },
      vr: last(vrSeries),
    };

    const indicatorSeries: IndicatorSeries = {
      ma5: ma5Series,
      ma10: ma10Series,
      ma20: ma20Series,
      macd: { diff: diffSeries, dea: deaSeries, bar: barSeries },
      rsi: rsiSeries,
      boll: { upper: bollUpper, middle: bollMid, lower: bollLower },
      kdj: { k: kdjK, d: kdjD, j: kdjJ },
      wr: wrSeries,
      dmi: { pdi: pdiSeries, mdi: mdiSeries, adx: adxSeries, adxr: adxrSeries },
      vr: vrSeries,
    };

    set({ indicators, indicatorSeries });
  },

  refreshOrderBook: () => {
    const state = get();
    const p = state.currentQuote.price;
    const round = (v: number) => Math.round(v * 100) / 100;
    const bids = Array.from({ length: 5 }, (_, i) => ({
      price: round(p - 0.01 * (i + 1)),
      quantity: 50 + Math.floor(Math.random() * 450),
      orders: 5 + Math.floor(Math.random() * 20),
    }));
    const asks = Array.from({ length: 5 }, (_, i) => ({
      price: round(p + 0.01 * (i + 1)),
      quantity: 50 + Math.floor(Math.random() * 450),
      orders: 5 + Math.floor(Math.random() * 20),
    }));
    set({ orderBook: { bids, asks } });
  },

  pushRandomNews: () => {
    const state = get();
    const pool = state.newsPool;
    if (!pool.length) return;

    // If a REAL insider tip is still active, bias this news to match its locked
    // direction so the tip proves accurate, then consume the tip.
    const tip = state.pendingInsiderTip;
    const tipActive = !!tip && state.currentTick <= tip.expiresTick;
    let item: typeof pool[number];
    if (tip && tipActive) {
      const wanted = tip.direction === 'up' ? 'bullish' : 'bearish';
      const matches = pool.filter((p) => p.sentiment === wanted);
      item = matches.length
        ? matches[Math.floor(Math.random() * matches.length)]
        : pool[Math.floor(Math.random() * pool.length)];
    } else {
      item = pool[Math.floor(Math.random() * pool.length)];
    }

    let priceMultiplier = 1;
    if (item.sentiment === 'bullish') priceMultiplier = 1 + 0.001 + Math.random() * 0.004;
    else if (item.sentiment === 'bearish') priceMultiplier = 0.995 + Math.random() * 0.004;

    const newPrice = Math.max(1, state.currentQuote.price * priceMultiplier);
    const newChange = newPrice - state.currentQuote.prevClose;
    const newChangePct = (newChange / state.currentQuote.prevClose) * 100;

    const newsItem: NewsItem = {
      id: `news_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: item.sentiment === 'bullish' ? 'verified' : item.sentiment === 'bearish' ? 'warning' : 'unverified',
      title: item.title,
      source: item.source,
      tick: state.currentTick,
      time: '刚刚',
      timestamp: Date.now(),
      content: item.content,
      tags: [item.sentiment.toUpperCase()],
    };

    set({
      news: [newsItem, ...state.news].slice(0, 30),
      currentQuote: { ...state.currentQuote, price: newPrice, change: newChange, changePercent: newChangePct, timestamp: Date.now() },
      stockPrices: { ...state.stockPrices, [state.currentQuote.symbol]: newPrice },
      // Consume the insider tip once it has driven a news event.
      pendingInsiderTip: tipActive ? null : state.pendingInsiderTip,
    });

    if (item.sentiment !== 'neutral') {
      get().showToast(`📰 ${item.title}`, item.sentiment === 'bullish' ? 'success' : 'warning');
    }
  },

  maybeTriggerBlackSwan: () => {
    const state = get();
    if (state.gameStatus !== 'playing') return;
    if (Math.random() > 0.10) return; // 10% per minute = ~ daily chance

    const events = [
      { label: '央行加息', range: [0.85, 0.92] },
      { label: '监管突查', range: [0.88, 0.95] },
      { label: '重大利好', range: [1.08, 1.15] },
      { label: '行业丑闻', range: [0.90, 0.95] },
    ];
    const ev = events[Math.floor(Math.random() * events.length)];
    const mult = ev.range[0] + Math.random() * (ev.range[1] - ev.range[0]);
    const oldPrice = state.currentQuote.price;
    const newPrice = Math.max(1, oldPrice * mult);
    const newChange = newPrice - state.currentQuote.prevClose;
    const newChangePct = (newChange / state.currentQuote.prevClose) * 100;

    const newsItem: NewsItem = {
      id: `bs_news_${Date.now()}`,
      type: ev.range[0] < 1 ? 'warning' : 'verified',
      title: `⚠️ 黑天鹅事件: ${ev.label}`,
      source: 'Breaking News',
      tick: state.currentTick,
      time: '刚刚',
      timestamp: Date.now(),
      content: `${ev.label} - 市场剧烈波动，价格变动 ${((mult - 1) * 100).toFixed(1)}%`,
      tags: ['BLACKSWAN'],
    };

    set({
      currentQuote: { ...state.currentQuote, price: newPrice, change: newChange, changePercent: newChangePct, timestamp: Date.now() },
      stockPrices: { ...state.stockPrices, [state.currentQuote.symbol]: newPrice },
      news: [newsItem, ...state.news].slice(0, 30),
    });

    get().addAlert({
      id: `bs_auto_${Date.now()}`,
      severity: 'high',
      title: `⚠️ Black Swan: ${ev.label}`,
      description: `市场剧变 ${((mult - 1) * 100).toFixed(1)}%，触发自动监控`,
      timestamp: Date.now(),
      source: 'Black Swan Auto-Detection',
    });

    get().showToast(`⚠️ 黑天鹅事件: ${ev.label} - 价格变动 ${((mult - 1) * 100).toFixed(1)}%`, 'danger');
  },

  // ============================================================
  // Backend adapter implementation
  // ============================================================
  // 思路：
  //   1. connectBackend() 探测 REST /health，能通就 guest 登录拿 token，连 WS。
  //      连上 = backendMode = true；后续行情/下单都走 wsService。
  //   2. UI 调 store action 时（placeOrder/executeDealerAction），action 内
  //      if (state.backendMode) → 走 wsService.sendXxx() + 监听 trade:result。
  //      否则保持原本地模拟代码不动。
  //   3. server 通过 WS 推回的 market:tick / market:news / market:special /
  //      trade:result / dealer:result / match:end 等事件，都映射到
  //      _applyServerXxx() 方法直接改 store。
  //   4. 联调失败 / 后端挂了 → disconnectBackend() 即可降级回本地。
  // ============================================================

  connectBackend: async () => {
    if (get().backendMode && get().authToken) return true;
    if (connectBackendInFlight) return connectBackendInFlight;

    connectBackendInFlight = (async (): Promise<boolean> => {
      const { apiAuth, pingBackend, apiMarket } = apiService;

      const ok = await pingBackend();
      if (!ok) {
        console.warn('[connectBackend] pingBackend failed');
        get().showToast('后端未启用 — 使用本地模拟', 'info');
        return false;
      }
      const auth = await apiAuth.guest(get().userId);
      if (auth.code !== 0 || !auth.data) {
        console.warn('[connectBackend] guest auth failed', auth);
        get().showToast(`后端鉴权失败: ${auth.message}`, 'warning');
        return false;
      }
      const token = auth.data.token;
      const canonicalUserId = auth.data.user?.id ?? get().userId;
      // REST 已通就算 backendMode=true；WS 失败不应再降级成 local simulation
      set({ authToken: token, backendMode: true, wsStatus: 'connecting', userId: canonicalUserId });
      console.log('[connectBackend] guest userId=', canonicalUserId);

      const sock = wsSvc.connect();

      wsSvc.on('market:tick', (payload) => get()._applyServerTick(payload));
      wsSvc.on('market:news', (news) => get()._applyServerNews(news));
      wsSvc.on('market:special', (payload) => get()._applyServerBlackSwan(payload));
      wsSvc.on('market:update', (payload) => get()._applyServerMarketUpdate(payload));
      wsSvc.on('trade:result', (payload) => get()._applyTradeResult(payload));
      wsSvc.on('dealer:result', (payload) => get()._applyDealerResult(payload));
      wsSvc.on('regulator:result', (payload) => get()._applyRegulatorResult(payload));
      wsSvc.on('regulator:freeze', (payload) => get()._applyRegulatorFreeze(payload));
      wsSvc.on('regulator:warn', (payload) => get()._applyRegulatorFreeze({ ...payload, restrictionType: 'warn' }));
      wsSvc.on('regulator:kick', (payload) => get()._applyRegulatorKick(payload));
      wsSvc.on('match:tick', (payload) => get()._applyMatchTick(payload));
      wsSvc.on('match:snapshot', (snap) => get()._applyServerSnapshot(snap));
      wsSvc.on('match:end', (payload) => get()._applyMatchEnd(payload));
      wsSvc.on('match:disconnect-warning', (p) => get()._handleDisconnectWarning(p));
      wsSvc.on('match:peer-disconnect', () => {
        get().showToast('对手断线，等待重连…', 'warning');
      });
      wsSvc.on('match:forfeit', (p) => get()._handleMatchForfeit(p));
      wsSvc.on('match:destroyed', (p) => get()._handleMatchDestroyed(p));
      wsSvc.on('match:timeout', (p) => { get()._handleMatchTimeout(p); });
      wsSvc.on('room:update', (p) => get()._handleRoomUpdate(p));
      wsSvc.on('room:ready', (p) => {
        set((s) => ({
          gameStatus: 'waiting',
          waitingRoom: s.waitingRoom
            ? { ...s.waitingRoom, currentPlayers: p.currentPlayers, requiredPlayers: p.requiredPlayers }
            : {
                code: p.code ?? null,
                currentPlayers: p.currentPlayers,
                requiredPlayers: p.requiredPlayers,
                countdown: null,
                mode: p.mode ?? 'room',
              },
        }));
      });
      wsSvc.on('room:countdown', (p) => get()._handleRoomCountdown(p));
      wsSvc.on('match:start', (p) => { void get()._handleMatchStart(p); });
      wsSvc.on('room:closed', (p) => {
        get().showToast(p?.message ?? '房间已关闭', 'warning');
        get()._resetMatchToIdle();
      });
      wsSvc.on('match:downgrade', (p) => {
        get().showToast(p?.message ?? '对局已降级为双人对战', 'info');
      });

      wsSvc.onWsStatus((s) => {
        set({ wsStatus: s });
        const st = get();
        if (s === 'disconnected' && st.matchId && st.gameStatus === 'playing') {
          get().showModal('disconnect', '连接中断，30秒内重连将保留对局', '连接中断');
          get().showToast('连接中断，30秒内重连将保留对局', 'warning');
        }
        if (s === 'connected' && st.matchId && st.backendMode) {
          void get()._attemptReconnectMatch();
        }
      });

      const onConnect = async () => {
        try {
          const ack = await wsSvc.auth(token);
          if (ack?.ok) {
            get().showToast('后端已连接', 'success');
            const mid = get().matchId;
            if (mid) await get()._attemptReconnectMatch();
          } else {
            get().showToast('WS 鉴权失败', 'warning');
          }
        } catch (err) {
          console.error('[connectBackend] auth error', err);
          get().showToast(`WS 鉴权异常: ${(err as Error).message}`, 'danger');
        }
      };
      sock.on('connect', onConnect);
      if (sock.connected) onConnect();

      apiMarket.stocks().then((r) => {
        if (r.code === 0 && Array.isArray(r.data)) {
          set({ allStocks: r.data as any });
        }
      });

      return true;
    })().finally(() => {
      connectBackendInFlight = null;
    });

    return connectBackendInFlight;
  },

  disconnectBackend: () => {
    wsSvc.disconnect();
    connectBackendInFlight = null;
    set({ backendMode: false, wsStatus: 'idle', authToken: null, matchId: null });
  },

  /**
   * 把 server market:tick payload 同步到本地 store：
   *  - quote → currentQuote + stockPrices（多 symbol mark-to-market）
   *  - orderBook
   *  - timeline → 每个 market:tick 更新末点（与 headline 价格同步）；
   *    游戏 tick（processTick）再追加新点 → 1 天 120 点 @ 3s。
   *  帧率敏感（200ms 一次），所以只做最少 set()。
   */
  _applyServerTick: (payload) => {
    const state = get();
    // 兼容两种 payload：
    //   1) { symbol, quote, orderBook }                 （旧）
    //   2) { quotes: { [sym]: Quote }, orderBooks }  （新，全量）
    const quotesBySymbol: Record<string, any> | undefined = payload?.quotes
      ? payload.quotes
      : payload?.quote && payload?.symbol
        ? { [payload.symbol]: payload.quote }
        : undefined;
    if (!quotesBySymbol) return;

    const orderBooksBySymbol: Record<string, any> | undefined = payload?.orderBooks
      ? payload.orderBooks
      : payload?.orderBook && payload?.symbol
        ? { [payload.symbol]: payload.orderBook }
        : undefined;

    const activeSymbol = state.currentQuote.symbol;
    const now = Date.now();

    const lastPortfolioRefresh = state.simulation._lastPortfolioRefresh ?? 0;
    if (usesBackendGameState(state) && state.gameStatus === 'playing' && now - lastPortfolioRefresh > 12_000) {
      void get().refreshPortfolioFromServer();
    }

    // 1. stockPrices（多 symbol mark-to-market 用 + 为 charts 提供实时序列）
    const stockPrices: Record<string, number> = { ...state.stockPrices };
    let updatedAny = false;
    for (const [sym, q] of Object.entries(quotesBySymbol)) {
      const px = Number.isFinite((q as any)?.price) ? (q as any).price : null;
      if (px === null || px <= 0) continue;
      stockPrices[sym] = px;
      updatedAny = true;
    }
    if (!updatedAny) return;

    // 2. currentQuote — 用 activeSymbol 对应的 quote 更新顶部字段
    const activeQuote = quotesBySymbol[activeSymbol];
    const activePx = stockPrices[activeSymbol];
    const currentQuote =
      activeQuote && Number.isFinite((activeQuote as any)?.price) && activePx
        ? {
            ...state.currentQuote,
            symbol: activeSymbol,
            price: activePx,
            change: Number.isFinite((activeQuote as any).change)
              ? (activeQuote as any).change
              : activePx - state.currentQuote.prevClose,
            changePercent: Number.isFinite((activeQuote as any).changePercent)
              ? (activeQuote as any).changePercent
              : state.currentQuote.changePercent,
            volume: Number.isFinite((activeQuote as any).volume)
              ? (activeQuote as any).volume
              : state.currentQuote.volume,
            high: Number.isFinite((activeQuote as any).high)
              ? (activeQuote as any).high
              : state.currentQuote.high,
            low: Number.isFinite((activeQuote as any).low)
              ? (activeQuote as any).low
              : state.currentQuote.low,
            open: Number.isFinite((activeQuote as any).open)
              ? (activeQuote as any).open
              : state.currentQuote.open,
            prevClose: Number.isFinite((activeQuote as any).prevClose)
              ? (activeQuote as any).prevClose
              : state.currentQuote.prevClose,
            timestamp: now,
          }
        : state.currentQuote;

    // 3. timeline — 每个行情 tick 把末点拉到最新价（线尾与报价同步）
    let timelineBySymbol = state.timelineBySymbol;
    let timelineData = state.timelineData;
    const nextTimelineBySymbol: Record<string, number[]> = { ...state.timelineBySymbol };
    for (const sym of Object.keys(quotesBySymbol)) {
      const px = stockPrices[sym];
      if (!Number.isFinite(px) || px <= 0) continue;
      const curTl = nextTimelineBySymbol[sym] ?? [];
      nextTimelineBySymbol[sym] = patchTimelineLastPoint(curTl, px);
    }
    timelineBySymbol = nextTimelineBySymbol;
    timelineData = nextTimelineBySymbol[activeSymbol] ?? state.timelineData;

    // 4. mark-to-market (持仓现值) — 用更新后的 stockPrices 重算 totalAssets
    //    Holding 接口用的是 shares，不是 quantity；以前误用 h.quantity 让 positionValue 变 NaN → totalAssets = NaN。
    let positionValue = 0;
    for (const h of state.holdings) {
      const shares = Number.isFinite(h.shares) ? h.shares : 0;
      if (shares <= 0) continue;
      const px = stockPrices[h.symbol] ?? h.marketPrice ?? h.avgPrice ?? 0;
      const safePx = Number.isFinite(px) && px > 0 ? px : 0;
      positionValue += safePx * shares;
    }
    const safeCash = Number.isFinite(state.cash) ? state.cash : 0;
    const safeBorrowed = Number.isFinite(state.borrowed) ? state.borrowed : 0;
    const totalAssets = Math.max(0, safeCash + positionValue - safeBorrowed);

    // 5. 写入价格 / 盘口 / 总资产 / timeline
    const activeOrderBook = orderBooksBySymbol ? orderBooksBySymbol[activeSymbol] : undefined;
    set({
      stockPrices,
      currentQuote,
      orderBook: activeOrderBook ?? state.orderBook,
      totalAssets,
      portfolioTotal: totalAssets,
      ...cashSyncPatch(state, state.cash),
      timelineData,
      timelineBySymbol,
    });

    // 7. indicators 节流重算（~25 个 server tick 一次 ≈ 5s）
    const nextCount = (get().simulation._serverTickCount ?? 0) + 1;
    set((s) => ({ simulation: { ...s.simulation, _serverTickCount: nextCount } }));
    if (nextCount % 25 === 0) {
      get().recalculateIndicators();
    }
  },

  /**
   * 加入对局前清掉属于上一局的衍生数据。
   *
   * 重要：这里**不清 cash / playerCash / borrowed / totalAssets / portfolioTotal**。
   *   如果 snapshot 到达前 _applyServerSnapshot 没把 cash 写回来（断网 / 后端 bug），
   *   前端仍能显示上一个值或初始值 100_000_000，不会闪 0 再变真值。
   *   snapshot 到了之后 _syncPortfolioFromServer 会用 backend 真值覆盖。
   *
   * 只清掉会污染新对局的数据：
   *   - holdings / orderHistory / stockDailyTraded 属于上一局
   *   - todayPnl / todayPnlPercent / unrealizedPnl 是上一局的盈亏
   *   - dealerResources 的 riskIndex / energy 归零（新对局风险重新累计）
   *
   * 调用点：
   *   - _joinBackendMatch() — backend 模式加入对局前
   */
  _resetCashForMatchEntry: () => {
    const state = get();
    // 注意：cash / playerCash / borrowed / totalAssets / portfolioTotal / todayPnl
    //   都不在这里 reset。如果 snapshot 到达前 _applyServerSnapshot 没把 cash 写回来
    //   （网络断开/后端 bug），前端仍能显示上一个值 / 初始值，不会变 0 误导用户。
    //   snapshot 到了之后 _syncPortfolioFromServer 会用 backend 真值覆盖。
    //
    // 这里只清掉会污染新对局的数据：
    //   - holdings / orderHistory / stockDailyTraded 属于上一局
    //   - todayPnl / todayPnlPercent / unrealizedPnl 是上一局的盈亏
    set({
      todayPnl: 0,
      todayPnlPercent: 0,
      unrealizedPnl: 0,
      holdings: [],
      orderHistory: [],
      stockDailyTraded: {},
      ...cashSyncPatch(state, state.cash, { riskIndex: 0 }),
    });
  },

  _syncPortfolioFromServer: (portfolio, dealerResources) => {
    if (!portfolio || typeof portfolio.cash !== 'number') return;
    const state = get();
    const cash = portfolio.cash;
    const borrowed = portfolio.borrowed ?? state.borrowed;
    const holdings = portfolio.holdings ?? state.holdings;
    const totalAssets = portfolio.totalAssets ?? Math.max(0, cash + holdings.reduce((sum, h) => {
      const px = h.marketPrice ?? h.avgPrice ?? 0;
      return sum + h.shares * px;
    }, 0) - borrowed);
    const dr = dealerResources ?? state.dealerResources;
    const riskIndex = dealerResources?.riskIndex ?? dr?.riskIndex ?? 0;
    set({
      ...cashSyncPatch(state, cash, { riskIndex }),
      borrowed,
      holdings,
      totalAssets,
      portfolioTotal: totalAssets,
      unrealizedPnl: portfolio.unrealizedPnl ?? state.unrealizedPnl,
      todayPnl: portfolio.todayPnl ?? state.todayPnl,
      todayPnlPercent: portfolio.todayPnlPercent ?? state.todayPnlPercent,
      leverage: portfolio.leverage ?? state.leverage,
    });
  },

  refreshPortfolioFromServer: async () => {
    const state = get();
    if (!usesBackendGameState(state) || !state.matchId) return false;

    const apply = (
      portfolio: { cash?: number } | null | undefined,
      dealerResources?: { riskIndex?: number } | null,
    ) => {
      if (!portfolio || typeof portfolio.cash !== 'number') return false;
      get()._syncPortfolioFromServer(portfolio as any, dealerResources ?? null);
      set((s) => ({
        simulation: { ...s.simulation, _lastPortfolioRefresh: Date.now() },
      }));
      return true;
    };

    // 优先 WS：与 dealer:action / trade:buy 共用 socket session.userId，避免 REST userId 错位
    try {
      const ws = await import('../services/wsService');
      await ws.waitForAuth(8000);
      const ack = await ws.syncPortfolio(state.matchId);
      if (ack?.code === 0 && ack.data?.portfolio) {
        return apply(ack.data.portfolio, ack.data.dealerResources);
      }
      console.warn('[portfolio] WS sync rejected', ack?.message);
    } catch (err) {
      console.warn('[portfolio] WS sync failed', err);
    }

    // REST 兜底
    try {
      const res = await apiService.apiTrade.portfolio(state.matchId, state.userId);
      if (res.code !== 0 || !res.data || typeof res.data.cash !== 'number') {
        console.warn('[portfolio] REST sync failed', res.message);
        return false;
      }
      let dealerResources: { cash?: number; energy?: number; riskIndex?: number } | null = null;
      if (state.role === 'dealer') {
        const drRes = await apiService.apiDealer.resources(state.matchId, state.userId);
        if (drRes.code === 0 && drRes.data) {
          dealerResources = drRes.data;
        }
      }
      return apply(res.data, dealerResources);
    } catch (err) {
      console.warn('[portfolio] REST sync error', err);
      return false;
    }
  },

  _applyServerSnapshot: (snap) => {
    if (!snap) return;
    const state = get();
    const isOffline = state.matchFlow === 'offline';
    console.log('[snapshot] arrived; pre-state.gameStatus =', state.gameStatus, 'snap.role=', snap.role, 'matchFlow=', state.matchFlow);
    const role = (snap.role ?? state.role) as Role;
    const symbol = snap.symbol ?? state.currentQuote.symbol;
    const quote = snap.quote ?? state.currentQuote;
    const klines = Array.isArray(snap.klines) ? snap.klines : state.klines;
    const orderBook = snap.orderBook ?? state.orderBook;
    // merge 防止后端没返回 kdj/wr/dmi/vr 时把本地默认值洗掉
    const indicators = snap.indicators ? { ...state.indicators, ...snap.indicators } : state.indicators;
    const stockPrices = { ...state.stockPrices, [symbol]: quote.price };

    set({
      role,
      matchId: snap.matchId ?? state.matchId,
      currentQuote: { ...state.currentQuote, ...quote, symbol },
      klines,
      klinesBySymbol: { ...state.klinesBySymbol, [symbol]: klines },
      // 把 snapshot 推过来的 timeline 也存到按 symbol 分桶里
      timelineBySymbol: snap.timeline
        ? { ...state.timelineBySymbol, [symbol]: (snap.timeline as any[]).map((p: any) => p.price ?? p).filter((x: any) => typeof x === 'number') }
        : state.timelineBySymbol,
      orderBook,
      indicators,
      stockPrices,
      userName: state.userName || `Player_${state.userId.slice(-4)}`,
      matchOpponentName: state.matchOpponentName || 'Opponent',
      ...(typeof snap.currentDay === 'number' ? { currentDay: snap.currentDay } : {}),
      ...(typeof snap.currentTick === 'number' ? { currentTick: snap.currentTick } : {}),
    });

    if (snap.portfolio) {
      get()._syncPortfolioFromServer(snap.portfolio, snap.dealerResources ?? null);
    } else if (!isOffline && usesBackendGameState(get()) && typeof snap.dealerResources?.cash === 'number') {
      const cash = snap.dealerResources.cash;
      set(cashSyncPatch(get(), cash, { riskIndex: snap.dealerResources.riskIndex }));
    } else if (!isOffline && usesBackendGameState(get()) && (snap.matchId ?? state.matchId)) {
      void get().refreshPortfolioFromServer();
    }

    if (isOffline) {
      console.log('[snapshot] offline flow → playing directly');
      get().enterPlaying();
      get().showToast(`单人练习已开始 · 身份：${role}`, 'success');
      return;
    }

    // 生成 reversal cards（如果还没有），并把 server 分配的角色作为用户身份
    const existing = get().reversalCards;
    const myRole = get().role;
    const needCards = existing.length === 0 || !existing.some(c => c.revealed);
    if (needCards) {
      const all: Role[] = ['dealer', 'retail', 'regulator'];
      // 关键：seed 3 张"全部隐藏"的卡，让用户主动翻牌。server 分配的角色记在 role，
      //      但不在 reversalCards 上预 reveal，避免用户困惑"为什么我的卡已经翻了"。
      const ordered: Role[] = [myRole, ...all.filter(r => r !== myRole)];
      set({
        reversalCards: ordered.map(r => ({ role: r, revealed: false })),
      });
      console.log('[snapshot] seeded 3 hidden reversalCards; myRole=', myRole);
    }
    // matching → reversed 由 MatchOverlay 的 useEffect 推进；不在 snapshot 里抢
    console.log('[snapshot] post-state.gameStatus =', get().gameStatus);
    get().showToast(`已加入对局 ${snap.matchId ?? ''}，身份：${role}`, 'success');
  },

  _applyServerNews: (news) => {
    if (!news) return;
    get().addNews({
      id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: (news.type as any) ?? 'unverified',
      title: news.title ?? news.content ?? '市场快讯',
      source: news.source ?? 'Breaking',
      tick: get().currentTick,
      time: '刚刚',
      timestamp: Date.now(),
      content: news.content,
    });
  },

  _applyServerBlackSwan: (payload) => {
    if (!payload) return;
    const state = get();
    const { symbol, newPrice, label, multiplier } = payload;
    // 直接调本地 triggerBlackSwan 的逻辑，但 server 已经定好价格
    // 这里我们做最小实现：直接改 quote 然后发 toast
    set({
      currentQuote: { ...state.currentQuote, price: newPrice },
      stockPrices: { ...state.stockPrices, [symbol]: newPrice },
    });
    get().addAlert({
      id: `bs_srv_${Date.now()}`,
      severity: 'high',
      title: `⚠️ Black Swan: ${label}`,
      description: `市场剧变 ${((multiplier - 1) * 100).toFixed(1)}%（服务端触发）`,
      timestamp: Date.now(),
      source: 'Server',
    });
    get().showToast(`⚠️ 黑天鹅: ${label}`, 'danger');
  },

  _applyServerMarketUpdate: (payload) => {
    if (!payload) return;
    const state = get();
    const sym = payload.symbol;
    if (payload.quote) {
      const tl = Array.isArray(payload.timeline) ? payload.timeline.map((p: any) => p.price ?? p).filter((x: any) => typeof x === 'number') : null;
      const isMain = sym === state.currentQuote.symbol;
      const partial: any = {
        currentQuote: { ...state.currentQuote, ...payload.quote, symbol: sym },
        stockPrices: { ...state.stockPrices, [sym]: payload.quote.price },
        orderBook: payload.orderBook ?? state.orderBook,
        indicators: payload.indicators ? { ...state.indicators, ...payload.indicators } : state.indicators,
      };
      if (Array.isArray(payload.klines)) {
        partial.klinesBySymbol = { ...state.klinesBySymbol, [sym]: payload.klines };
        if (isMain) partial.klines = payload.klines;
      }
      if (tl) {
        partial.timelineBySymbol = { ...state.timelineBySymbol, [sym]: tl };
        if (isMain) partial.timelineData = tl;
      }
      set(partial);
    }
  },

  /**
   * trade:result 服务端回执 — 把成交回填到本地 holdings / cash / orderHistory。
   * 这是关键：placeOrder 不再直接改 holdings，而是发出去等这里回填。
   */
  _applyTradeResult: (payload) => {
    if (pendingTradeResult) {
      pendingTradeResult(payload);
      pendingTradeResult = null;
    }
    if (!payload) return;
    if (payload.code !== 0) {
      get().showToast(`交易失败: ${payload.message ?? '未知错误'}`, 'warning');
      if (payload.data?.portfolio) {
        get()._syncPortfolioFromServer(payload.data.portfolio);
      } else {
        void get().refreshPortfolioFromServer();
      }
      return;
    }
    const { side, data } = payload;
    if (!data?.portfolio) {
      get().showToast(`${side === 'buy' ? '买入' : '卖出'} 成功`, 'success');
      return;
    }
    const state = get();
    get()._syncPortfolioFromServer(data.portfolio);
    const lastOrder: OrderRecord = {
      id: data.orderId ?? `srv_${Date.now()}`,
      symbol: state.currentQuote.symbol,
      type: 'market',
      side: side,
      price: state.currentQuote.price,
      quantity: data.quantity ?? 0,
      status: 'filled',
      timestamp: Date.now(),
    };
    set({
      orderHistory: [lastOrder, ...get().orderHistory].slice(0, 100),
      totalTradeCount: get().totalTradeCount + 1,
    });
    get().showToast(`${side === 'buy' ? '买入' : '卖出'} 成功`, 'success');
  },

  _applyDealerResult: (payload) => {
    if (!payload) return;
    if (payload.code !== 0) {
      console.warn('[Dealer] 后端返回错误', payload);
      if (payload.data?.portfolio) {
        get()._syncPortfolioFromServer(payload.data.portfolio, payload.data.resources ?? null);
      } else {
        void get().refreshPortfolioFromServer();
      }
      get().showToast(`庄家操作失败: ${payload.message ?? ''}`, 'warning');
      return;
    }
    const { data } = payload;
    console.log('[Dealer] _applyDealerResult', data);
    if (data?.portfolio) {
      get()._syncPortfolioFromServer(data.portfolio, data.resources ?? null);
    } else if (data?.resources && typeof data.resources.cash === 'number') {
      const state = get();
      const cash = data.resources.cash;
      const holdings = state.holdings;
      const totalAssets = Math.max(0, cash + holdings.reduce((sum, h) => {
        const px = state.stockPrices[h.symbol] ?? h.marketPrice ?? h.avgPrice ?? 0;
        return sum + h.shares * px;
      }, 0) - state.borrowed);
      set({
        ...cashSyncPatch(state, cash, { riskIndex: data.resources.riskIndex ?? state.dealerResources?.riskIndex }),
        totalAssets,
        portfolioTotal: totalAssets,
      });
    }
    if (data?.resources) {
      const state = get();
      const delta = (data.resources.riskIndex ?? 0) - (state.dealerResources?.riskIndex ?? 0);
      if (delta > 0) get().adjustScores({ manipulation: delta });
    }
    // 服务端 effect 字段兼容 pump/press (newPrice)、accumulate/distribute (price)、wash/spoof
    // 关键：这里直接改 store，不再走 _applyServerTick —
    //   1. _applyServerTick 会用 payload.orderBook 覆盖 store.orderBook，而庄家结果没带盘口
    //      → 旧逻辑会把盘口写成 null，导致 UI 显示空白。
    //   2. _applyServerTick 用 2.5s 节流，pump 后第一次价格变化可能被丢掉 → K 线变平。
    //   3. _applyServerTick 还会重算 totalAssets（触发 Bug 1 那条路径），用朴素 set 更直接。
    const newPriceRaw = data?.effect?.newPrice ?? data?.effect?.price;
    if (typeof newPriceRaw === 'number' && Number.isFinite(newPriceRaw) && newPriceRaw > 0) {
      const state = get();
      const sym = data?.symbol ?? state.currentQuote.symbol;
      const newPrice = newPriceRaw;
      console.log('[Dealer] effect price push', sym, newPrice);

      const curTl = state.timelineBySymbol[sym] ?? [];
      const tlNext = patchTimelineLastPoint(curTl, newPrice);
      const isMain = sym === state.currentQuote.symbol;
      const nextQuote = isMain
        ? {
            ...state.currentQuote,
            price: newPrice,
            change: newPrice - state.currentQuote.prevClose,
            changePercent: state.currentQuote.prevClose > 0
              ? ((newPrice - state.currentQuote.prevClose) / state.currentQuote.prevClose) * 100
              : state.currentQuote.changePercent,
            high: Math.max(state.currentQuote.high, newPrice),
            low: Math.min(state.currentQuote.low, newPrice),
            timestamp: Date.now(),
          }
        : state.currentQuote;

      // mark-to-market 持仓
      const stockPrices: Record<string, number> = { ...state.stockPrices, [sym]: newPrice };
      let positionValue = 0;
      for (const h of state.holdings) {
        const shares = Number.isFinite(h.shares) ? h.shares : 0;
        if (shares <= 0) continue;
        const px = h.symbol === sym
          ? newPrice
          : (stockPrices[h.symbol] ?? state.currentQuote.price ?? h.marketPrice ?? h.avgPrice ?? 0);
        const safePx = Number.isFinite(px) && px > 0 ? px : 0;
        positionValue += safePx * shares;
      }
      const safeCash = Number.isFinite(state.cash) ? state.cash : 0;
      const safeBorrowed = Number.isFinite(state.borrowed) ? state.borrowed : 0;
      const totalAssets = Math.max(0, safeCash + positionValue - safeBorrowed);

      set({
        currentQuote: nextQuote,
        stockPrices,
        timelineBySymbol: { ...state.timelineBySymbol, [sym]: tlNext },
        timelineData: isMain ? tlNext : state.timelineData,
        totalAssets,
        portfolioTotal: totalAssets,
        // 注意：保留 orderBook / indicators / 高低轨，不在这里动它们。
        holdings: state.holdings.map((h) => h.symbol === sym
          ? {
              ...h,
              marketPrice: newPrice,
              pnl: (newPrice - h.avgPrice) * (Number.isFinite(h.shares) ? h.shares : 0),
              pnlPercent: h.avgPrice > 0 ? ((newPrice - h.avgPrice) / h.avgPrice) * 100 : 0,
            }
          : h),
      });
    }
    // wash: 把成交量刷到 quote.volume
    const volFactor = data?.effect?.volumeFactor;
    if (typeof volFactor === 'number' && data?.symbol) {
      const state = get();
      const sym = data.symbol;
      const cur = state.currentQuote;
      if (cur.symbol === sym) {
        const newVol = Math.round(cur.volume * volFactor);
        set({
          currentQuote: { ...cur, volume: newVol },
          stockPrices: { ...state.stockPrices, [sym]: cur.price },
        });
      }
    }
    get().showToast(`庄家操作成功`, 'success');
  },

  _applyRegulatorFreeze: (payload) => {
    if (!payload?.symbol) return;
    const state = get();
    const { symbol, maxSingle, maxDaily, expiresTick, durationTicks, freezeTicks, restrictionType } = payload;
    const type = restrictionType ?? 'freeze';
    const ticks = durationTicks ?? freezeTicks ?? (type === 'warn' ? WARN_TICKS : FREEZE_TICKS);
    set((s) => ({
      stockRestrictions: {
        ...s.stockRestrictions,
        [symbol]: {
          symbol,
          maxSingle,
          maxDaily,
          expiresTick,
          reason: type === 'warn' ? '监管警告' : '监管冻结',
          restrictionType: type,
        },
      },
    }));
    if (state.role === 'dealer') {
      const label = type === 'warn' ? '警告' : '冻结';
      get().showToast(
        `${symbol} 监管${label}：单笔上限 ${formatWan(maxSingle)}，持续 ${ticks} tick`,
        type === 'warn' ? 'info' : 'warning',
      );
    } else if (state.role === 'retail') {
      get().showToast(`监管对 ${symbol} 实施了交易限制`, 'info');
    }
  },

  _applyRegulatorKick: (payload) => {
    if (!payload) return;
    const state = get();
    const { penalizedUserId, opponentId, fine } = payload;
    if (penalizedUserId === state.userId) {
      get().showModal('kicked', `你被监管踢出，罚款 ${formatWan(fine)}`, '监管处罚');
      set({ gameStatus: 'settlement' });
      get().stopSimulation();
    } else if (opponentId === state.userId) {
      get().showToast('对手被监管踢出，你获胜', 'success');
      set({ gameStatus: 'settlement', ...cashSyncPatch(state, state.cash + fine) });
      get().stopSimulation();
    }
  },

  _applyRegulatorResult: (payload: { code: number; data?: any; message?: string; _alertId?: string }) => {
    if (!payload) return;
    const alertId = payload._alertId ?? payload.data?.alertId ?? payload.data?.effect?.alertId;
    if (payload.code !== 0) {
      get().showToast(`监管操作失败: ${payload.message ?? ''}`, 'warning');
      return;
    }
    const data = payload.data;
    if (typeof data?.justiceScore === 'number') {
      set({ justiceScore: data.justiceScore });
    }
    if (data?.scores) {
      set({ regulatoryScores: data.scores, scores: data.scores });
    }
    const effect = data?.effect;
    if (effect?.symbol && effect?.maxSingle) {
      get()._applyRegulatorFreeze({
        symbol: effect.symbol,
        maxSingle: effect.maxSingle,
        maxDaily: effect.maxDaily,
        expiresTick: effect.expiresTick,
        durationTicks: effect.durationTicks,
        restrictionType: effect.restrictionType ?? (effect.warned ? 'warn' : 'freeze'),
      });
    }
    if (effect?.fine && effect?.penalizedUserId) {
      get()._applyRegulatorKick({
        penalizedUserId: effect.penalizedUserId,
        opponentId: effect.opponentId,
        fine: effect.fine,
        symbol: effect.symbol,
      });
    }
    if (alertId) {
      set((s) => ({ alerts: s.alerts.filter((a) => a.id !== alertId) }));
    }
    const actionLabel = effect?.warned ? '警告' : effect?.fine ? '踢出' : effect?.restrictionType === 'freeze' ? '冻结' : '执法';
    get().showToast(`监管${actionLabel}已执行`, 'success');
  },

  _applyMatchTick: (payload) => {
    // 对局日程（午休/收盘/新一天）只由本地 processTick 驱动。
    // 后端 match:tick 是全局计数，午休时仍递增，会覆盖 currentTick 导致疯狂跳日。
    if (get().backendMode) return;
    if (typeof payload?.currentTick === 'number') {
      set({ currentTick: payload.currentTick });
      // Prune expired restrictions
      const state = get();
      const next: Record<string, StockRestriction> = {};
      for (const [sym, r] of Object.entries(state.stockRestrictions)) {
        if (r.expiresTick > payload.currentTick) next[sym] = r;
      }
      if (Object.keys(next).length !== Object.keys(state.stockRestrictions).length) {
        set({ stockRestrictions: next });
      }
    }
  },

  _applyMatchEnd: (payload) => {
    if (!payload) return;
    get().showToast(`对局 ${payload.matchId} 已结束${payload.winnerId ? `，胜者 ${payload.winnerId}` : ''}`, 'info');
    set({ gameStatus: 'settlement' });
    get().stopSimulation();
  },

  _handleDisconnectWarning: (payload) => {
    const msg = payload?.message ?? '连接中断，30秒内重连将保留对局';
    get().showModal('disconnect', msg, '连接中断');
    get().showToast(msg, 'warning');
  },

  _handleMatchForfeit: (payload) => {
    if (!payload) return;
    const state = get();
    const isSelf = payload.self || payload.userId === state.userId;
    if (isSelf) {
      get().showModal('forfeit', payload.message ?? '你已被判定弃权', '弃权');
      get().showToast('你已被判定弃权', 'danger');
      set({ gameStatus: 'settlement' });
      get().stopSimulation();
    } else if (payload.winnerId === state.userId) {
      get().showToast('对手弃权，您获胜', 'success');
      set({ gameStatus: 'settlement' });
      get().stopSimulation();
    }
  },

  _handleMatchDestroyed: (payload) => {
    const msg = payload?.message ?? '房间已关闭';
    get().showModal('room_destroyed', msg, '房间已销毁');
    get().showToast(msg, 'warning');
    get()._resetMatchToIdle();
  },

  _handleMatchTimeout: (payload) => {
    if (get().matchId) return;
    set((s) => ({
      gameStatus: 'waiting',
      waitingRoom: s.waitingRoom ?? {
        code: null,
        currentPlayers: 1,
        requiredPlayers: s.onlinePlayerCount,
        countdown: null,
        mode: 'quick',
      },
    }));
    get().showModal(
      'solo_confirm',
      payload?.message ?? '暂无对手，是否切换单人模式？',
      '匹配超时',
    );
  },

  _confirmSoloFallback: async () => {
    set({ modal: null, waitingRoom: null });
    const api = await import('../services/apiService');
    await api.apiMatch.cancelWaiting(get().userId);
    await get().startOfflinePractice('retail');
  },

  _handleRoomUpdate: (payload) => {
    if (!payload) return;
    set((s) => ({
      gameStatus: 'waiting',
      waitingRoom: {
        code: payload.code ?? s.waitingRoom?.code ?? null,
        currentPlayers: payload.currentPlayers,
        requiredPlayers: payload.requiredPlayers,
        countdown: s.waitingRoom?.countdown ?? null,
        mode: payload.mode ?? s.waitingRoom?.mode ?? 'room',
      },
    }));
  },

  _handleRoomCountdown: (payload) => {
    const seconds = payload?.seconds ?? 3;
    set((s) => ({
      gameStatus: 'waiting',
      waitingRoom: s.waitingRoom
        ? { ...s.waitingRoom, countdown: seconds, currentPlayers: s.waitingRoom.requiredPlayers }
        : {
            code: null,
            currentPlayers: s.onlinePlayerCount,
            requiredPlayers: s.onlinePlayerCount,
            countdown: seconds,
            mode: 'quick',
          },
    }));
  },

  _handleMatchStart: async (payload) => {
    if (!payload?.matchId) return;
    set({ gameStatus: 'matching', waitingRoom: null });
    await get()._joinBackendMatch(payload.matchId, payload.role);
  },

  _attemptReconnectMatch: async () => {
    const state = get();
    if (!state.matchId || !state.backendMode) return;
    try {
      const ws = await import('../services/wsService');
      await ws.waitForAuth(8000);
      const ack = await ws.joinMatch(state.matchId);
      if (ack?.ok) {
        get().dismissModal();
        get().showToast('已重新连接对局', 'success');
      }
    } catch (err) {
      console.warn('[reconnect] join-match failed', err);
    }
  },
}));

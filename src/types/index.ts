// 角色类型
export type Role = 'dealer' | 'retail' | 'regulator';

// 对局状态
export type GameStatus = 'idle' | 'matching' | 'flipping' | 'playing' | 'settlement';

// 订单类型
export type OrderType = 'limit' | 'market';
export type OrderSide = 'buy' | 'sell';

// 持仓
export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

// 订单
export interface Order {
  id: string;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: 'pending' | 'filled' | 'cancelled';
  timestamp: number;
}

// 行情数据
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

// K线数据
export interface KLine {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 五档盘口
export interface OrderBookEntry {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

// 技术指标
export interface TechnicalIndicators {
  ma5: number;
  ma10: number;
  ma20: number;
  macd: {
    diff: number;
    dea: number;
    bar: number;
  };
  rsi: number;
  boll: {
    upper: number;
    middle: number;
    lower: number;
  };
}

// 庄家资源
export interface DealerResources {
  cash: number;
  energy: number;
  riskIndex: number;
  totalAssets: number;
}

// 庄家操作
export type DealerActionType = 
  | 'pump'      // 拉升
  | 'press'     // 打压
  | 'accumulate' // 吸筹
  | 'distribute' // 出货
  | 'wash'       // 对敲
  | 'fakeOrder' // 假挂单
  | 'none';

export interface DealerAction {
  type: DealerActionType;
  power: number;
  target: number;
  cost: number;
  risk: number;
}

// 庄家信息
export interface DealerInfo {
  resources: DealerResources;
  hiddenInfo: {
    realFinancials: FinancialData;
    insiderTrading: InsiderInfo[];
    quantFlow: QuantFlowData;
  };
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

// 散户能力
export interface RetailAbilities {
  chartTools: boolean;
  indicators: {
    ma: boolean;
    macd: boolean;
    rsi: boolean;
    boll: boolean;
  };
  canBuyInsider: boolean;
}

// 监管告警
export interface RegulatoryAlert {
  id: string;
  type: 'pump' | 'fake_order' | 'wash_trade' | 'insider_trade';
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidence: string;
  timestamp: number;
  target: 'dealer' | 'retail';
  status: 'pending' | 'warning' | 'punish';
}

export interface RegulatoryScores {
  manipulation: number;
  insider: number;
  misinformation: number;
}

// 新闻
export interface News {
  id: string;
  type: 'bullish' | 'bearish' | 'neutral';
  title: string;
  content: string;
  impact: number;
  timestamp: number;
}

// 黑天鹅事件
export interface BlackSwan {
  id: string;
  type: string;
  title: string;
  description: string;
  impact: number;
  duration: number;
  timestamp: number;
}

// 玩家
export interface Player {
  id: string;
  name: string;
  role: Role;
  avatar?: string;
  cash: number;
  positions: Position[];
  totalAssets: number;
  isReady: boolean;
}

// 对局
export interface Game {
  id: string;
  status: GameStatus;
  day: number;
  tick: number;
  maxDays: number;
  maxTicksPerDay: number;
  startTime: number;
  players: Player[];
  quote: Quote;
  klines: KLine[];
  orderBook: OrderBook;
  indicators: TechnicalIndicators;
  news: News[];
  dealerInfo?: DealerInfo;
  retailAbilities: RetailAbilities;
  alerts: RegulatoryAlert[];
  scores: RegulatoryScores;
}

// 用户状态
export interface UserState {
  id: string;
  name: string;
  role: Role;
  selectedSymbol: string;
  balance: number;
}

import { create } from 'zustand';

export type Role = 'dealer' | 'retail' | 'regulator';

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

export type GameStatus = 'idle' | 'matching' | 'reversed' | 'playing' | 'settlement';

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

interface Position {
  symbol: string;
  shares: number;
  avgPrice: number;
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

interface DealerResources {
  cash: number;
  energy: number;
  riskIndex: number;
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
}

interface GameState {
  // User
  role: Role;
  userName: string;
  userId: string;

  // Game
  gameStatus: GameStatus;
  currentDay: number;
  currentTick: number;
  maxDays: number;
  maxTicksPerDay: number;
  roundTime: number;

  // Quote (Current selected stock)
  currentQuote: Quote;
  klines: KLine[];
  timelineData: number[];
  orderBook: OrderBook;
  indicators: Indicators;

  // Market Data
  allStocks: Stock[];
  watchlist: string[];
  indices: { name: string; value: number; change: number }[];

  // Portfolio
  holdings: Holding[];
  portfolioTotal: number;
  cash: number;
  todayPnl: number;
  todayPnlPercent: number;
  unrealizedPnl: number;
  leverage: number;
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
  insiderData: InsiderData | null;

  // Regulator
  alerts: Alert[];
  regulatoryScores: { manipulation: number; insider: number; misinformation: number };

  // Messages
  messages: Message[];

  // Settings
  settings: UserSettings;

  // Reversal cards
  reversalCards: ReversalCard[];

  // Matching
  matchOpponentName: string;

  // Simulation
  simulation: SimulationState;

  // Toast (for in-game alerts)
  toast: { id: string; message: string; type: 'info' | 'warning' | 'success' | 'danger' } | null;

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

  placeOrder: (order: Omit<OrderRecord, 'id' | 'timestamp'>) => { success: boolean; error?: string };
  setLeverage: (leverage: number) => void;
  closePosition: (symbol: string, price: number) => void;

  addNews: (news: NewsItem) => void;
  markNewsRead: (id: string) => void;

  addAlert: (alert: Alert) => void;
  resolveAlert: (id: string) => void;
  adjustScores: (delta: Partial<{ manipulation: number; insider: number; misinformation: number }>) => void;
  applyRegulatoryAction: (alertId: string, action: 'warn' | 'freeze' | 'kick' | 'dismiss') => void;

  executeDealerAction: (action: { type: string; cost: number; energy: number; risk: number; power: number }) => { success: boolean; error?: string };
  triggerBlackSwan: () => void;
  purchaseInsiderInfo: (newsId: string, cost: number) => boolean;

  setReversalCards: (cards: ReversalCard[]) => void;
  revealReversalCard: (index: number) => void;
  randomizeMyRole: () => void;

  startMatch: () => void;
  cancelMatch: () => void;
  endMatch: () => void;

  // Tick engine
  startSimulation: () => void;
  stopSimulation: () => void;
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

const initialPlayersInGame: Player[] = [
  { id: 'p1', name: 'Market Maker', rank: 0, totalAssets: 100000000, weeklyReturn: 0, role: 'dealer' },
  { id: 'p2', name: 'Retail Investor', rank: 0, totalAssets: 82292000, weeklyReturn: 0, role: 'retail' },
  { id: 'p3', name: 'SEC Agent', rank: 0, totalAssets: 50000000, weeklyReturn: 0, role: 'regulator' },
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

export const useGameStore = create<GameState>((set, get) => ({
  // User
  role: 'retail',
  userName: 'Investor_007',
  userId: 'user_007',
  
  // Game
  gameStatus: 'idle',
  currentDay: 1,
  currentTick: 87,
  maxDays: 5,
  maxTicksPerDay: 210,
  roundTime: 12 * 3600 + 20 * 60 + 23,
  
  currentQuote: initialQuote,
  klines: [],
  timelineData: [],
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

  allStocks,
  watchlist: ['QDN', 'AAPL', 'TSLA', 'NVDA'],
  indices: initialIndices,

  holdings: [
    { symbol: 'QDN', shares: 500, avgPrice: 90.12, marketPrice: 94.89, pnl: 2385, pnlPercent: 5.30, sector: 'Technology' },
    { symbol: 'AAPL', shares: 200, avgPrice: 175.45, marketPrice: 182.33, pnl: 1375, pnlPercent: 3.92, sector: 'Technology' },
    { symbol: 'TSLA', shares: 100, avgPrice: 245.10, marketPrice: 248.85, pnl: 375, pnlPercent: 1.53, sector: 'Automotive' },
    { symbol: 'NVDA', shares: 80, avgPrice: 482.30, marketPrice: 495.12, pnl: 1024, pnlPercent: 2.66, sector: 'Semiconductors' },
  ],
  portfolioTotal: 82292000,
  cash: 2500000,
  todayPnl: 629200,
  todayPnlPercent: 2.15,
  unrealizedPnl: 2130000,
  leverage: 2,
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
  dealerResources: { cash: 50000000, energy: 100, riskIndex: 32 },
  insiderData: {
    revenue: '¥2.4B',
    profit: '¥340M',
    eps: '¥2.45',
    pe: '45.2x',
    dividend: '2.4%',
  },
  alerts: initialAlerts,
  regulatoryScores: { manipulation: 32.5, insider: 18.2, misinformation: 12.8 },
  messages: initialMessages,
  settings: initialSettings,

  reversalCards: [
    { role: 'dealer', revealed: false },
    { role: 'retail', revealed: false },
    { role: 'regulator', revealed: false },
  ],

  matchOpponentName: 'WhaleKing_88',

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
    initialAssets: 82292000,
    opponentAssets: 82292000,
  },

  toast: null,

  // Section for navigation
  currentSection: 'overview' as string,
  
  setSection: (section) => set({ currentSection: section }),
  
  // Actions
  setRole: (role) => set({ role }),
  
  setGameStatus: (gameStatus) => set({ gameStatus }),
  
  updateQuote: (quote) => set((s) => ({ currentQuote: { ...s.currentQuote, ...quote } })),
  
  setKlines: (klines) => set({ klines }),
  appendKLine: (kline) => set((s) => ({ klines: [...s.klines.slice(-99), kline] })),
  setOrderBook: (orderBook) => set({ orderBook }),
  setIndicators: (indicators) => set({ indicators }),
  
  selectSymbol: (symbol) => {
    const stock = get().allStocks.find(s => s.symbol === symbol);
    if (stock) {
      set({
        currentQuote: {
          ...get().currentQuote,
          symbol: stock.symbol,
          name: stock.name,
          price: stock.price,
          change: stock.change,
          changePercent: stock.changePercent,
          volume: stock.volume,
        }
      });
    }
  },
  
  toggleWatchlist: (symbol) => set((s) => ({
    watchlist: s.watchlist.includes(symbol)
      ? s.watchlist.filter(s => s !== symbol)
      : [...s.watchlist, symbol]
  })),
  
  placeOrder: (order) => {
    const state = get();
    const amount = order.price * order.quantity;

    // Pre-flight validation
    if (order.side === 'buy') {
      if (amount > state.cash) {
        get().showToast(`资金不足: 需要 ¥${amount.toLocaleString()}，可用 ¥${state.cash.toLocaleString()}`, 'warning');
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
      const cash = order.side === 'buy' ? s.cash - amount : s.cash + amount;
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
      const portfolioTotal = cash + positionValue;
      const todayPnl = portfolioTotal - (s.simulation.initialAssets || 82292000);
      const todayPnlPercent = (todayPnl / (s.simulation.initialAssets || 82292000)) * 100;
      return {
        orderHistory,
        cash,
        holdings,
        unrealizedPnl,
        portfolioTotal,
        todayPnl,
        todayPnlPercent,
        totalTradeCount: s.totalTradeCount + 1,
        bestTradePnl: tradePnl > s.bestTradePnl ? tradePnl : s.bestTradePnl,
        currentTick: s.currentTick + 1,
      };
    });

    get().showToast(
      `${order.side === 'buy' ? '买入' : '卖出'} ${order.symbol} ${order.quantity}股 @ ¥${order.price.toFixed(2)}`,
      'success'
    );
    return { success: true };
  },
  
  closePosition: (symbol, price) => {
    set((s) => {
      const h = s.holdings.find(x => x.symbol === symbol);
      if (!h) return s;
      const proceeds = h.shares * price;
      const pnl = (price - h.avgPrice) * h.shares;
      return {
        cash: s.cash + proceeds,
        holdings: s.holdings.filter(x => x.symbol !== symbol),
        orderHistory: [{
          id: `close_${Date.now()}`,
          symbol,
          type: 'market',
          side: 'sell',
          price,
          quantity: h.shares,
          status: 'filled',
          timestamp: Date.now(),
        }, ...s.orderHistory].slice(0, 50),
      };
    });
  },

  setLeverage: (leverage) => set({ leverage }),
  
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
    return {
      regulatoryScores: {
        manipulation: clamp(s.regulatoryScores.manipulation + (delta.manipulation ?? 0)),
        insider: clamp(s.regulatoryScores.insider + (delta.insider ?? 0)),
        misinformation: clamp(s.regulatoryScores.misinformation + (delta.misinformation ?? 0)),
      },
    };
  }),
  
  applyRegulatoryAction: (alertId, action) => {
    const state = get();
    const alert = state.alerts.find(a => a.id === alertId);
    if (!alert) return;
    // Adjust scores based on action severity + alert severity
    let manipulation = 0, insider = 0, misinformation = 0;
    const sev = alert.severity === 'high' ? 4 : alert.severity === 'medium' ? 2.5 : 1.2;
    if (action === 'warn') {
      manipulation -= sev * 0.8;
      insider -= sev * 0.8;
      misinformation -= sev * 0.8;
    } else if (action === 'freeze') {
      manipulation -= sev * 2;
      insider -= sev * 2;
      misinformation -= sev * 2;
    } else if (action === 'kick') {
      manipulation -= sev * 3;
      insider -= sev * 3;
      misinformation -= sev * 3;
    } else {
      manipulation -= sev * 0.2;
      insider -= sev * 0.2;
      misinformation -= sev * 0.2;
    }
    get().adjustScores({ manipulation, insider, misinformation });
    // Remove the alert (resolved)
    set((s) => ({
      alerts: s.alerts.filter(a => a.id !== alertId),
    }));
    get().showToast(`已${({warn:'警告', freeze:'冻结', kick:'踢出', dismiss:'忽略'} as Record<string,string>)[action] || action}告警`, 'success');
  },
  
  executeDealerAction: ({ type, cost, energy, risk, power }) => {
    const state = get();
    if (!state.dealerResources) return { success: false, error: '无庄家资源' };
    if (state.dealerResources.cash < cost) {
      get().showToast(`庄家资金不足: 需要 ¥${cost.toLocaleString()}，可用 ¥${state.dealerResources.cash.toLocaleString()}`, 'warning');
      return { success: false, error: '庄家资金不足' };
    }
    if (state.dealerResources.energy < energy) {
      get().showToast(`能量不足: 需要 ${energy}，可用 ${state.dealerResources.energy}`, 'warning');
      return { success: false, error: '能量不足' };
    }

    const intensity = power / 100;
    let newPrice = state.currentQuote.price;
    let newVolume = state.currentQuote.volume;
    let extraCashEffect = 0;
    let fakeOrderBookRestore: typeof state.orderBook | null = null;

    switch (type) {
      case 'pump':
        newPrice = state.currentQuote.price * (1 + 0.003 * power);
        break;
      case 'press':
        newPrice = state.currentQuote.price * (1 - 0.003 * power);
        break;
      case 'accumulate':
        newVolume = state.currentQuote.volume * (1 + 0.5 * intensity);
        extraCashEffect = -cost * 0.5;
        break;
      case 'distribute':
        newVolume = state.currentQuote.volume * (1 + 0.4 * intensity);
        extraCashEffect = cost * 0.6;
        newPrice = state.currentQuote.price * (1 - 0.001 * power);
        break;
      case 'wash':
        newVolume = state.currentQuote.volume * (1 + 1.5 * intensity);
        break;
      case 'fake':
        fakeOrderBookRestore = JSON.parse(JSON.stringify(state.orderBook));
        const idx = Math.floor(Math.random() * 5);
        fakeOrderBookRestore.asks[idx] = { ...fakeOrderBookRestore.asks[idx], quantity: fakeOrderBookRestore.asks[idx].quantity * 8 };
        break;
    }

    newPrice = Math.max(1, newPrice);
    const newChange = newPrice - state.currentQuote.prevClose;
    const newChangePct = (newChange / state.currentQuote.prevClose) * 100;

    const scoreDelta: { manipulation?: number; insider?: number; misinformation?: number } = {};
    if (type === 'wash') scoreDelta.manipulation = (scoreDelta.manipulation ?? 0) + intensity * 2;
    if (['pump', 'press', 'wash', 'fake'].includes(type)) {
      scoreDelta.manipulation = (scoreDelta.manipulation ?? 0) + risk * intensity;
    }
    if (type === 'fake') {
      scoreDelta.misinformation = risk * intensity / 2;
    }

    set({
      currentQuote: {
        ...state.currentQuote,
        price: newPrice,
        change: newChange,
        changePercent: newChangePct,
        volume: newVolume,
        timestamp: Date.now(),
      },
      orderBook: fakeOrderBookRestore || state.orderBook,
      dealerResources: {
        cash: state.dealerResources.cash - cost + extraCashEffect,
        energy: Math.max(0, state.dealerResources.energy - energy),
        riskIndex: Math.min(100, state.dealerResources.riskIndex + intensity * 1.5),
      },
    });

    if (Object.keys(scoreDelta).length > 0) {
      get().adjustScores(scoreDelta);
    }

    if (risk * intensity > 0.08) {
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
        severity: risk * intensity > 0.15 ? 'high' : 'medium',
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
    get().showToast(`庄家${labelMap[type] || type}执行成功`, 'info');

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
  
  purchaseInsiderInfo: (newsId, cost) => {
    const state = get();
    if (state.cash < cost) return false;
    // Increase insider score, decrease cash
    set({
      cash: state.cash - cost,
      regulatoryScores: {
        ...state.regulatoryScores,
        insider: Math.min(100, state.regulatoryScores.insider + 5),
        misinformation: Math.min(100, state.regulatoryScores.misinformation + 2),
      },
    });
    get().addAlert({
      id: `insider_${Date.now()}`,
      severity: 'medium',
      title: '内幕交易嫌疑',
      description: `检测到用户购买了内部消息（费用 ¥${cost.toLocaleString()}），触发监管告警`,
      timestamp: Date.now(),
      source: 'Insider Trading Monitor',
    });
    return true;
  },
  
  setReversalCards: (cards) => set({ reversalCards: cards }),
  
  revealReversalCard: (index) => set((s) => {
    if (s.reversalCards[index].revealed) return s;
    const pickedRole = s.reversalCards[index].role;
    return {
      role: pickedRole,
      reversalCards: s.reversalCards.map((c, i) => i === index ? { ...c, revealed: true } : c),
    };
  }),
  
  randomizeMyRole: () => {
    set((s) => {
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
    set({
      gameStatus: 'matching',
      reversalCards: [
        { role: 'dealer', revealed: false },
        { role: 'retail', revealed: false },
        { role: 'regulator', revealed: false },
      ]
    });
  },
  
  cancelMatch: () => set({ gameStatus: 'idle' }),
  
  endMatch: () => {
    const state = get();
    // Compute final assets
    const finalCash = state.cash;
    const finalPositions = state.holdings.reduce((sum, h) => sum + h.marketPrice * h.shares, 0);
    const finalAssets = finalCash + finalPositions;
    const initialAssets = state.simulation.initialAssets || 82292000;
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
      } as SimulationState,
    });
    get().stopSimulation();
  },
  
  updateSettings: (newSettings) => set((s) => ({
    settings: { ...s.settings, ...newSettings }
  })),
  
  readMessage: (id) => set((s) => ({
    messages: s.messages.map(m => m.id === id ? { ...m, read: true } : m)
  })),
  
  sendMessage: (to, subject, content) => {
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

  startSimulation: () => {
    const state = get();
    if (state.simulation.timer) return; // already running
    if (state.gameStatus !== 'playing') return;

    // Initialize kline baseline
    set({
      simulation: {
        ...state.simulation,
        lastKlineOpen: state.simulation.lastKlineOpen ?? { price: state.currentQuote.price, time: Date.now() },
        lastIndexTrigger: { manipulation: state.regulatoryScores.manipulation, insider: state.regulatoryScores.insider, misinformation: state.regulatoryScores.misinformation },
      },
    });

    // Tick every 200ms - geometric Brownian motion price update
    const tickTimer = setInterval(() => {
      get().processTick();
    }, 200);

    // Aggregate K-line every 30s
    const klineTimer = setInterval(() => {
      get().aggregateKline();
    }, 30000);

    // Random news every 30-60s
    const scheduleNews = () => {
      const delay = 30000 + Math.random() * 30000;
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
      },
    });

    get().refreshOrderBook();
  },

  stopSimulation: () => {
    const s = get().simulation;
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
      },
    });
  },

  processTick: () => {
    const state = get();
    if (state.gameStatus !== 'playing') {
      get().stopSimulation();
      return;
    }

    // Geometric Brownian motion: slight upward bias (0.02)
    const delta = (Math.random() - 0.48) * 0.0006;
    const newPrice = Math.max(1, state.currentQuote.price * (1 + delta));
    const newChange = newPrice - state.currentQuote.prevClose;
    const newChangePct = (newChange / state.currentQuote.prevClose) * 100;
    const newVolume = state.currentQuote.volume + Math.floor(Math.random() * 100);

    set({
      currentQuote: {
        ...state.currentQuote,
        price: newPrice,
        change: newChange,
        changePercent: newChangePct,
        volume: newVolume,
        high: Math.max(state.currentQuote.high, newPrice),
        low: Math.min(state.currentQuote.low, newPrice),
        timestamp: Date.now(),
      },
      timelineData: [...state.timelineData, newPrice].slice(-500),
      currentTick: state.currentTick + 1,
    });

    // Update holdings market price & pnl based on selected symbol
    set((s) => {
      if (s.currentQuote.symbol === '__ALL__' || s.holdings.every(h => h.symbol !== s.currentQuote.symbol)) return s;
      const holdings = s.holdings.map(h => h.symbol === s.currentQuote.symbol ? {
        ...h,
        marketPrice: newPrice,
        pnl: (newPrice - h.avgPrice) * h.shares,
        pnlPercent: ((newPrice - h.avgPrice) / h.avgPrice) * 100,
      } : h);
      const positionValue = holdings.reduce((sum, h) => sum + h.marketPrice * h.shares, 0);
      const unrealizedPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);
      const portfolioTotal = s.cash + positionValue;
      const todayPnl = portfolioTotal - (s.simulation.initialAssets || 82292000);
      const todayPnlPercent = (todayPnl / (s.simulation.initialAssets || 82292000)) * 100;
      return { holdings, portfolioTotal, unrealizedPnl, todayPnl, todayPnlPercent };
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
    const recent = state.timelineData;
    const slice = recent.length > 0 ? recent : [state.currentQuote.price];
    const open = last.price;
    const close = state.currentQuote.price;
    const high = Math.max(...slice, open);
    const low = Math.min(...slice, open);
    const volume = state.currentQuote.volume;
    const kline = { timestamp: last.time, open, high, low, close, volume };
    set((s) => ({
      klines: [...s.klines, kline].slice(-100),
      simulation: { ...s.simulation, lastKlineOpen: { price: close, time: Date.now() } },
    }));
  },

  recalculateIndicators: () => {
    const state = get();
    const closes = state.klines.map(k => k.close);
    if (closes.length < 5) return;
    const ma = (n: number) => {
      const slice = closes.slice(-n);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    };
    const ma5 = ma(5);
    const ma10 = ma(10);
    const ma20 = ma(20);

    // EMA helper
    const ema = (data: number[], period: number) => {
      const k = 2 / (period + 1);
      let e = data[0];
      for (let i = 1; i < data.length; i++) e = data[i] * k + e * (1 - k);
      return e;
    };
    let diff = 0, dea = 0;
    if (closes.length >= 26) {
      const ema12 = ema(closes.slice(-26), 12);
      const ema26 = ema(closes.slice(-26), 26);
      diff = ema12 - ema26;
      // simplified DEA using diff series
      const diffSeries: number[] = [];
      for (let i = 25; i < closes.length; i++) {
        const e12 = ema(closes.slice(0, i + 1), 12);
        const e26 = ema(closes.slice(0, i + 1), 26);
        diffSeries.push(e12 - e26);
      }
      dea = ema(diffSeries, 9);
    }
    const bar = (diff - dea) * 2;

    // RSI(14)
    let rsi = 50;
    if (closes.length >= 15) {
      const recent = closes.slice(-15);
      let gains = 0, losses = 0;
      for (let i = 1; i < recent.length; i++) {
        const d = recent[i] - recent[i - 1];
        if (d > 0) gains += d; else losses -= d;
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      if (avgLoss === 0) rsi = 100;
      else {
        const rs = avgGain / avgLoss;
        rsi = 100 - 100 / (1 + rs);
      }
    }

    // BOLL(20, 2)
    let boll = { upper: ma20, middle: ma20, lower: ma20 };
    if (closes.length >= 20) {
      const slice = closes.slice(-20);
      const mean = ma20;
      const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / 20;
      const std = Math.sqrt(variance);
      boll = { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
    }

    set({ indicators: { ma5, ma10, ma20, macd: { diff, dea, bar }, rsi, boll } });
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
    const item = pool[Math.floor(Math.random() * pool.length)];

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
}));

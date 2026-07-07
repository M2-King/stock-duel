import { useGameStore } from '../store/gameStore';
import { Quote, KLine, OrderBook, TechnicalIndicators, News, InsiderInfo, QuantFlowData } from '../types';

const symbols = [
  { symbol: 'SZ000001', name: '平安银行' },
  { symbol: 'SH600519', name: '贵州茅台' },
  { symbol: 'SZ000858', name: '五粮液' },
  { symbol: 'SH600036', name: '招商银行' },
  { symbol: 'SZ002594', name: '比亚迪' },
];

let currentSymbol = symbols[0];
let basePrice = 12.50;
let volatility = 0.002;

export function generateMockData() {
  const store = useGameStore.getState();
  
  // Initialize quote
  const quote: Quote = {
    symbol: currentSymbol.symbol,
    name: currentSymbol.name,
    price: basePrice,
    change: basePrice - 12.45,
    changePercent: ((basePrice - 12.45) / 12.45) * 100,
    volume: Math.floor(Math.random() * 10000000),
    amount: Math.floor(Math.random() * 100000000),
    high: basePrice * 1.02,
    low: basePrice * 0.98,
    open: 12.45,
    prevClose: 12.45,
    timestamp: Date.now(),
  };
  store.updateQuote(quote);
  
  // Generate initial K-lines
  const klines = generateKLines(100);
  store.updateKLines(klines);
  
  // Generate order book
  const orderBook = generateOrderBook(basePrice);
  store.updateOrderBook(orderBook);
  
  // Generate indicators
  const indicators = generateIndicators(basePrice);
  store.updateIndicators(indicators);
  
  // Generate initial news
  const news = generateNews();
  news.forEach(n => store.addNews(n));
  
  // Generate dealer info if role is dealer
  if (store.role === 'dealer') {
    store.setDealerInfo(generateDealerInfo());
  }
}

export function generateKLines(count: number): KLine[] {
  const klines: KLine[] = [];
  let price = basePrice;
  const now = Date.now();
  const interval = 60000; // 1 minute
  
  for (let i = count; i > 0; i--) {
    const change = (Math.random() - 0.5) * 2 * volatility * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * price;
    const low = Math.min(open, close) - Math.random() * volatility * price;
    const volume = Math.floor(Math.random() * 5000000) + 1000000;
    
    klines.push({
      timestamp: now - i * interval,
      open,
      high,
      low,
      close,
      volume,
    });
    
    price = close;
  }
  
  basePrice = price;
  return klines;
}

export function generateOrderBook(basePrice: number): OrderBook {
  const bids: { price: number; quantity: number; orders: number }[] = [];
  const asks: { price: number; quantity: number; orders: number }[] = [];
  
  for (let i = 0; i < 5; i++) {
    const bidPrice = basePrice - (i + 1) * 0.01;
    const askPrice = basePrice + (i + 1) * 0.01;
    
    bids.push({
      price: Number(bidPrice.toFixed(2)),
      quantity: Math.floor(Math.random() * 100000) + 10000,
      orders: Math.floor(Math.random() * 20) + 1,
    });
    
    asks.push({
      price: Number(askPrice.toFixed(2)),
      quantity: Math.floor(Math.random() * 100000) + 10000,
      orders: Math.floor(Math.random() * 20) + 1,
    });
  }
  
  return { bids, asks };
}

export function generateIndicators(price: number): TechnicalIndicators {
  const ma5 = price * (1 + (Math.random() - 0.5) * 0.02);
  const ma10 = price * (1 + (Math.random() - 0.5) * 0.03);
  const ma20 = price * (1 + (Math.random() - 0.5) * 0.04);
  
  const macdDiff = (Math.random() - 0.5) * 0.1;
  const macdDea = macdDiff * 0.7;
  const macdBar = macdDiff - macdDea;
  
  const rsi = 40 + Math.random() * 40;
  
  const bollMiddle = price;
  const std = price * 0.02;
  const bollUpper = bollMiddle + 2 * std;
  const bollLower = bollMiddle - 2 * std;
  
  return {
    ma5: Number(ma5.toFixed(2)),
    ma10: Number(ma10.toFixed(2)),
    ma20: Number(ma20.toFixed(2)),
    macd: {
      diff: Number(macdDiff.toFixed(4)),
      dea: Number(macdDea.toFixed(4)),
      bar: Number(macdBar.toFixed(4)),
    },
    rsi: Number(rsi.toFixed(1)),
    boll: {
      upper: Number(bollUpper.toFixed(2)),
      middle: Number(bollMiddle.toFixed(2)),
      lower: Number(bollLower.toFixed(2)),
    },
  };
}

export function generateNews(): News[] {
  const newsTemplates = [
    { type: 'bullish' as const, title: '公司Q4营收超预期', impact: 0.02 },
    { type: 'bearish' as const, title: '行业政策出现重大变化', impact: -0.02 },
    { type: 'neutral' as const, title: '公司发布日常公告', impact: 0 },
    { type: 'bullish' as const, title: '获得大额订单', impact: 0.015 },
    { type: 'bearish' as const, title: '高管减持股份', impact: -0.015 },
    { type: 'neutral' as const, title: '正常交易提示', impact: 0 },
    { type: 'bullish' as const, title: '新产品发布', impact: 0.01 },
    { type: 'bearish' as const, title: '业绩下调', impact: -0.025 },
  ];
  
  const news: News[] = [];
  const now = Date.now();
  
  for (let i = 0; i < 8; i++) {
    const template = newsTemplates[Math.floor(Math.random() * newsTemplates.length)];
    news.push({
      id: `news_${i}`,
      type: template.type,
      title: template.title,
      content: `${currentSymbol.name}${template.title}，市场反应${template.impact > 0 ? '积极' : template.impact < 0 ? '消极' : '平淡'}`,
      impact: template.impact,
      timestamp: now - i * 300000,
    });
  }
  
  return news;
}

export function generateDealerInfo() {
  const insiderInfos: InsiderInfo[] = [];
  const insiderTypes = ['buy', 'sell'] as const;
  
  for (let i = 0; i < 5; i++) {
    insiderInfos.push({
      type: insiderTypes[Math.floor(Math.random() * 2)],
      amount: Math.floor(Math.random() * 10000000) + 1000000,
      ratio: Math.random() * 0.1,
      timestamp: Date.now() - i * 3600000,
      isFake: Math.random() > 0.7,
    });
  }
  
  const quantFlow: QuantFlowData = {
    main: {
      direction: Math.random() > 0.5 ? 'in' : 'out',
      amount: Math.floor(Math.random() * 50000000),
      strength: Math.random(),
    },
    retail: {
      direction: Math.random() > 0.5 ? 'in' : 'out',
      amount: Math.floor(Math.random() * 20000000),
      strength: Math.random(),
    },
    foreign: {
      direction: Math.random() > 0.5 ? 'in' : 'out',
      amount: Math.floor(Math.random() * 30000000),
      strength: Math.random(),
    },
    timestamp: Date.now(),
  };
  
  return {
    resources: {
      cash: 100000000,
      energy: 100,
      riskIndex: 0,
      totalAssets: 100000000,
    },
    hiddenInfo: {
      realFinancials: {
        revenue: Math.floor(Math.random() * 1000000000) + 100000000,
        profit: Math.floor(Math.random() * 100000000) + 10000000,
        pe: 10 + Math.random() * 30,
        pb: 1 + Math.random() * 5,
        dividend: Math.random() * 2,
        quarter: 'Q4 2024',
      },
      insiderTrading: insiderInfos,
      quantFlow,
    },
  };
}

export function simulateTick() {
  const store = useGameStore.getState();
  const { currentQuote } = store;
  
  // Geometric Brownian Motion
  const drift = 0.0001;
  const shock = (Math.random() - 0.5) * 2 * volatility;
  const newPrice = currentQuote.price * (1 + drift + shock);
  
  const quote: Quote = {
    ...currentQuote,
    price: Number(newPrice.toFixed(2)),
    change: Number((newPrice - currentQuote.prevClose).toFixed(2)),
    changePercent: Number(((newPrice - currentQuote.prevClose) / currentQuote.prevClose * 100).toFixed(2)),
    high: Math.max(currentQuote.high, newPrice),
    low: Math.min(currentQuote.low, newPrice),
    volume: currentQuote.volume + Math.floor(Math.random() * 10000),
    amount: currentQuote.amount + Math.floor(Math.random() * 100000),
    timestamp: Date.now(),
  };
  
  store.updateQuote(quote);
  
  // Update order book
  const orderBook = generateOrderBook(newPrice);
  store.updateOrderBook(orderBook);
  
  // Update indicators
  const indicators = generateIndicators(newPrice);
  store.updateIndicators(indicators);
  
  // Add new K-line occasionally
  const { klines } = store;
  if (klines.length > 0) {
    const lastKline = klines[klines.length - 1];
    if (Date.now() - lastKline.timestamp > 60000) {
      const newKlines = [...klines.slice(1), {
        timestamp: Date.now(),
        open: newPrice,
        high: newPrice,
        low: newPrice,
        close: newPrice,
        volume: Math.floor(Math.random() * 5000000),
      }];
      store.updateKLines(newKlines);
    }
  }
  
  // Random news
  if (Math.random() < 0.05) {
    const templates = [
      { type: 'bullish' as const, title: '利好消息刺激股价上涨', impact: 0.005 },
      { type: 'bearish' as const, title: '利空消息导致股价下跌', impact: -0.005 },
      { type: 'neutral' as const, title: '市场维持震荡格局', impact: 0 },
    ];
    const template = templates[Math.floor(Math.random() * templates.length)];
    store.addNews({
      id: `news_${Date.now()}`,
      type: template.type,
      title: template.title,
      content: `${currentSymbol.name}${template.title}`,
      impact: template.impact,
      timestamp: Date.now(),
    });
  }
}

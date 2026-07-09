import type { Stock } from '../common/types';
import { STOCK_META } from '../common/stock-meta';

export { STOCK_META };

/**
 * 15 只股票种子 — 价格范围区间参考前端 src/store/gameStore.ts 的 allStocks。
 */
export const STOCK_SEED: Stock[] = [
  { symbol: 'QDN',  name: 'Quantum Dynamics', sector: 'Technology',    price: 94.89,   change: 2.34,  changePercent: 2.53,   volume: 2_480_000,  marketCap: '12.4B',  pe: 45.2 },
  { symbol: 'AAPL', name: 'Apple Inc.',        sector: 'Technology',    price: 182.33,  change: 1.25,  changePercent: 0.69,   volume: 58_200_000, marketCap: '2.85T', pe: 28.4 },
  { symbol: 'TSLA', name: 'Tesla Motors',      sector: 'Automotive',    price: 248.85,  change: -3.10, changePercent: -1.23,  volume: 42_100_000, marketCap: '789B',  pe: 65.8 },
  { symbol: 'NVDA', name: 'NVIDIA Corp',       sector: 'Semiconductors',price: 495.12,  change: 8.45,  changePercent: 1.74,   volume: 38_900_000, marketCap: '1.22T', pe: 52.3 },
  { symbol: 'MSFT', name: 'Microsoft Corp',    sector: 'Technology',    price: 412.65,  change: 3.45,  changePercent: 0.84,   volume: 22_400_000, marketCap: '3.07T', pe: 35.2 },
  { symbol: 'GOOGL',name: 'Alphabet Inc',      sector: 'Technology',    price: 158.21,  change: -0.85, changePercent: -0.53,  volume: 24_800_000, marketCap: '1.97T', pe: 25.6 },
  { symbol: 'META', name: 'Meta Platforms',    sector: 'Technology',    price: 485.32,  change: 5.21,  changePercent: 1.08,   volume: 18_200_000, marketCap: '1.24T', pe: 28.9 },
  { symbol: 'AMZN', name: 'Amazon.com',        sector: 'Consumer',      price: 178.45,  change: 1.85,  changePercent: 1.05,   volume: 28_400_000, marketCap: '1.86T', pe: 62.1 },
  { symbol: 'BABA', name: 'Alibaba Group',     sector: 'Consumer',      price: 78.32,   change: -1.45, changePercent: -1.82,  volume: 14_200_000, marketCap: '195B',  pe: 12.4 },
  { symbol: 'JPM',  name: 'JPMorgan Chase',    sector: 'Financial',     price: 198.76,  change: 0.92,  changePercent: 0.46,   volume: 8_900_000,  marketCap: '571B',  pe: 11.8 },
  { symbol: 'GS',   name: 'Goldman Sachs',     sector: 'Financial',     price: 412.34,  change: 2.45,  changePercent: 0.60,   volume: 2_400_000,  marketCap: '142B',  pe: 15.2 },
  { symbol: 'XOM',  name: 'Exxon Mobil',       sector: 'Energy',        price: 116.85,  change: -0.45, changePercent: -0.38,  volume: 14_800_000, marketCap: '462B',  pe: 13.7 },
  { symbol: 'CVX',  name: 'Chevron Corp',      sector: 'Energy',        price: 154.21,  change: 0.85,  changePercent: 0.55,   volume: 7_200_000,  marketCap: '281B',  pe: 12.9 },
  { symbol: 'PFE',  name: 'Pfizer Inc',        sector: 'Healthcare',    price: 28.45,   change: -0.32, changePercent: -1.11,  volume: 28_500_000, marketCap: '161B',  pe: 22.4 },
  { symbol: 'JNJ',  name: 'Johnson & Johnson', sector: 'Healthcare',    price: 152.34,  change: 0.45,  changePercent: 0.30,   volume: 6_800_000,  marketCap: '367B',  pe: 24.6 },
];

export const STOCK_MAP: Record<string, Stock> = STOCK_SEED.reduce((acc, s) => {
  acc[s.symbol] = s;
  return acc;
}, {} as Record<string, Stock>);

/**
 * 强制价格地板：1 元/股。即便 GBM 抽到极端负漂移也不能为 0。
 */
export const PRICE_FLOOR = 1;

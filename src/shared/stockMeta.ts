/** Per-stock fundamentals for dealer cost/effect scaling (¥). */
export interface StockMeta {
  marketCap: number;
  dailyVolume: number;
}

export const STOCK_META: Record<string, StockMeta> = {
  QDN:   { marketCap: 5_000_000_000,   dailyVolume: 200_000_000 },
  AAPL:  { marketCap: 100_000_000_000, dailyVolume: 5_000_000_000 },
  TSLA:  { marketCap: 50_000_000_000,   dailyVolume: 3_000_000_000 },
  NVDA:  { marketCap: 80_000_000_000,   dailyVolume: 4_000_000_000 },
  MSFT:  { marketCap: 90_000_000_000,   dailyVolume: 4_500_000_000 },
  GOOGL: { marketCap: 70_000_000_000,   dailyVolume: 3_500_000_000 },
  META:  { marketCap: 60_000_000_000,   dailyVolume: 2_800_000_000 },
  AMZN:  { marketCap: 85_000_000_000,   dailyVolume: 3_800_000_000 },
  BABA:  { marketCap: 15_000_000_000,   dailyVolume: 800_000_000 },
  JPM:   { marketCap: 40_000_000_000,   dailyVolume: 2_000_000_000 },
  GS:    { marketCap: 30_000_000_000,   dailyVolume: 1_500_000_000 },
  XOM:   { marketCap: 45_000_000_000,   dailyVolume: 2_200_000_000 },
  DIS:   { marketCap: 20_000_000_000,   dailyVolume: 1_000_000_000 },
  NFLX:  { marketCap: 25_000_000_000,   dailyVolume: 1_200_000_000 },
  INTC:  { marketCap: 12_000_000_000,   dailyVolume: 600_000_000 },
};

/** 50亿基准市值 */
export const MARKET_CAP_BASELINE = 5_000_000_000;

export function getStockMeta(symbol: string): StockMeta {
  return STOCK_META[symbol] ?? { marketCap: MARKET_CAP_BASELINE, dailyVolume: 1_000_000_000 };
}

/** ¥ → "50亿" / "2亿" */
export function formatYi(amount: number): string {
  const yi = amount / 100_000_000;
  if (yi >= 100) return `${yi.toFixed(0)}亿`;
  if (yi >= 10) return `${yi.toFixed(1)}亿`;
  return `${yi.toFixed(2)}亿`;
}

export function formatStockMetaLine(symbol: string): string {
  const meta = getStockMeta(symbol);
  return `${symbol} · 市值 ¥${formatYi(meta.marketCap)} · 日均成交 ¥${formatYi(meta.dailyVolume)}`;
}

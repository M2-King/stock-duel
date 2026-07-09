/**
 * 技术指标工具 — 不依赖外部库，纯 JS 计算。
 * 输入: KLine.close 的有序数组。  输出: 每个指标的"最新值 + 全序列"。
 * 序列里前几个位置 null 表示"样本不足以计算"，对齐前端 src/store/gameStore.ts 的逻辑。
 */

const sma = (arr: number[], period: number): (number | null)[] => {
  const out: (number | null)[] = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < period) continue;
    let s = 0;
    for (let j = i + 1 - period; j <= i; j++) s += arr[j];
    out[i] = s / period;
  }
  return out;
};

const ema = (arr: number[], period: number): (number | null)[] => {
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(arr.length).fill(null);
  if (arr.length === 0) return out;
  let e = arr[0];
  out[0] = e;
  for (let i = 1; i < arr.length; i++) {
    e = arr[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
};

const last = <T>(s: (T | null)[], fallback: T): T => {
  const v = s[s.length - 1];
  return v === null || v === undefined ? fallback : v;
};

export const computeMa = (closes: number[]) => ({
  ma5: last(sma(closes, 5), 0),
  ma10: last(sma(closes, 10), 0),
  ma20: last(sma(closes, 20), 0),
});

export const computeMacd = (closes: number[]) => {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const diff = e12.map((v, i) => (v !== null && e26[i] !== null ? (v as number) - (e26[i] as number) : null));
  const dea = ema(diff as number[], 9);
  const bar = diff.map((v, i) => (v !== null && dea[i] !== null ? ((v as number) - (dea[i] as number)) * 2 : null));
  return { diff: last(diff, 0), dea: last(dea, 0), bar: last(bar, 0) };
};

export const computeRsi = (closes: number[], period = 14) => {
  if (closes.length <= period) return 0;
  let gains = 0, losses = 0;
  for (let j = closes.length - period; j < closes.length; j++) {
    const d = closes[j] - closes[j - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
};

export const computeBoll = (closes: number[], period = 20) => {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
};

export interface Indicators {
  ma5: number; ma10: number; ma20: number;
  macd: { diff: number; dea: number; bar: number };
  rsi: number;
  boll: { upper: number; middle: number; lower: number };
}

/**
 * 一次性算齐四个核心指标的"最新值"。
 * 序列版（前端 IndicatorSeries 那种）按需再加。
 */
export const computeIndicators = (closes: number[]): Indicators => ({
  ...computeMa(closes),
  macd: computeMacd(closes),
  rsi: computeRsi(closes),
  boll: computeBoll(closes),
});

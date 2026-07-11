/**
 * 多频率叠加价格模拟 — 前端离线 processTick 与后端 market.engine 对齐。
 *
 * SIMULATOR_MODE（代码常量，无 UI 切换）:
 *   true  = 全真模拟：正常波动 + 万分之三概率突发放大（偶发自然涨跌停）
 *   false = 纯游戏：delta 封顶 ±0.5%，涨停跌停仅庄家工具可达
 */

/** true = 模拟器（突发新闻/恐慌）；false = 纯游戏（自然波动极小） */
export const SIMULATOR_MODE = true;

export const HIGH_FREQ_SIGMA = 0.0015;
export const MID_FREQ_SIGMA = 0.003;
export const LOW_FREQ_SIGMA = 0.002;
export const DRIFT_SIGMA = 0.0002;

/** 纯游戏模式单 tick delta 上限 */
export const PURE_GAME_DELTA_CAP = 0.005;

/** 模拟器模式突发波动概率（万分之三） */
export const BURST_EVENT_PROB = 0.0003;

/** 均值回归：相对 prevClose 偏离超过此比例时启用 */
export const MEAN_REVERSION_THRESHOLD = 0.02;
export const MEAN_REVERSION_COEFF = 0.05;

/** 相对价格变化率（不含 price 乘数） */
export function multiFreqPriceDelta(tick: number, opts?: { extraDrift?: number }): number {
  const highFreqNoise = (Math.random() - 0.5) * 2 * HIGH_FREQ_SIGMA;
  const midFreqTrend = Math.sin(tick / 30) * MID_FREQ_SIGMA;
  const lowFreqWave = Math.sin(tick / 120) * LOW_FREQ_SIGMA;
  const drift = opts?.extraDrift ?? (Math.random() - 0.5) * 2 * DRIFT_SIGMA;
  return highFreqNoise + midFreqTrend + lowFreqWave + drift;
}

function applyModeDelta(delta: number): number {
  if (SIMULATOR_MODE) {
    if (Math.random() < BURST_EVENT_PROB) {
      return delta * (2 + Math.random() * 3);
    }
    return delta;
  }
  return Math.max(-PURE_GAME_DELTA_CAP, Math.min(PURE_GAME_DELTA_CAP, delta));
}

export function applyMultiFreqPriceStep(
  prevPrice: number,
  tick: number,
  prevClose: number,
  opts?: { refOpen?: number; meanReversion?: boolean },
): number {
  let delta = multiFreqPriceDelta(tick);

  if (opts?.meanReversion !== false && prevClose > 0) {
    const deviation = (prevPrice - prevClose) / prevClose;
    if (Math.abs(deviation) > MEAN_REVERSION_THRESHOLD) {
      delta += -deviation * MEAN_REVERSION_COEFF;
    }
  }

  delta = applyModeDelta(delta);

  const upper = prevClose * 1.10;
  const lower = prevClose * 0.90;
  let next = Math.max(1, prevPrice * (1 + delta));
  if (next > upper) next = upper;
  if (next < lower) next = lower;
  return next;
}

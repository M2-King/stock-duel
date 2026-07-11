/** 与前端 src/shared/priceSimulation.ts 保持同步 */

/** true = 模拟器（突发新闻/恐慌）；false = 纯游戏（自然波动极小） */
export const SIMULATOR_MODE = true;

export const HIGH_FREQ_SIGMA = 0.0015;
export const MID_FREQ_SIGMA = 0.003;
export const LOW_FREQ_SIGMA = 0.002;
export const DRIFT_SIGMA = 0.0002;

export const PURE_GAME_DELTA_CAP = 0.005;
export const BURST_EVENT_PROB = 0.0003;
export const MEAN_REVERSION_THRESHOLD = 0.02;
export const MEAN_REVERSION_COEFF = 0.05;

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

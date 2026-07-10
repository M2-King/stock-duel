/** 与前端 src/shared/priceSimulation.ts 保持同步 */

export const HIGH_FREQ_SIGMA = 0.005;
export const MID_FREQ_SIGMA = 0.02;
export const LOW_FREQ_SIGMA = 0.01;

export function multiFreqPriceDelta(tick: number, opts?: { extraDrift?: number }): number {
  const highFreqNoise = (Math.random() - 0.5) * 2 * HIGH_FREQ_SIGMA;
  const midFreqTrend = Math.sin(tick / 30) * MID_FREQ_SIGMA;
  const lowFreqWave = Math.sin(tick / 120) * LOW_FREQ_SIGMA;
  const drift = opts?.extraDrift ?? (Math.random() - 0.48) * 0.001;
  return highFreqNoise + midFreqTrend + lowFreqWave + drift;
}

export function applyMultiFreqPriceStep(
  prevPrice: number,
  tick: number,
  prevClose: number,
  opts?: { refOpen?: number; meanReversion?: boolean },
): number {
  const refOpen = opts?.refOpen ?? prevClose;
  let delta = multiFreqPriceDelta(tick);
  if (opts?.meanReversion !== false) {
    const deviation = (prevPrice - refOpen) / refOpen;
    if (Math.abs(deviation) > 0.05) {
      delta += -deviation * 0.01;
    }
  }
  const upper = prevClose * 1.10;
  const lower = prevClose * 0.90;
  let next = Math.max(1, prevPrice * (1 + delta));
  if (next > upper) next = upper;
  if (next < lower) next = lower;
  return next;
}

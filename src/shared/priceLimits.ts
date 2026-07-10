/** A-share daily price limit band: ±10% from prior close. */
export const PRICE_LIMIT_PCT = 0.10;

export interface PriceLimitBand {
  prevClose: number;
  limitUp: number;
  limitDown: number;
}

export function priceLimitsFromPrevClose(prevClose: number): PriceLimitBand {
  const base = prevClose > 0 ? prevClose : 1;
  return {
    prevClose: base,
    limitUp: base * (1 + PRICE_LIMIT_PCT),
    limitDown: base * (1 - PRICE_LIMIT_PCT),
  };
}

/**
 * Resolve the reference price for limit lines:
 *   - Prefer quote.prevClose (backend authoritative, rolled on new day)
 *   - Day 2+: fallback to last completed daily K-line close
 *   - Day 1: opening / seed initial price
 */
export function resolvePrevCloseForLimits(opts: {
  currentDay: number;
  quote?: { prevClose?: number; open?: number; price?: number };
  klines?: Array<{ close?: number }>;
  seedPrice?: number;
  seedChange?: number;
}): number {
  const { currentDay, quote, klines, seedPrice, seedChange } = opts;

  if (quote?.prevClose && quote.prevClose > 0) {
    return quote.prevClose;
  }

  if (currentDay > 1 && klines && klines.length > 0) {
    const lastClose = klines[klines.length - 1]?.close;
    if (typeof lastClose === 'number' && lastClose > 0) return lastClose;
  }

  if (quote?.open && quote.open > 0) return quote.open;

  if (typeof seedPrice === 'number' && typeof seedChange === 'number') {
    const seeded = seedPrice - seedChange;
    if (seeded > 0) return seeded;
  }

  if (quote?.price && quote.price > 0) return quote.price;
  if (typeof seedPrice === 'number' && seedPrice > 0) return seedPrice;
  return 1;
}

/** Today's opening price (for the dashed open line), separate from limit reference. */
export function resolveDayOpen(opts: {
  quote?: { open?: number };
  firstIntradayPoint?: number;
  prevClose: number;
}): number {
  if (opts.quote?.open && opts.quote.open > 0) return opts.quote.open;
  if (typeof opts.firstIntradayPoint === 'number' && opts.firstIntradayPoint > 0) {
    return opts.firstIntradayPoint;
  }
  return opts.prevClose > 0 ? opts.prevClose : 1;
}

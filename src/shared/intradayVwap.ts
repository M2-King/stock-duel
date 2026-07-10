/**
 * 分时均价（VWAP）— 累计成交额 / 累计成交量。
 * timeline 无逐笔量时，用 |Δprice| 作为成交量代理。
 */

export function computeIntradayVwapSeries(prices: number[]): number[] {
  if (prices.length === 0) return [];
  let cumTurnover = 0;
  let cumVolume = 0;
  return prices.map((price, i) => {
    const vol = i === 0 ? 1 : Math.max(Math.abs(price - prices[i - 1]) * 1000, 1);
    cumTurnover += price * vol;
    cumVolume += vol;
    return cumVolume > 0 ? cumTurnover / cumVolume : price;
  });
}

/** 单点时的近似均价 */
export function approximateIntradayAvg(open: number, close: number): number {
  return (open + close) / 2;
}

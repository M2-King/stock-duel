import { Controller, Get, Param } from '@nestjs/common';
import { MarketService } from './market.service';
import { Ok } from '../common/response';

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  /** GET /api/market/stocks → 15 只股票 + 当下价格 */
  @Get('stocks')
  async listStocks() {
    return Ok(this.market.listStocks());
  }

  /** GET /api/market/:symbol → 当前 quote */
  @Get(':symbol')
  async quote(@Param('symbol') symbol: string) {
    const q = this.market.getQuote(symbol.toUpperCase());
    if (!q) return { code: 404, data: null, message: `未找到 symbol ${symbol}` };
    return Ok(q);
  }

  /** GET /api/market/:symbol/kline → K 线 */
  @Get(':symbol/kline')
  async kline(@Param('symbol') symbol: string) {
    const k = this.market.getKlines(symbol.toUpperCase());
    return Ok(k);
  }

  /** GET /api/market/:symbol/orderbook → 五档盘口 */
  @Get(':symbol/orderbook')
  async ob(@Param('symbol') symbol: string) {
    return Ok(this.market.getOrderBook(symbol.toUpperCase()));
  }

  /** GET /api/market/:symbol/indicators → MA / MACD / RSI / BOLL */
  @Get(':symbol/indicators')
  async ind(@Param('symbol') symbol: string) {
    return Ok(this.market.getIndicators(symbol.toUpperCase()));
  }
}

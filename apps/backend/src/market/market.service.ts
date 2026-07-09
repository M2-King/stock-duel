import { Injectable } from '@nestjs/common';
import { MarketEngine } from './market.engine';
import { STOCK_MAP } from './stocks.seed';
import { Stock } from '../common/types';

@Injectable()
export class MarketService {
  constructor(private readonly engine: MarketEngine) {}

  listStocks(): Stock[] {
    // 拼接行情引擎里的当前价（开盘后会被 tick 刷新）+ 原始 metadata
    const out: Stock[] = [];
    for (const [sym, meta] of Object.entries(STOCK_MAP)) {
      const q = this.engine.getQuote(sym);
      out.push({
        ...meta,
        price: q?.price ?? meta.price,
        change: q?.change ?? meta.change,
        changePercent: q?.changePercent ?? meta.changePercent,
        volume: q?.volume ?? meta.volume,
      });
    }
    return out;
  }

  getQuote(symbol: string) {
    return this.engine.getQuote(symbol);
  }

  getAllQuotes() {
    return this.engine.getAllQuotes();
  }

  getKlines(symbol: string) {
    return this.engine.getKlines(symbol);
  }

  getTimeline(symbol: string) {
    return this.engine.getTimeline(symbol);
  }

  getOrderBook(symbol: string) {
    return this.engine.getOrderBook(symbol);
  }

  getIndicators(symbol: string) {
    return this.engine.getIndicators(symbol);
  }
}

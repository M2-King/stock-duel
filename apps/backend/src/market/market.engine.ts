import { Injectable, Logger } from '@nestjs/common';
import { STOCK_SEED, STOCK_MAP, PRICE_FLOOR } from './stocks.seed';
import { NEWS_POOL, BLACK_SWAN_EVENTS, makeNewsItem, NewsSeed } from './news.pool';
import { computeIndicators, Indicators } from './indicators.util';
import { Quote, KLine, OrderBook, NewsItem } from '../common/types';

/**
 * 全局行情引擎 — 内存态。
 *
 * 每 200ms 一个 tick，对每个活跃 symbol 跑一次 GBM：
 *   delta = drift (rand-0.48)*sigma + noise (rand-0.5)*sigma*0.5 + meanReversion
 *   price *= 1 + delta
 *   其中 meanReversion = -deviation*0.01（仅当 |deviation| > 5% 时）
 *
 * sigma = 0.06（每 200ms tick 波动更明显；对局仍 120 tick/天 × 3s）
 *   自然走势有波动有回调，庄家拉升在自然噪声里"显得只是顺势"
 *
 * 地板价 = 1 元/股；涨跌停 = prevClose * ±10% hard clamp。
 *
 * 设计原则：
 *   - 引擎只跑"活跃 match"，无 match 时静止；match 结束回放录像时也不动 ticker。
 *   - 价格状态不入库（每 tick 200ms 入库会撑爆），只把 KLine 节流后入库。
 *   - 暴露最小查询接口：getQuote / getKlines / getOrderBook / getIndicators，
 *     配合 REST controller 与 WebSocket gateway 共享数据源。
 */
@Injectable()
export class MarketEngine {
  private readonly logger = new Logger(MarketEngine.name);

  /** 价格 / 元数据，symbol → 元数据；启动时从 STOCK_SEED 拷贝 */
  private state = new Map<string, { quote: Quote; klines: KLine[]; timeline: number[]; orderBook: OrderBook; prevClose: number; }>();

  /** 活跃 match 的 set — tick 只在非空时跑 */
  private activeMatches = new Set<string>();
  private tickTimer: NodeJS.Timeout | null = null;
  private klineTimer: NodeJS.Timeout | null = null;
  private newsTimer: NodeJS.Timeout | null = null;
  private blackSwanTimer: NodeJS.Timeout | null = null;

  /** 订阅者：news / black swan 推送 */
  private newsListeners = new Set<(item: NewsItem) => void>();
  private blackSwanListeners = new Set<(payload: { symbol: string; newPrice: number; label: string; multiplier: number }) => void>();

  /** 当前对局"正在交易的 symbol"集合（每个 match 各自一个）。注册 match 时绑死，模拟"symbol 选择"。 */
  private matchSymbol = new Map<string, string>();

  /** 价格日志，每个对局盘内，按 200ms tick 写一条，最后对局结束序列化为录像 */
  private tickLog = new Map<string, Array<{
    tick: number; time: number; day: number; symbol: string; price: number; volume: number;
    orderBook: OrderBook; events: any[];
  }>>();

  /** tick 序号（全局） */
  private globalTick = 0;
  /** 每对局 tick 序号 */
  private matchTicks = new Map<string, number>();

  /** Per-tick GBM volatility — visible intraday moves; 120 game ticks/day unchanged */
  private static readonly GBM_SIGMA = 0.06;

  /** Per-symbol turnover: recent tick amounts + daily sums for dynamic regulatory limits. */
  private turnoverHistory = new Map<string, { recentTicks: number[]; dailyByDay: Map<number, number> }>();

  /**
   * Engine 启动时调用一次，把价格种子拷进内存。
   * 注意：必须在 DatabaseService 初始化完成之后再写——因为价格不需要存盘，这里就在构造里做。
   */
  constructor() {
    for (const s of STOCK_SEED) {
      this.turnoverHistory.set(s.symbol, { recentTicks: [], dailyByDay: new Map() });
      this.state.set(s.symbol, {
        quote: {
          symbol: s.symbol,
          name: s.name,
          price: s.price,
          change: s.change,
          changePercent: s.changePercent,
          volume: s.volume,
          amount: 0,
          high: s.price,
          low: s.price,
          open: s.price,
          prevClose: s.price - s.change,
          timestamp: Date.now(),
        },
        klines: [],
        timeline: [],
        orderBook: this.makeOrderBook(s.price),
        prevClose: s.price - s.change,
      });
    }
  }

  // ============================================================
  // REST/WebSocket 用：拉行情
  // ============================================================

  getQuote(symbol: string): Quote | null {
    return this.state.get(symbol)?.quote ?? null;
  }

  getAllQuotes(): Quote[] {
    const out: Quote[] = [];
    for (const { quote } of this.state.values()) out.push(quote);
    return out;
  }

  getKlines(symbol: string): KLine[] {
    return this.state.get(symbol)?.klines ?? [];
  }

  getTimeline(symbol: string): number[] {
    return this.state.get(symbol)?.timeline ?? [];
  }

  getOrderBook(symbol: string): OrderBook {
    return this.state.get(symbol)?.orderBook ?? { bids: [], asks: [] };
  }

  getIndicators(symbol: string): Indicators {
    const s = this.state.get(symbol);
    if (!s) return { ma5: 0, ma10: 0, ma20: 0, macd: { diff: 0, dea: 0, bar: 0 }, rsi: 0, boll: { upper: 0, middle: 0, lower: 0 } };
    const closes = s.klines.map((k) => k.close);
    // 没有 K线时，退化用最近 timeline
    const data = closes.length >= 5 ? closes : s.timeline.slice(-20);
    return computeIndicators(data);
  }

  getStockMeta(symbol: string) {
    return STOCK_MAP[symbol] ?? null;
  }

  /** Average turnover (¥) over the last N engine ticks for a symbol. */
  getAvgTurnoverLastTicks(symbol: string, n = 30): number {
    const rec = this.turnoverHistory.get(symbol);
    const slice = rec?.recentTicks.slice(-n) ?? [];
    if (slice.length > 0) {
      return slice.reduce((s, v) => s + v, 0) / slice.length;
    }
    const q = this.getQuote(symbol);
    return q ? q.price * Math.max(1, q.volume) : 1_000_000;
  }

  /** Average daily turnover (¥) over the last N trading days for a symbol. */
  getAvgDailyTurnoverLastDays(symbol: string, n = 5): number {
    const rec = this.turnoverHistory.get(symbol);
    const daily = rec?.dailyByDay;
    if (!daily || daily.size === 0) {
      const q = this.getQuote(symbol);
      return q ? q.price * Math.max(1, q.volume) : 10_000_000;
    }
    const days = [...daily.keys()].sort((a, b) => b - a).slice(0, n);
    const sum = days.reduce((s, d) => s + (daily.get(d) ?? 0), 0);
    return sum / Math.max(1, days.length);
  }

  private recordTurnover(symbol: string, turnover: number, day: number) {
    let rec = this.turnoverHistory.get(symbol);
    if (!rec) {
      rec = { recentTicks: [], dailyByDay: new Map() };
      this.turnoverHistory.set(symbol, rec);
    }
    rec.recentTicks.push(turnover);
    if (rec.recentTicks.length > 60) rec.recentTicks = rec.recentTicks.slice(-60);
    rec.dailyByDay.set(day, (rec.dailyByDay.get(day) ?? 0) + turnover);
    const sortedDays = [...rec.dailyByDay.keys()].sort((a, b) => b - a);
    for (const d of sortedDays.slice(5)) rec.dailyByDay.delete(d);
  }

  // ============================================================
  // 庄家 / 监管 工具调用：直接改价、改盘口、放大成交量
  // ============================================================

  /**
   * 直接把某 symbol 价格乘一个系数（庄家 pump/press/distribute）。
   * 返回改后的 quote。
   */
  bumpPrice(symbol: string, multiplier: number): Quote | null {
    const s = this.state.get(symbol);
    if (!s) return null;
    const next = Math.max(PRICE_FLOOR, s.quote.price * multiplier);
    s.quote.price = next;
    s.quote.change = next - s.quote.prevClose;
    s.quote.changePercent = (s.quote.change / s.quote.prevClose) * 100;
    s.quote.timestamp = Date.now();
    s.quote.high = Math.max(s.quote.high, next);
    s.quote.low = Math.min(s.quote.low, next);
    s.timeline.push(next);
    if (s.timeline.length > 500) s.timeline = s.timeline.slice(-500);
    return s.quote;
  }

  /**
   * 把价格直接设成某值（用于把 pump/press 后超出涨跌停的价格截断）。
   */
  setPrice(symbol: string, newPrice: number): Quote | null {
    const s = this.state.get(symbol);
    if (!s) return null;
    const next = Math.max(PRICE_FLOOR, newPrice);
    s.quote.price = next;
    s.quote.change = next - s.quote.prevClose;
    s.quote.changePercent = (s.quote.change / s.quote.prevClose) * 100;
    s.quote.timestamp = Date.now();
    s.quote.high = Math.max(s.quote.high, next);
    s.quote.low = Math.min(s.quote.low, next);
    s.timeline.push(next);
    if (s.timeline.length > 500) s.timeline = s.timeline.slice(-500);
    return s.quote;
  }

  /**
   * 庄家 wash 工具：放大成交量。
   */
  bumpVolume(symbol: string, factor: number): Quote | null {
    const s = this.state.get(symbol);
    if (!s) return null;
    s.quote.volume = Math.floor(s.quote.volume * factor);
    return s.quote;
  }

  /**
   * 庄家 spoof 工具：临时把某档 asks 放大 8 倍，3 秒后自动还原。
   * 返回原始盘口，便于 caller 还原。
   */
  spoofOrderBook(symbol: string, level: number, durationMs = 3000): { original: OrderBook } | null {
    const s = this.state.get(symbol);
    if (!s) return null;
    const original = JSON.parse(JSON.stringify(s.orderBook)) as OrderBook;
    const idx = Math.max(0, Math.min(4, level - 1));
    s.orderBook.asks[idx] = { ...s.orderBook.asks[idx], quantity: s.orderBook.asks[idx].quantity * 8 };
    setTimeout(() => {
      const cur = this.state.get(symbol);
      if (cur) cur.orderBook = original;
    }, durationMs);
    return { original };
  }

  // ============================================================
  // 匹配控制
  // ============================================================

  registerMatch(matchId: string, symbol: string) {
    this.activeMatches.add(matchId);
    this.matchSymbol.set(matchId, symbol);
    this.matchTicks.set(matchId, 0);
    this.tickLog.set(matchId, []);
    this.ensureLoops();
  }

  unregisterMatch(matchId: string) {
    this.activeMatches.delete(matchId);
    this.matchSymbol.delete(matchId);
    this.matchTicks.delete(matchId);
    if (this.activeMatches.size === 0) this.stopLoops();
  }

  /** 给录像系统用的快照导出 */
  getTickLog(matchId: string) {
    return this.tickLog.get(matchId) ?? [];
  }

  // ============================================================
  // tick / news / black-swan 主循环
  // ============================================================

  private ensureLoops() {
    if (this.tickTimer) return;
    // 200ms tick
    this.tickTimer = setInterval(() => this.tick(), 200);
    // 30s K线聚合
    this.klineTimer = setInterval(() => this.aggregateKlines(), 30_000);
    // 30-60s 随机新闻
    this.scheduleRandomNews();
    // 60s 黑天鹅几率
    this.blackSwanTimer = setInterval(() => this.maybeBlackSwan(), 60_000);
    this.logger.log('Market engine loops started');
  }

  private stopLoops() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.klineTimer) clearInterval(this.klineTimer);
    if (this.newsTimer) clearTimeout(this.newsTimer);
    if (this.blackSwanTimer) clearInterval(this.blackSwanTimer);
    this.tickTimer = this.klineTimer = this.newsTimer = this.blackSwanTimer = null;
    this.logger.log('Market engine loops stopped (no active matches)');
  }

  private tick() {
    if (this.activeMatches.size === 0) return;
    this.globalTick += 1;

    // 每个 tick 遍历所有 symbol，各自独立 GBM（价格 + 成交量）
    // 这里用 STOCK_MAP 作为全量来源，确保推送侧与前端 watchlist 的 symbol 集合一致。
    // sigma 0.03：分时线有明显起伏，庄家拉升仍能被自然噪声部分掩盖
    const symbols = Object.keys(STOCK_MAP);
    for (const sym of symbols) this.gbmStep(sym, MarketEngine.GBM_SIGMA);

    // 5 tick 更新盘口
    if (this.globalTick % 5 === 0) {
      for (const sym of symbols) this.refreshOrderBookFor(sym);
    }

    // 给每个活跃 match 落一条 tick 快照
    for (const matchId of this.activeMatches) {
      const symbol = this.matchSymbol.get(matchId) || symbols[0];
      const day = Math.floor(this.globalTick / 240) + 1;
      const localTick = (this.matchTicks.get(matchId) ?? 0) + 1;
      this.matchTicks.set(matchId, localTick);

      const s = this.state.get(symbol)!;
      const snap = {
        tick: localTick,
        time: Date.now(),
        day,
        symbol,
        price: s.quote.price,
        volume: s.quote.volume,
        orderBook: JSON.parse(JSON.stringify(s.orderBook)),
        events: [],
      };
      const log = this.tickLog.get(matchId)!;
      log.push(snap);
      if (log.length > 50_000) log.splice(0, log.length - 50_000); // 内存上限保护
    }
  }

  private gbmStep(symbol: string, sigma: number) {
    const s = this.state.get(symbol);
    if (!s) return;
    const prevVolume = s.quote.volume;
    const upper = s.quote.prevClose * 1.10;
    const lower = s.quote.prevClose * 0.90;
    const refOpen = s.quote.open > 0 ? s.quote.open : s.quote.prevClose;

    // ⛳ GBM：sigma≈0.03 → 自然波动更明显；均值回归防止长期单边漂移
    const drift = (Math.random() - 0.48) * sigma;
    const noise = (Math.random() - 0.5) * sigma * 0.5;
    const deviation = (s.quote.price - refOpen) / refOpen; // 正=高于开盘
    const meanReversion = Math.abs(deviation) > 0.05
      ? -deviation * 0.01
      : 0;
    const delta = drift + noise + meanReversion;
    let next = Math.max(PRICE_FLOOR, s.quote.price * (1 + delta));
    if (next > upper) next = upper;
    if (next < lower) next = lower;
    s.quote.price = next;
    s.quote.change = next - s.quote.prevClose;
    s.quote.changePercent = (s.quote.change / s.quote.prevClose) * 100;
    s.quote.timestamp = Date.now();
    s.quote.high = Math.max(s.quote.high, next);
    s.quote.low = Math.min(s.quote.low, next);
    s.quote.volume += Math.floor(Math.random() * 100);
    const deltaVol = Math.max(0, s.quote.volume - prevVolume);
    const day = Math.floor(this.globalTick / 240) + 1;
    this.recordTurnover(symbol, next * deltaVol, day);
    s.timeline.push(next);
    if (s.timeline.length > 500) s.timeline = s.timeline.slice(-500);
  }

  private aggregateKlines() {
    for (const [symbol, s] of this.state.entries()) {
      const t = s.timeline;
      const last = t[t.length - 1] ?? s.quote.price;
      const recent = t.length > 0 ? t : [last];
      const k: KLine = {
        timestamp: Date.now(),
        open: recent[0],
        high: Math.max(...recent, last),
        low: Math.min(...recent, last),
        close: last,
        volume: s.quote.volume,
      };
      s.klines.push(k);
      if (s.klines.length > 100) s.klines = s.klines.slice(-100);
    }
  }

  private scheduleRandomNews() {
    const delay = 30_000 + Math.floor(Math.random() * 30_000);
    this.newsTimer = setTimeout(() => {
      this.pushRandomNews();
      if (this.activeMatches.size > 0) this.scheduleRandomNews();
    }, delay);
  }

  private pushRandomNews(directionBias?: 'bullish' | 'bearish') {
    let pool: NewsSeed[];
    if (directionBias) {
      pool = NEWS_POOL.filter((n) => n.sentiment === directionBias);
      if (pool.length === 0) pool = NEWS_POOL;
    } else {
      pool = NEWS_POOL;
    }
    const seed = pool[Math.floor(Math.random() * pool.length)];
    const item = makeNewsItem(seed, this.globalTick);

    // 应用 sentiment 到活跃 symbol 的价格上
    const symbols = Array.from(this.state.keys());
    for (const sym of symbols) {
      const s = this.state.get(sym)!;
      let mult = 1;
      if (seed.sentiment === 'bullish') mult = 1 + 0.001 + Math.random() * 0.004;
      else if (seed.sentiment === 'bearish') mult = 0.995 + Math.random() * 0.004;
      const upper = s.quote.prevClose * 1.10;
      const lower = s.quote.prevClose * 0.90;
      let next = Math.max(PRICE_FLOOR, s.quote.price * mult);
      if (next > upper) next = upper;
      if (next < lower) next = lower;
      s.quote.price = next;
      s.quote.change = s.quote.price - s.quote.prevClose;
      s.quote.changePercent = (s.quote.change / s.quote.prevClose) * 100;
      s.quote.timestamp = Date.now();
    }

    for (const cb of this.newsListeners) cb(item);
    return item;
  }

  private maybeBlackSwan() {
    if (this.activeMatches.size === 0) return;
    if (Math.random() > 0.10) return; // 10% / minute ~ 每交易日一次

    const ev = BLACK_SWAN_EVENTS[Math.floor(Math.random() * BLACK_SWAN_EVENTS.length)];
    const mult = ev.range[0] + Math.random() * (ev.range[1] - ev.range[0]);
    // 黑天鹅作用在活跃 match 的"主 symbol"上
    const symbols = new Set<string>();
    for (const m of this.activeMatches) {
      const sym = this.matchSymbol.get(m);
      if (sym) symbols.add(sym);
    }
    const list = symbols.size > 0 ? Array.from(symbols) : Array.from(this.state.keys()).slice(0, 1);
    for (const sym of list) {
      const s = this.state.get(sym)!;
      const oldPrice = s.quote.price;
      const upper = s.quote.prevClose * 1.10;
      const lower = s.quote.prevClose * 0.90;
      let newPrice = Math.max(PRICE_FLOOR, oldPrice * mult);
      if (newPrice > upper) newPrice = upper;
      if (newPrice < lower) newPrice = lower;
      s.quote.price = newPrice;
      s.quote.change = newPrice - s.quote.prevClose;
      s.quote.changePercent = ((newPrice - s.quote.prevClose) / s.quote.prevClose) * 100;
      s.quote.timestamp = Date.now();
      for (const cb of this.blackSwanListeners) {
        cb({ symbol: sym, newPrice, label: ev.label, multiplier: mult });
      }
    }
  }

  private refreshOrderBookFor(symbol: string) {
    const s = this.state.get(symbol);
    if (!s) return;
    s.orderBook = this.makeOrderBook(s.quote.price);
  }

  private makeOrderBook(p: number): OrderBook {
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      bids: Array.from({ length: 5 }, (_, i) => ({
        price: round(p - 0.01 * (i + 1)),
        quantity: 50 + Math.floor(Math.random() * 450),
        orders: 5 + Math.floor(Math.random() * 20),
      })),
      asks: Array.from({ length: 5 }, (_, i) => ({
        price: round(p + 0.01 * (i + 1)),
        quantity: 50 + Math.floor(Math.random() * 450),
        orders: 5 + Math.floor(Math.random() * 20),
      })),
    };
  }

  // ============================================================
  // 订阅：news / black swan 推送
  // ============================================================
  onNews(cb: (item: NewsItem) => void) {
    this.newsListeners.add(cb);
    return () => this.newsListeners.delete(cb);
  }
  onBlackSwan(cb: (payload: { symbol: string; newPrice: number; label: string; multiplier: number }) => void) {
    this.blackSwanListeners.add(cb);
    return () => this.blackSwanListeners.delete(cb);
  }
}

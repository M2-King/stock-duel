import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { MarketEngine } from '../market/market.engine';
import { MatchService } from '../match/match.service';
import { StockRestrictionsService } from '../regulator/stock-restrictions.service';
import { Ok, Fail, ApiResponse } from '../common/response';
import { Holding, PortfolioDto } from '../common/types';
import { STOCK_MAP } from '../market/stocks.seed';

/**
 * 交易引擎：
 *   - buy  校验 cash * leverage >= price * quantity，扣 cash、加仓（已有累加均价）。
 *   - sell 校验持仓足够，加 cash（先还 borrowed 再入 cash）、减仓（卖完移除）。
 *   - totalAssets = cash + sum(qty * curPrice) - borrowed
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly engine: MarketEngine,
    private readonly matchSvc: MatchService,
    private readonly restrictions: StockRestrictionsService,
  ) {}

  // ============================================================
  // buy / sell
  // ============================================================

  buy(body: { matchId: string; userId: string; symbol: string; price: number; quantity: number; leverage?: number; orderType?: 'market' | 'limit' }): ApiResponse<{ orderId: string; portfolio: PortfolioDto }> {
    const { matchId, userId, symbol, price, quantity } = body;
    if (!matchId || !userId) return Fail('缺少 matchId 或 userId');
    if (!symbol || !Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) return Fail('参数错误');
    if (price <= 0) return Fail('价格非法');

    const meta = STOCK_MAP[symbol];
    if (!meta) return Fail(`未找到 symbol ${symbol}`);

    const state = this.matchSvc.getUserMatchState(matchId, userId);
    if (!state) return Fail('用户未在该对局');

    const amount = price * quantity;
    const limitCheck = this.restrictions.validateTrade(matchId, userId, symbol, amount);
    if (!limitCheck.ok) return Fail(limitCheck.message);

    const leverage = body.leverage ?? state.leverage;
    const buyingPower = state.cash * leverage;
    if (amount > buyingPower) {
      return Fail(`资金不足: 需要 ¥${amount.toLocaleString()}，可用购买力 ¥${buyingPower.toLocaleString()}`);
    }

    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // 事务：现金扣减 + 持仓 upsert + 订单记录
    let tradePnl = 0;
    let updatedCash = 0;
    let updatedBorrowed = 0;
    const txBuy = this.db.transaction(() => {
      const fromCash = Math.min(state.cash, amount);
      const borrow = amount - fromCash;
      updatedCash = state.cash - fromCash;
      updatedBorrowed = state.borrowed + borrow;

      // upsert position
      const existing = this.db.prepare(
        `SELECT * FROM positions WHERE user_id = ? AND match_id = ? AND symbol = ?`,
      ).get(userId, matchId, symbol) as any;

      if (existing) {
        const totalShares = existing.quantity + quantity;
        const totalCost = existing.avg_cost * existing.quantity + price * quantity;
        const avgCost = totalCost / totalShares;
        this.db.prepare(
          `UPDATE positions SET quantity = ?, avg_cost = ?, updated_at = ? WHERE id = ?`,
        ).run(totalShares, avgCost, now, existing.id);
      } else {
        this.db.prepare(
          `INSERT INTO positions (id, match_id, user_id, symbol, quantity, avg_cost, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(`pos_${uuidv4().slice(0, 8)}`, matchId, userId, symbol, quantity, price, now);
      }

      this.db.prepare(
        `INSERT INTO orders (id, match_id, user_id, symbol, side, order_type, price, quantity, cash_delta, status, created_at)
         VALUES (?, ?, ?, ?, 'buy', ?, ?, ?, ?, 'filled', ?)`,
      ).run(orderId, matchId, userId, symbol, body.orderType ?? 'market', price, quantity, -amount, now);

      this.matchSvc.setUserMatchState(matchId, userId, { cash: updatedCash, borrowed: updatedBorrowed });
      this.matchSvc.setUserMatchState(matchId, userId, { total_trade_count: state.total_trade_count + 1 });
    });
    txBuy();
    this.restrictions.recordTrade(matchId, userId, symbol, amount);

    return this.makeTradeResponse({ matchId, userId, orderId, tradePnl });
  }

  sell(body: { matchId: string; userId: string; symbol: string; price: number; quantity: number; orderType?: 'market' | 'limit' }): ApiResponse<{ orderId: string; portfolio: PortfolioDto }> {
    const { matchId, userId, symbol, price, quantity } = body;
    if (!matchId || !userId) return Fail('缺少 matchId 或 userId');
    if (!symbol || !Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) return Fail('参数错误');

    const state = this.matchSvc.getUserMatchState(matchId, userId);
    if (!state) return Fail('用户未在该对局');

    const existing = this.db.prepare(
      `SELECT * FROM positions WHERE user_id = ? AND match_id = ? AND symbol = ?`,
    ).get(userId, matchId, symbol) as any;
    if (!existing || existing.quantity < quantity) {
      return Fail(`持仓不足: 持有 ${existing?.quantity ?? 0} 股，请求卖出 ${quantity} 股`);
    }

    const amount = price * quantity;
    const limitCheck = this.restrictions.validateTrade(matchId, userId, symbol, amount);
    if (!limitCheck.ok) return Fail(limitCheck.message);

    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const now = Date.now();
    let tradePnl = 0;
    let updatedCash = 0;
    let updatedBorrowed = 0;

    const txSell = this.db.transaction(() => {
      const remaining = existing.quantity - quantity;
      tradePnl = (price - existing.avg_cost) * quantity;

      if (remaining <= 0) {
        this.db.prepare(`DELETE FROM positions WHERE id = ?`).run(existing.id);
      } else {
        this.db.prepare(
          `UPDATE positions SET quantity = ?, updated_at = ? WHERE id = ?`,
        ).run(remaining, now, existing.id);
      }

      // 卖的钱先还 borrowed，余下入 cash
      const repay = Math.min(state.borrowed, amount);
      updatedBorrowed = state.borrowed - repay;
      updatedCash = state.cash + (amount - repay);

      this.db.prepare(
        `INSERT INTO orders (id, match_id, user_id, symbol, side, order_type, price, quantity, cash_delta, status, created_at)
         VALUES (?, ?, ?, ?, 'sell', ?, ?, ?, ?, 'filled', ?)`,
      ).run(orderId, matchId, userId, symbol, body.orderType ?? 'market', price, quantity, amount, now);

      const bestPnl = Math.max(state.best_trade_pnl, tradePnl);
      this.matchSvc.setUserMatchState(matchId, userId, { cash: updatedCash, borrowed: updatedBorrowed, best_trade_pnl: bestPnl });
      this.matchSvc.setUserMatchState(matchId, userId, { total_trade_count: state.total_trade_count + 1 });
    });
    txSell();
    this.restrictions.recordTrade(matchId, userId, symbol, amount);

    return this.makeTradeResponse({ matchId, userId, orderId, tradePnl });
  }

  // ============================================================
  // portfolio / orders
  // ============================================================

  portfolio(matchId: string, userId: string): ApiResponse<PortfolioDto> {
    const state = this.matchSvc.getUserMatchState(matchId, userId);
    if (!state) return Fail('用户未在该对局', 404);

    const positions = this.db.prepare(
      `SELECT * FROM positions WHERE user_id = ? AND match_id = ?`,
    ).all(userId, matchId) as any[];

    const holdings: Holding[] = positions.map((p) => {
      const cur = this.engine.getQuote(p.symbol)?.price ?? p.avg_cost;
      const pnl = (cur - p.avg_cost) * p.quantity;
      const pnlPercent = p.avg_cost > 0 ? ((cur - p.avg_cost) / p.avg_cost) * 100 : 0;
      return {
        symbol: p.symbol,
        shares: p.quantity,
        avgPrice: p.avg_cost,
        marketPrice: cur,
        pnl,
        pnlPercent,
        sector: STOCK_MAP[p.symbol]?.sector ?? 'Other',
      };
    });

    const positionValue = holdings.reduce((s, h) => s + h.marketPrice * h.shares, 0);
    const totalAssets = state.cash + positionValue - state.borrowed;
    const initialAssets = 100_000_000;
    const todayPnl = totalAssets - initialAssets;
    const todayPnlPercent = (todayPnl / initialAssets) * 100;
    const unrealizedPnl = holdings.reduce((s, h) => s + h.pnl, 0);

    return Ok({
      cash: state.cash,
      borrowed: state.borrowed,
      holdings,
      totalAssets,
      unrealizedPnl,
      todayPnl,
      todayPnlPercent,
      leverage: state.leverage,
      initialAssets,
    });
  }

  private makeTradeResponse(args: { matchId: string; userId: string; orderId: string; tradePnl: number }): ApiResponse<{ orderId: string; portfolio: PortfolioDto }> {
    const portfolio = this.portfolio(args.matchId, args.userId);
    return portfolio.code === 0
      ? Ok({ orderId: args.orderId, portfolio: portfolio.data as PortfolioDto })
      : portfolio as any;
  }
}

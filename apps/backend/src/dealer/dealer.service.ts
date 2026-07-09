import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { MarketEngine } from '../market/market.engine';
import { MatchService } from '../match/match.service';
import { StockRestrictionsService } from '../regulator/stock-restrictions.service';
import { Ok, Fail, ApiResponse } from '../common/response';
import { DealerResources } from '../common/types';
import {
  computeDealerActionCost,
  computeDealerActionEffect,
  computeDealerRiskIncrease,
  normalizeDealerToolType,
  previewDealerAction,
} from '../common/dealer-formulas';

/**
 * 庄家操盘模块。
 *
 * Cost / effect 公式（与前端 src/shared/dealerFormulas.ts 一致）：
 *   cost = baseCost * (marketCap / 5_000_000_000) * (power / 100)
 *   effect% = (cost / marketCap) * 100 * manipulationFactor
 *   riskIncrease = baseRisk * (effect% / 5)
 */

/** A 股涨跌停限制：±10% */
export const PRICE_LIMIT_PCT = 0.10;

const MAX_RISK = 100;

@Injectable()
export class DealerService {
  private readonly logger = new Logger(DealerService.name);

  /** 庄家"内幕消息"队列 — 用于 lock 下一条新闻 sentiment。match 隔离。 */
  private insiderTips = new Map<string, { direction: 'up' | 'down' | null; trustworthy: boolean; expiresTick: number; }>();

  /** 每对局 tick 数（用于 insider 倒计时） */
  private matchTicks = new Map<string, number>();

  constructor(
    private readonly db: DatabaseService,
    private readonly engine: MarketEngine,
    private readonly matchSvc: MatchService,
    private readonly restrictions: StockRestrictionsService,
  ) {}

  // ============================================================
  // 资源管理
  // ============================================================

  resources(matchId: string, userId: string): DealerResources {
    const row = this.db.prepare(
      `SELECT cash, risk_index FROM dealer_state WHERE match_id = ? AND user_id = ?`,
    ).get(matchId, userId) as any;
    if (!row) {
      this.db.prepare(
        `INSERT INTO dealer_state (match_id, user_id, cash, energy, risk_index, position_qty, position_avg, freeze_until_tick)
         VALUES (?, ?, 50000000, 0, 0, 0, 0, 0)`,
      ).run(matchId, userId);
      return { cash: 50_000_000, energy: 0, riskIndex: 0 };
    }
    return { cash: row.cash, energy: 0, riskIndex: row.risk_index };
  }

  onTick(matchId: string) {
    const tick = (this.matchTicks.get(matchId) ?? 0) + 1;
    this.matchTicks.set(matchId, tick);
    const tip = this.insiderTips.get(matchId);
    if (tip && tick > tip.expiresTick) {
      this.insiderTips.delete(matchId);
    }
  }

  resetForMatch(matchId: string, userId: string) {
    this.db.prepare(
      `INSERT OR REPLACE INTO dealer_state (match_id, user_id, cash, energy, risk_index, position_qty, position_avg, freeze_until_tick)
       VALUES (?, ?, 50000000, 0, 0, 0, 0, 0)`,
    ).run(matchId, userId);
    this.insiderTips.delete(matchId);
    this.matchTicks.set(matchId, 0);
  }

  // ============================================================
  // 操作
  // ============================================================

  async action(body: {
    matchId: string;
    userId: string;
    type: 'pump' | 'press' | 'accumulate' | 'distribute' | 'wash' | 'spoof' | 'fake';
    power: number;
    symbol: string;
  }): Promise<ApiResponse<{ resources: DealerResources; effect: any }>> {
    const { matchId, userId, symbol } = body;
    const type = normalizeDealerToolType(body.type);
    const power = Math.max(1, Math.min(100, Math.floor(body.power ?? 50)));

    const r = this.resources(matchId, userId);
    const quote = this.engine.getQuote(symbol);
    if (!quote) return Fail(`未知标的 ${symbol}`);
    const curPrice = quote.price;
    const prevClose = quote.prevClose || curPrice;
    const upper = prevClose * (1 + PRICE_LIMIT_PCT);
    const lower = prevClose * (1 - PRICE_LIMIT_PCT);

    const cost = computeDealerActionCost(type, symbol, power);
    const effectPct = computeDealerActionEffect(type, symbol, power, cost);
    const riskIncrease = computeDealerRiskIncrease(type, effectPct);

    let revenue = 0;

    // 涨跌停预检
    if (type === 'pump' && curPrice >= upper - 0.0001) {
      return Fail(`已达涨停（${(upper).toFixed(2)} 元），无法再拉升`);
    }
    if (type === 'press' && curPrice <= lower + 0.0001) {
      return Fail(`已达跌停（${(lower).toFixed(2)} 元），无法再压价`);
    }
    if (type === 'accumulate' && curPrice >= upper - 0.0001) {
      return Fail(`已达涨停，无法建仓`);
    }
    if (type === 'distribute' && curPrice <= lower + 0.0001) {
      return Fail(`已达跌停，无法出货`);
    }

    if (r.cash < cost) return Fail(`资金不足: 需要 ¥${cost.toLocaleString()}，可用 ¥${r.cash.toLocaleString()}`);

    const lock = this.restrictions.isDealerToolsLocked(matchId, symbol);
    if (lock.locked) {
      return Fail(`工具被冻结，剩余 ${lock.remainingTicks} tick`);
    }

    const freezeRow = this.db.prepare(`SELECT freeze_until_tick FROM dealer_state WHERE match_id = ? AND user_id = ?`).get(matchId, userId) as any;
    const currentTick = this.matchSvc.getCurrentTick(matchId);
    if (freezeRow && freezeRow.freeze_until_tick > currentTick) {
      return Fail(`庄家已被监管冻结，还剩 ${freezeRow.freeze_until_tick - currentTick} tick`);
    }

    let effect: any = { effectPct, cost, riskIncrease };
    switch (type) {
      case 'pump': {
        const mult = 1 + effectPct / 100;
        const newQuote = this.engine.bumpPrice(symbol, mult);
        if (newQuote && newQuote.price > upper) {
          this.engine.setPrice(symbol, upper);
        }
        const finalQuote = this.engine.getQuote(symbol);
        effect = { ...effect, newPrice: finalQuote?.price, upper, lower };
        break;
      }
      case 'press': {
        const mult = 1 - effectPct / 100;
        const newQuote = this.engine.bumpPrice(symbol, mult);
        if (newQuote && newQuote.price < lower) {
          this.engine.setPrice(symbol, lower);
        }
        const finalQuote = this.engine.getQuote(symbol);
        effect = { ...effect, newPrice: finalQuote?.price, upper, lower };
        break;
      }
      case 'accumulate': {
        const qty = power * 100;
        const txAcc = this.db.transaction(() => {
          const row = this.db.prepare(
            `SELECT position_qty, position_avg FROM dealer_state WHERE match_id = ? AND user_id = ?`,
          ).get(matchId, userId) as any;
          const oldQty = row?.position_qty ?? 0;
          const oldAvg = row?.position_avg ?? 0;
          const newQty = oldQty + qty;
          const newAvg = (oldQty * oldAvg + qty * curPrice) / newQty;
          this.db.prepare(
            `UPDATE dealer_state SET position_qty = ?, position_avg = ?, position_symbol = ? WHERE match_id = ? AND user_id = ?`,
          ).run(newQty, newAvg, symbol, matchId, userId);
        });
        txAcc();
        const volFactor = 1 + effectPct / 100;
        this.engine.bumpVolume(symbol, volFactor);
        effect = { ...effect, accumulatedQty: qty, price: curPrice, volumeFactor: volFactor, upper, lower };
        break;
      }
      case 'distribute': {
        const txDis = this.db.transaction(() => {
          const row = this.db.prepare(
            `SELECT position_qty, position_avg FROM dealer_state WHERE match_id = ? AND user_id = ?`,
          ).get(matchId, userId) as any;
          const oldQty = row?.position_qty ?? 0;
          const oldAvg = row?.position_avg ?? 0;
          if (oldQty <= 0) return;
          const sellQty = Math.min(power * 100, oldQty);
          revenue = sellQty * curPrice;
          const newQty = oldQty - sellQty;
          const newAvg = newQty > 0 ? oldAvg : 0;
          const priceMult = 1 - (effectPct * 0.3) / 100;
          this.engine.bumpPrice(symbol, priceMult);
          const volFactor = 1 + effectPct / 100;
          this.engine.bumpVolume(symbol, volFactor);
          this.db.prepare(
            `UPDATE dealer_state
                SET position_qty = ?, position_avg = ?, cash = cash + ?
              WHERE match_id = ? AND user_id = ?`,
          )?.run(newQty, newAvg, revenue, matchId, userId);
        });
        txDis();
        effect = { ...effect, distributedQty: power * 100, price: curPrice, revenue, upper, lower };
        break;
      }
      case 'wash': {
        const factor = 1 + effectPct / 100;
        this.engine.bumpVolume(symbol, factor);
        effect = { ...effect, volumeFactor: factor, upper, lower };
        break;
      }
      case 'spoof': {
        const level = Math.max(1, Math.min(5, power % 5 || Math.ceil(power / 20)));
        this.engine.spoofOrderBook(symbol, level, 3000);
        effect = { ...effect, level, upper, lower };
        break;
      }
    }

    const newRisk = Math.min(MAX_RISK, r.riskIndex + riskIncrease);
    const newCash = r.cash - cost + revenue;
    this.db.prepare(
      `UPDATE dealer_state SET cash = ?, risk_index = ? WHERE match_id = ? AND user_id = ?`,
    ).run(newCash, newRisk, matchId, userId);

    return Ok({
      resources: { cash: newCash, energy: 0, riskIndex: newRisk },
      effect,
    });
  }

  /**
   * 预估 cost / effect / risk（前端 power 滑块实时调）。
   */
  previewCost(
    type: 'pump' | 'press' | 'accumulate' | 'distribute' | 'wash' | 'spoof' | 'fake',
    power: number,
    symbol: string,
  ): { cost: number; effectPct: number; riskIncrease: number; upper: number; lower: number; prevClose: number } {
    const quote = this.engine.getQuote(symbol);
    const prevClose = quote?.prevClose ?? quote?.price ?? 0;
    const upper = prevClose * (1 + PRICE_LIMIT_PCT);
    const lower = prevClose * (1 - PRICE_LIMIT_PCT);
    if (!quote) return { cost: 0, effectPct: 0, riskIncrease: 0, upper, lower, prevClose };
    const p = Math.max(1, Math.min(100, Math.floor(power)));
    const { cost, effectPct, riskIncrease } = previewDealerAction(type, symbol, p);
    return { cost, effectPct, riskIncrease, upper, lower, prevClose };
  }

  insider(body: { matchId: string; userId: string }): ApiResponse<{ trustworthy: boolean; tip: string; direction: 'up' | 'down' }> {
    const cost = 2000;
    const state = this.matchSvc.getUserMatchState(body.matchId, body.userId);
    if (!state) return Fail('用户未在该对局', 404);
    if (state.cash < cost) return Fail(`资金不足: 需要 ¥${cost.toLocaleString()}，可用 ¥${state.cash.toLocaleString()}`);

    const trustworthy = Math.random() < 0.6;
    const direction: 'up' | 'down' = Math.random() < 0.5 ? 'up' : 'down';

    const REAL_TIPS = {
      up:   '机构正在大举建仓，主力资金持续流入（利好在即）',
      down: '主力资金持续出逃，警惕即将到来的回调（利空在即）',
    };
    const FAKE_TIPS = [
      '坊间传闻公司将被收购（已证伪）',
      '明日有重大利好公告（虚假信息）',
      '高管即将集体增持（信息有误）',
    ];
    const tip = trustworthy ? REAL_TIPS[direction] : FAKE_TIPS[Math.floor(Math.random() * FAKE_TIPS.length)];

    this.matchSvc.setUserMatchState(body.matchId, body.userId, { cash: state.cash - cost });

    const expiresTick = (this.matchTicks.get(body.matchId) ?? 0) + 20;
    this.insiderTips.set(body.matchId, { direction: trustworthy ? direction : null, trustworthy, expiresTick });

    this.db.prepare(
      `INSERT INTO alerts (id, match_id, user_id, severity, title, description, source, index_type, resolved, created_at)
       VALUES (?, ?, ?, 'medium', ?, ?, 'Insider Trading Monitor', 'insider', 0, ?)`,
    ).run(
      `alert_${uuidv4().slice(0, 8)}`,
      body.matchId,
      body.userId,
      '内幕交易嫌疑',
      `检测到用户购买了内部消息（费用 ¥${cost.toLocaleString()}），触发监管告警`,
      Date.now(),
    );

    return Ok({ trustworthy, tip, direction: trustworthy ? direction : 'up' });
  }

  consumeInsiderTip(matchId: string): 'bullish' | 'bearish' | null {
    const tip = this.insiderTips.get(matchId);
    if (!tip || !tip.trustworthy || !tip.direction) return null;
    const tick = this.matchTicks.get(matchId) ?? 0;
    if (tick > tip.expiresTick) {
      this.insiderTips.delete(matchId);
      return null;
    }
    return tip.direction === 'up' ? 'bullish' : 'bearish';
  }
}

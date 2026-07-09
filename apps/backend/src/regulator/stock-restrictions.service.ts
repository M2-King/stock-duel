import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MatchService } from '../match/match.service';
import { MarketEngine } from '../market/market.engine';
import {
  DEFAULT_TRADE_MAX_DAILY,
  DEFAULT_TRADE_MAX_SINGLE,
  FREEZE_DAILY_RATIO,
  FREEZE_SINGLE_RATIO,
  FREEZE_TICKS,
  WARN_DAILY_RATIO,
  WARN_SINGLE_RATIO,
  WARN_TICKS,
} from '../common/trade-limits';

export type RestrictionType = 'warn' | 'freeze';

export interface StockRestriction {
  matchId: string;
  symbol: string;
  maxSingle: number;
  maxDaily: number;
  expiresTick: number;
  toolsLockedUntilTick: number;
  restrictionType: RestrictionType;
  reason?: string;
}

@Injectable()
export class StockRestrictionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly matchSvc: MatchService,
    private readonly engine: MarketEngine,
  ) {}

  private rowToRestriction(row: any): StockRestriction {
    return {
      matchId: row.match_id,
      symbol: row.symbol,
      maxSingle: row.max_single,
      maxDaily: row.max_daily,
      expiresTick: row.expires_tick,
      toolsLockedUntilTick: row.tools_locked_until_tick ?? 0,
      restrictionType: (row.restriction_type ?? 'freeze') as RestrictionType,
      reason: row.reason,
    };
  }

  getActive(matchId: string, symbol: string): StockRestriction | null {
    const currentTick = this.matchSvc.getCurrentTick(matchId);
    const row = this.db.prepare(
      `SELECT * FROM stock_restrictions
        WHERE match_id = ? AND symbol = ? AND expires_tick > ?`,
    ).get(matchId, symbol, currentTick) as any;
    if (!row) return null;
    return this.rowToRestriction(row);
  }

  computeDynamicLimits(symbol: string, type: RestrictionType): { maxSingle: number; maxDaily: number } {
    const avgTick = this.engine.getAvgTurnoverLastTicks(symbol, 30);
    const avgDaily = this.engine.getAvgDailyTurnoverLastDays(symbol, 5);
    const singleRatio = type === 'warn' ? WARN_SINGLE_RATIO : FREEZE_SINGLE_RATIO;
    const dailyRatio = type === 'warn' ? WARN_DAILY_RATIO : FREEZE_DAILY_RATIO;
    const maxSingle = Math.max(10_000, Math.floor(avgTick * singleRatio));
    const maxDaily = Math.max(50_000, Math.floor(avgDaily * dailyRatio));
    return { maxSingle, maxDaily };
  }

  private upsertRestriction(
    matchId: string,
    symbol: string,
    type: RestrictionType,
    durationTicks: number,
    reason: string,
    lockTools: boolean,
  ): StockRestriction {
    const currentTick = this.matchSvc.getCurrentTick(matchId);
    const expiresTick = currentTick + durationTicks;
    const toolsLockedUntilTick = lockTools ? expiresTick : 0;
    const { maxSingle, maxDaily } = this.computeDynamicLimits(symbol, type);
    const now = Date.now();
    this.db.prepare(
      `INSERT OR REPLACE INTO stock_restrictions
         (match_id, symbol, max_single, max_daily, expires_tick, tools_locked_until_tick, restriction_type, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(matchId, symbol, maxSingle, maxDaily, expiresTick, toolsLockedUntilTick, type, reason, now);
    return {
      matchId,
      symbol,
      maxSingle,
      maxDaily,
      expiresTick,
      toolsLockedUntilTick,
      restrictionType: type,
      reason,
    };
  }

  applyWarn(matchId: string, symbol: string, reason: string): StockRestriction {
    return this.upsertRestriction(matchId, symbol, 'warn', WARN_TICKS, reason, false);
  }

  applyFreeze(matchId: string, symbol: string, reason: string): StockRestriction {
    return this.upsertRestriction(matchId, symbol, 'freeze', FREEZE_TICKS, reason, true);
  }

  isDealerToolsLocked(matchId: string, symbol: string): { locked: boolean; remainingTicks: number } {
    const currentTick = this.matchSvc.getCurrentTick(matchId);
    const row = this.db.prepare(
      `SELECT tools_locked_until_tick FROM stock_restrictions
        WHERE match_id = ? AND symbol = ? AND tools_locked_until_tick > ?`,
    ).get(matchId, symbol, currentTick) as any;
    if (!row) return { locked: false, remainingTicks: 0 };
    const remaining = Math.max(0, row.tools_locked_until_tick - currentTick);
    return { locked: remaining > 0, remainingTicks: remaining };
  }

  getDailyTradedAmount(matchId: string, userId: string, symbol: string): number {
    const day = this.matchSvc.getCurrentDay(matchId);
    const row = this.db.prepare(
      `SELECT amount FROM stock_trade_daily
        WHERE match_id = ? AND user_id = ? AND symbol = ? AND day = ?`,
    ).get(matchId, userId, symbol, day) as any;
    return row?.amount ?? 0;
  }

  recordTrade(matchId: string, userId: string, symbol: string, amount: number) {
    const day = this.matchSvc.getCurrentDay(matchId);
    const existing = this.getDailyTradedAmount(matchId, userId, symbol);
    this.db.prepare(
      `INSERT OR REPLACE INTO stock_trade_daily (match_id, user_id, symbol, day, amount)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(matchId, userId, symbol, day, existing + amount);
  }

  validateTrade(
    matchId: string,
    userId: string,
    symbol: string,
    amount: number,
  ): { ok: true } | { ok: false; message: string } {
    const currentTick = this.matchSvc.getCurrentTick(matchId);
    const row = this.db.prepare(
      `SELECT * FROM stock_restrictions
        WHERE match_id = ? AND symbol = ? AND expires_tick > ?`,
    ).get(matchId, symbol, currentTick) as any;
    if (!row) return { ok: true };

    const toolsLockedUntil = row.tools_locked_until_tick ?? 0;
    if (toolsLockedUntil > currentTick) {
      const remaining = toolsLockedUntil - currentTick;
      return { ok: false, message: `操作被冻结 ${remaining} tick` };
    }

    const maxSingle = row.max_single ?? DEFAULT_TRADE_MAX_SINGLE;
    const maxDaily = row.max_daily ?? DEFAULT_TRADE_MAX_DAILY;
    if (amount > maxSingle) {
      return { ok: false, message: `单笔限额 ¥${maxSingle.toLocaleString()}` };
    }
    const dailyUsed = this.getDailyTradedAmount(matchId, userId, symbol);
    if (dailyUsed + amount > maxDaily) {
      return { ok: false, message: `日限额 ¥${maxDaily.toLocaleString()}` };
    }
    return { ok: true };
  }
}

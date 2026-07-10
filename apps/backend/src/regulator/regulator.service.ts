import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { Ok, Fail, ApiResponse } from '../common/response';
import { Alert, RegulatoryScores } from '../common/types';
import { DealerService } from '../dealer/dealer.service';
import { MatchService } from '../match/match.service';
import { StockRestrictionsService, StockRestriction } from './stock-restrictions.service';
import { FREEZE_TICKS, WARN_TICKS } from '../common/trade-limits';

/**
 * 监管系统：
 *   - 指数联动自动告警（监管不可见具体指数，仅见公开市场信号）
 *   - 执法：warn / freeze（按股票限制交易+锁定庄家工具）/ kick（罚款+判负）
 *   - 正义分：正确执法 +10，误判 -5
 */

const FIVE_MIN = 5 * 60 * 1000;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export type RegulatorEventEmitter = (
  event: string,
  payload: any,
  matchId: string,
) => void;

@Injectable()
export class RegulatorService {
  private readonly logger = new Logger(RegulatorService.name);

  private scores = new Map<string, RegulatoryScores>();
  private lastTrigger = new Map<string, { manipulation: number; insider: number; misinformation: number }>();
  private emitEvent?: RegulatorEventEmitter;

  constructor(
    private readonly db: DatabaseService,
    private readonly dealer: DealerService,
    private readonly matchSvc: MatchService,
    private readonly restrictions: StockRestrictionsService,
  ) {}

  setEventEmitter(emitter: RegulatorEventEmitter) {
    this.emitEvent = emitter;
  }

  // ============================================================
  // 指数查询 / 累加
  // ============================================================

  getScores(matchId: string): RegulatoryScores {
    return this.scores.get(matchId) || { manipulation: 0, insider: 0, misinformation: 0 };
  }

  getJusticeScore(matchId: string): number {
    return this.matchSvc.getJusticeScore(matchId);
  }

  adjust(matchId: string, delta: Partial<RegulatoryScores>) {
    const cur = this.getScores(matchId);
    const next: RegulatoryScores = {
      manipulation: clamp(cur.manipulation + (delta.manipulation ?? 0)),
      insider: clamp(cur.insider + (delta.insider ?? 0)),
      misinformation: clamp(cur.misinformation + (delta.misinformation ?? 0)),
    };
    this.scores.set(matchId, next);
    this.maybeTriggerAlerts(matchId);
    return next;
  }

  decay(matchId: string) {
    const cur = this.getScores(matchId);
    const next: RegulatoryScores = {
      manipulation: Math.max(0, cur.manipulation - 0.05),
      insider: Math.max(0, cur.insider - 0.05),
      misinformation: Math.max(0, cur.misinformation - 0.05),
    };
    this.scores.set(matchId, next);
  }

  reset(matchId: string) {
    this.scores.set(matchId, { manipulation: 0, insider: 0, misinformation: 0 });
    this.lastTrigger.delete(matchId);
    this.db.prepare(`UPDATE matches SET justice_score = 0 WHERE id = ?`).run(matchId);
  }

  // ============================================================
  // Alert 创建与列表
  // ============================================================

  maybeTriggerAlerts(matchId: string) {
    const s = this.getScores(matchId);
    const now = Date.now();
    const last = this.lastTrigger.get(matchId) ?? { manipulation: 0, insider: 0, misinformation: 0 };

    const tryFire = (key: keyof RegulatoryScores, threshold: number, title: string, symbol?: string) => {
      if ((s[key] as number) <= threshold) return;
      if (now - (last[key] as number) < FIVE_MIN) return;
      last[key] = now;
      const id = `idx_${key}_${now}`;
      this.db.prepare(
        `INSERT INTO alerts (id, match_id, user_id, symbol, severity, title, description, source, index_type, resolved, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 'Index Threshold Monitor', ?, 0, ?)`,
      ).run(
        id,
        matchId,
        symbol ?? null,
        (s[key] as number) > 80 ? 'high' : 'medium',
        title,
        `${title} — 市场出现异常波动信号`,
        key,
        now,
      );
      this.emitEvent?.('alert:new', { id, matchId, severity: (s[key] as number) > 80 ? 'high' : 'medium', title }, matchId);
    };

    tryFire('manipulation', 60, '价格异常波动');
    tryFire('insider', 50, '成交量异常放大');
    tryFire('misinformation', 40, '技术指标极端偏离');

    this.lastTrigger.set(matchId, last);
  }

  pushAlert(alert: {
    matchId: string;
    userId?: string;
    symbol?: string;
    severity: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    source: string;
    indexType?: 'manipulation' | 'insider' | 'misinformation';
  }) {
    const id = `alert_${uuidv4().slice(0, 8)}`;
    // Strip player identity from regulator-visible description
    const publicDesc = alert.description.replace(/用户\s*\S+/g, '某交易者').replace(/user_id=\S+/gi, '');
    this.db.prepare(
      `INSERT INTO alerts (id, match_id, user_id, symbol, severity, title, description, source, index_type, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      id,
      alert.matchId,
      alert.userId ?? null,
      alert.symbol ?? null,
      alert.severity,
      alert.title,
      publicDesc,
      alert.source,
      alert.indexType ?? null,
      Date.now(),
    );
    return id;
  }

  alerts(matchId: string, onlyUnresolved = true): ApiResponse<Alert[]> {
    const sql = onlyUnresolved
      ? `SELECT * FROM alerts WHERE match_id = ? AND resolved = 0 ORDER BY created_at DESC LIMIT 200`
      : `SELECT * FROM alerts WHERE match_id = ? ORDER BY created_at DESC LIMIT 200`;
    const rows = this.db.prepare(sql).all(matchId) as any[];
    const list: Alert[] = rows.map((r) => ({
      id: r.id,
      matchId: r.match_id,
      // userId intentionally omitted from API response for regulator privacy
      symbol: r.symbol,
      severity: r.severity,
      title: r.title,
      description: r.description,
      timestamp: r.created_at,
      source: r.source,
      resolved: !!r.resolved,
      indexType: r.index_type,
    }));
    return Ok(list);
  }

  // ============================================================
  // 执法
  // ============================================================

  private applyJusticeDelta(matchId: string, symbol: string | null) {
    const manipulation = this.getScores(matchId).manipulation;
    let delta = 0;
    if (manipulation > 50) delta = 10;
    else if (manipulation < 30) delta = -5;
    if (delta === 0) return { delta: 0, justiceScore: this.matchSvc.getJusticeScore(matchId) };
    const justiceScore = this.matchSvc.adjustJusticeScore(matchId, delta);
    this.logger.log(`Justice ${delta > 0 ? '+' : ''}${delta} for ${matchId}/${symbol ?? '?'} (manipulation=${manipulation.toFixed(1)})`);
    return { delta, justiceScore };
  }

  private ensureAlert(matchId: string, alertId: string, symbol: string, title = '异常信号'): any {
    const existing = this.db.prepare(`SELECT * FROM alerts WHERE id = ? AND match_id = ?`).get(alertId, matchId) as any;
    if (existing) return existing;
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO alerts (id, match_id, user_id, symbol, severity, title, description, source, index_type, resolved, created_at)
       VALUES (?, ?, NULL, ?, 'medium', ?, ?, 'Regulator Panel', NULL, 0, ?)`,
    ).run(alertId, matchId, symbol, title, `${title} — 监管面板检测`, now);
    return this.db.prepare(`SELECT * FROM alerts WHERE id = ? AND match_id = ?`).get(alertId, matchId);
  }

  private computePositionValueInStock(matchId: string, userId: string, symbol: string): number {
    const pos = this.db.prepare(
      `SELECT quantity FROM positions WHERE match_id = ? AND user_id = ? AND symbol = ?`,
    ).get(matchId, userId, symbol) as any;
    let qty = pos?.quantity ?? 0;
    const dealer = this.db.prepare(
      `SELECT position_qty, position_symbol FROM dealer_state WHERE match_id = ? AND user_id = ?`,
    ).get(matchId, userId) as any;
    if (dealer?.position_symbol === symbol) {
      qty += dealer.position_qty ?? 0;
    }
    if (qty <= 0) return 0;
    const quote = this.matchSvc.getQuotePrice(symbol);
    return qty * quote;
  }

  private emitRestriction(matchId: string, restriction: StockRestriction, event: 'regulator:freeze' | 'regulator:warn') {
    const currentTick = this.matchSvc.getCurrentTick(matchId);
    const durationTicks = restriction.restrictionType === 'warn' ? WARN_TICKS : FREEZE_TICKS;
    this.emitEvent?.(event, {
      matchId,
      symbol: restriction.symbol,
      maxSingle: restriction.maxSingle,
      maxDaily: restriction.maxDaily,
      expiresTick: restriction.expiresTick,
      toolsLockedUntilTick: restriction.toolsLockedUntilTick,
      restrictionType: restriction.restrictionType,
      currentTick,
      durationTicks,
    }, matchId);
  }

  resolve(body: {
    matchId: string;
    alertId: string;
    action: 'warn' | 'freeze' | 'kick' | 'dismiss';
    symbol?: string;
    regulatorUserId?: string;
  }): ApiResponse<{ effect: any; scores: RegulatoryScores; justiceScore: number; alertId: string }> {
    const { matchId, alertId, action } = body;
    const matchRes = this.matchSvc.getMatch(matchId);
    const defaultSymbol = matchRes.code === 0 ? (matchRes.data as any)?.symbol : undefined;
    const symbol = body.symbol ?? defaultSymbol ?? 'QDN';

    const alert = this.ensureAlert(matchId, alertId, symbol);
    if (!alert) return Fail('告警不存在');

    const penalizedUserId = alert.user_id || this.matchSvc.findDealerUserId(matchId);
    let effect: any = { alertId, symbol };
    let scoreDelta: RegulatoryScores = { manipulation: 0, insider: 0, misinformation: 0 };
    let justiceScore = this.matchSvc.getJusticeScore(matchId);

    if (action === 'warn') {
      const restriction = this.restrictions.applyWarn(matchId, symbol, '监管警告');
      scoreDelta = { manipulation: -2, insider: -2, misinformation: -2 };
      effect = {
        alertId,
        warned: true,
        symbol,
        maxSingle: restriction.maxSingle,
        maxDaily: restriction.maxDaily,
        expiresTick: restriction.expiresTick,
        restrictionType: 'warn',
        durationTicks: WARN_TICKS,
      };
      this.emitRestriction(matchId, restriction, 'regulator:warn');
    } else if (action === 'freeze') {
      const restriction = this.restrictions.applyFreeze(matchId, symbol, '监管冻结');
      effect = {
        alertId,
        symbol,
        maxSingle: restriction.maxSingle,
        maxDaily: restriction.maxDaily,
        expiresTick: restriction.expiresTick,
        toolsLockedUntilTick: restriction.toolsLockedUntilTick,
        restrictionType: 'freeze',
        durationTicks: FREEZE_TICKS,
      };
      this.emitRestriction(matchId, restriction, 'regulator:freeze');
    } else if (action === 'kick') {
      if (!penalizedUserId) return Fail('无法确定处罚对象');

      const positionValue = this.computePositionValueInStock(matchId, penalizedUserId, symbol);
      const totalAssets = this.matchSvc.computeTotalAssets(matchId, penalizedUserId);
      const fine = positionValue > 0
        ? Math.floor(positionValue * 0.3)
        : Math.floor(totalAssets * 0.1);
      const opponentId = this.matchSvc.findOpponent(matchId, penalizedUserId);

      const penalizedState = this.matchSvc.getUserMatchState(matchId, penalizedUserId);
      if (penalizedState) {
        const newCash = Math.max(0, penalizedState.cash - fine);
        this.matchSvc.setUserMatchState(matchId, penalizedUserId, { cash: newCash });
      }

      if (opponentId) {
        const oppState = this.matchSvc.getUserMatchState(matchId, opponentId);
        if (oppState) {
          this.matchSvc.setUserMatchState(matchId, opponentId, { cash: oppState.cash + fine });
        }
      }

      scoreDelta = { manipulation: -5, insider: -5, misinformation: -5 };
      effect = { alertId, fine, penalizedUserId, opponentId, symbol, positionValue, totalAssets };

      this.emitEvent?.('regulator:kick', {
        matchId,
        penalizedUserId,
        opponentId,
        fine,
        symbol,
      }, matchId);

      if (opponentId) {
        this.matchSvc.endMatch(matchId, opponentId);
      }
    } else if (action === 'dismiss') {
      scoreDelta = { manipulation: -0.5, insider: -0.5, misinformation: -0.5 };
      effect = { alertId, dismissed: true };
    }

    if (action === 'freeze' || action === 'kick') {
      const justice = this.applyJusticeDelta(matchId, symbol);
      justiceScore = justice.justiceScore;
      effect.justiceDelta = justice.delta;
    }

    const next = this.adjust(matchId, scoreDelta);
    this.db.prepare(`UPDATE alerts SET resolved = 1 WHERE id = ?`).run(alertId);

    return Ok({ effect, scores: next, justiceScore, alertId });
  }

  settlement(matchId: string, userId: string, role: 'dealer' | 'retail' | 'regulator', finalAssets: number, initialAssets = 100_000_000) {
    if (role === 'dealer') {
      const r = this.dealer.resources(matchId, userId);
      const profit = finalAssets - initialAssets;
      const riskThreshold = 50;
      let penalty = 0;
      let note = '';
      if (profit > 0 && r.riskIndex < riskThreshold) {
        penalty = finalAssets;
        note = `庄家盈利但 riskIndex<${riskThreshold}，被抓清零`;
      } else if (r.riskIndex >= 80) {
        penalty = Math.floor(finalAssets * 0.5);
        note = `riskIndex ${r.riskIndex.toFixed(1)} 过高，罚款 50% 资产`;
      }
      return Ok({ role, note, penalty, finalAssets: finalAssets - penalty, riskIndex: r.riskIndex });
    }
    if (role === 'retail') {
      const returnRate = ((finalAssets - initialAssets) / initialAssets) * 100;
      return Ok({ role, returnRate, finalAssets });
    }
    if (role === 'regulator') {
      const justiceScore = this.matchSvc.getJusticeScore(matchId);
      const won = justiceScore > 50;
      const failed = justiceScore < 0;
      return Ok({
        role,
        justiceScore,
        won,
        failed,
        outcome: won ? '监管胜利' : failed ? '监管失败' : '监管平局',
        scores: this.getScores(matchId),
      });
    }
    return Fail('未知角色', 400);
  }
}

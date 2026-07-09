import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MarketEngine } from '../market/market.engine';
import { Ok, Fail, ApiResponse } from '../common/response';

/**
 * 录像系统。
 *   - 对局结束（MatchService.endMatch 之后）触发 saveRecording，序列化 tickLog + 关键 metadata。
 *   - GET /api/replay/:matchId → 返回录像数据
 *
 * Note:
 *   这里只快照每 tick 的行情 + 盘口 + 价格；成交记录从 orders 表按 match_id 拉。
 *   录像数据 ≈ 一份 tick-by-tick 的 series，供前端可视化"回放"。
 */
@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly engine: MarketEngine,
  ) {}

  saveRecording(matchId: string) {
    const tickLog = this.engine.getTickLog(matchId);
    if (tickLog.length === 0) {
      this.logger.warn(`saveRecording: empty tickLog for ${matchId}`);
      return;
    }
    const matchRow = this.db.prepare(`SELECT * FROM matches WHERE id = ?`).get(matchId) as any;
    const orders = this.db.prepare(`SELECT * FROM orders WHERE match_id = ? ORDER BY created_at`).all(matchId);
    const alerts = this.db.prepare(`SELECT * FROM alerts WHERE match_id = ? ORDER BY created_at`).all(matchId);

    const recording = {
      match: matchRow,
      orders,
      alerts,
      ticks: tickLog,
    };

    const totalTicks = tickLog.length;
    const duration = tickLog.length > 0 ? tickLog[tickLog.length - 1].time - tickLog[0].time : 0;

    // upsert — 录像 key = matchId
    this.db.prepare(
      `INSERT OR REPLACE INTO match_recordings (match_id, recording_data, duration, total_ticks, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      matchId,
      JSON.stringify(recording),
      duration,
      totalTicks,
      Date.now(),
    );
    this.logger.log(`Recording saved for match ${matchId} (${totalTicks} ticks, ${Math.round(duration / 1000)}s)`);
  }

  load(matchId: string): ApiResponse<any> {
    const row = this.db.prepare(`SELECT * FROM match_recordings WHERE match_id = ?`).get(matchId) as any;
    if (!row) return Fail('录像不存在', 404);
    let data: any;
    try {
      data = JSON.parse(row.recording_data);
    } catch (e: any) {
      return Fail(`录像数据损坏: ${e.message}`);
    }
    return Ok({
      matchId,
      duration: row.duration,
      totalTicks: row.total_ticks,
      createdAt: row.created_at,
      data,
    });
  }

  list(): ApiResponse<Array<{ matchId: string; totalTicks: number; duration: number; createdAt: number }>> {
    const rows = this.db.prepare(`SELECT match_id, total_ticks, duration, created_at FROM match_recordings ORDER BY created_at DESC LIMIT 100`).all() as any[];
    return Ok(rows.map((r) => ({
      matchId: r.match_id,
      totalTicks: r.total_ticks,
      duration: r.duration,
      createdAt: r.created_at,
    })));
  }
}

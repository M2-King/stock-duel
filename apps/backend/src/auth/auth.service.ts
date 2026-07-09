import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { Fail, Ok, ApiResponse } from '../common/response';
import { UserDto } from '../common/types';

const AVATAR_POOL = ['🦊', '🐯', '🐺', '🐉', '🦅', '🦂', '🦁', '🐍'];
const ADJECTIVES = [
  'Quantum', 'Lucky', 'Silent', 'Iron', 'Bold', 'Quick', 'Wise', 'Dark',
  'Bright', 'Cold', 'Fierce', 'Sharp', 'Swift', 'Witty', 'Sneaky', 'Royal',
];
const NOUNS = [
  'Whale', 'Tiger', 'Falcon', 'Shark', 'Bear', 'Wolf', 'Hawk', 'Fox',
  'Lion', 'Panther', 'Eagle', 'Cobra', 'Raven', 'Phoenix', 'Crane', 'Otter',
];

const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Auth 模块：用 token 直接当 session 凭证。
 * - POST /api/auth/guest → { userId, token, username, ...profile }
 * - POST /api/auth/verify → 校验 token 是否有效
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private readonly db: DatabaseService) {}

  private genUsername() {
    const num = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `${pick(ADJECTIVES)}${pick(NOUNS)}_${num}`;
  }

  /**
   * Create a guest user. Returns userId, token, and the full profile.
   * If the same clientId shows up twice we just return the cached profile.
   *
   * Note: the parameter is misnamed `clientId` here — the controller always
   * passes the client-supplied userId (e.g. `guest_xxxxxxxx` from
   * localStorage), never a real token. Real tokens are validated by `verify`.
   * We must use it AS-IS; splitting on `_` would chop off the `guest_` prefix
   * and cause the WS session.userId (derived from this id) to differ from
   * match.player1_id (also derived from the same client id), so join-match
   * would reject with "user not in match".
   */
  guestLogin(clientId?: string): ApiResponse<{ user: UserDto; token: string }> {
    // Reconnect path: client may pass an existing session token instead of userId.
    if (clientId?.startsWith('tk_')) {
      const verified = this.verify(clientId);
      if (verified.code !== 0 || !verified.data) return Fail('token 无效', 401);
      return Ok({ user: verified.data.user, token: clientId });
    }

    // Allow client to bring its own UUID (e.g. localStorage), making reconnects idempotent.
    const userId = clientId || uuidv4();
    const finalToken = `tk_${userId}_${uuidv4().replace(/-/g, '')}`;
    this.logger.log(`guestLogin clientId=${clientId ?? '<none>'} → userId=${userId}`);

    const existing = this.db
      .prepare('SELECT id, token FROM users WHERE id = ?')
      .get(userId) as { id: string; token: string } | undefined;

    if (existing) {
      const row = this.db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(userId) as any;
      return Ok({ user: this.toDto(row), token: existing.token });
    }

    const username = this.genUsername();
    const avatar = pick(AVATAR_POOL);

    this.db
      .prepare(
        `INSERT INTO users
          (id, username, avatar, level, balance, total_matches, wins, losses,
           win_streak, best_return, total_pnl, token, created_at)
         VALUES (?, ?, ?, 1, 100000000, 0, 0, 0, 0, 0, 0, ?, ?)`,
      )
      .run(userId, username, avatar, finalToken, Date.now());

    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as any;
    return Ok({ user: this.toDto(row), token: finalToken });
  }

  verify(token: string): ApiResponse<{ user: UserDto }> {
    if (!token) return Fail('缺少 token', 401);
    const row = this.db
      .prepare('SELECT * FROM users WHERE token = ?')
      .get(token) as any;
    if (!row) return Fail('token 无效', 401);
    return Ok({ user: this.toDto(row) });
  }

  toDto(row: any): UserDto {
    return {
      id: row.id,
      username: row.username,
      avatar: row.avatar,
      level: row.level,
      balance: row.balance,
      totalMatches: row.total_matches,
      wins: row.wins,
      losses: row.losses,
      winStreak: row.win_streak,
      bestReturn: row.best_return,
      totalPnl: row.total_pnl,
      createdAt: row.created_at,
    };
  }

  /**
   * Stat helpers — called by the trading / match-end services to update
   * aggregate counters after a finished match. Keep them here so DB writes
   * for the users table are all in one file.
   */
  bumpMatchResult(userId: string, won: boolean, pnl: number, returnRate: number) {
    const tx = this.db.transaction(() => {
      const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
      if (!row) return;
      const wins = row.wins + (won ? 1 : 0);
      const losses = row.losses + (won ? 0 : 1);
      const winStreak = won ? row.win_streak + 1 : 0;
      const bestReturn = Math.max(row.best_return, returnRate);
      this.db
        .prepare(
          `UPDATE users
              SET total_matches = total_matches + 1,
                  wins = ?, losses = ?, win_streak = ?,
                  best_return = ?, total_pnl = total_pnl + ?
            WHERE id = ?`,
        )
        .run(wins, losses, winStreak, bestReturn, pnl, userId);
    });
    tx();
  }
}

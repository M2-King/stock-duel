import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { MarketEngine } from '../market/market.engine';
import { ReplayService } from '../replay/replay.service';
import { Ok, Fail, ApiResponse } from '../common/response';
import { Role } from '../common/types';

/**
 * 匹配系统：
 *   - 快速匹配：FIFO 队列攒 2 人 → 创建对局 → 一人 dealer、另一人 retail（或自动分配角色）。
 *   - 房间码：6 位 base32 字符，createRoom / joinRoom。
 *   - 周期性清理：空房间、断线、对局结束后的内存回收。
 */

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const EMPTY_ROOM_MS = 5 * 60 * 1000;
const ALL_DISCONNECT_MS = 60 * 1000;
const QUICK_MATCH_TIMEOUT_MS = 2 * 60 * 1000;
const MATCH_END_CLEANUP_MS = 30 * 1000;
const RECONNECT_MS = 30 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const ROOM_COUNTDOWN_MS = 3 * 1000;

const generateRoomCode = (): string => {
  let s = '';
  for (let i = 0; i < 6; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
};

const newMatchId = () => `match_${uuidv4().slice(0, 8)}`;

interface QueuedPlayer { userId: string; joinedAt: number; preferredRole?: Role; playerCount: number; }

interface PlayerConn {
  connected: boolean;
  disconnectedAt?: number;
}

type RoomStatus = 'waiting' | 'countdown' | 'started';

interface RoomMeta {
  hostId: string;
  matchId?: string;
  createdAt: number;
  joinedAt?: number;
  allDisconnectedAt?: number;
  playerCount: number;
  members: string[];
  status: RoomStatus;
  countdownEndsAt?: number;
  countdownTimer?: NodeJS.Timeout;
}

interface ActiveMatchMeta {
  player1Id: string;
  player2Id: string;
  player3Id?: string;
  p1Role: Role;
  p2Role: Role;
  p3Role?: Role;
  symbol: string;
  playerCount: number;
  createdAt: number;
  matchStartedAt: number;
  finishedAt?: number;
  winnerId?: string;
  connections: Record<string, PlayerConn>;
  allDisconnectedAt?: number;
  lastDisconnectAt?: number;
  roomCode?: string;
  replaySaved?: boolean;
  forfeited: Set<string>;
}

type DestroyReason = 'timeout' | 'disconnected' | 'finished';

type MatchEventTarget =
  | { scope: 'match'; matchId: string }
  | { scope: 'user'; userId: string }
  | { scope: 'broadcast' };

export type MatchEventEmitter = (
  event: string,
  payload: any,
  target: MatchEventTarget,
) => void;

@Injectable()
export class MatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchService.name);

  private queue: QueuedPlayer[] = [];
  private rooms = new Map<string, RoomMeta>();
  private activeMatches = new Map<string, ActiveMatchMeta>();
  private playerSelectedSymbol = new Map<string, string>();
  private userMatchMap = new Map<string, string>();
  private userRoomMap = new Map<string, string>();
  private forfeitedHandled = new Set<string>();

  private emitEvent?: MatchEventEmitter;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly engine: MarketEngine,
    private readonly replay: ReplayService,
  ) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => this.periodicCleanup(), CLEANUP_INTERVAL_MS);
    this.logger.log(`[cleanup] periodic task started (every ${CLEANUP_INTERVAL_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  setEventEmitter(emitter: MatchEventEmitter) {
    this.emitEvent = emitter;
  }

  // =========================================================
  // 快速匹配
  // =========================================================

  quickMatch(userId: string, preferredRole?: Role, playerCount = 2): ApiResponse<{
    matchId: string;
    role: Role;
    opponent: string | null;
    waiting?: boolean;
    currentPlayers?: number;
    requiredPlayers?: number;
  }> {
    if (!userId) return Fail('缺少 userId');
    const count = playerCount === 3 ? 3 : 2;

    const existingMatchId = this.userMatchMap.get(userId);
    if (existingMatchId) {
      const m = this.activeMatches.get(existingMatchId);
      if (m && !m.finishedAt) {
        const role = this.getRole(existingMatchId, userId);
        const opponent = this.getOpponent(existingMatchId, userId);
        if (role) return Ok({ matchId: existingMatchId, role, opponent });
      }
    }

    const existingRoomCode = this.userRoomMap.get(userId);
    if (existingRoomCode) {
      const room = this.rooms.get(existingRoomCode);
      if (room && room.status !== 'started') {
        return Ok({
          matchId: '',
          role: preferredRole ?? 'retail',
          opponent: null,
          waiting: true,
          currentPlayers: room.members.length,
          requiredPlayers: room.playerCount,
        }, '已在等待房间中');
      }
    }

    const existingIdx = this.queue.findIndex((p) => p.userId === userId);
    if (existingIdx >= 0) {
      const queued = this.queue[existingIdx];
      const sameCount = this.queue.filter((p) => p.playerCount === count).length;
      return Ok({
        matchId: '',
        role: preferredRole ?? queued.preferredRole ?? 'retail',
        opponent: null,
        waiting: true,
        currentPlayers: sameCount,
        requiredPlayers: count,
      }, '已在匹配队列中');
    }

    const partnerIdx = this.queue.findIndex((p) => p.userId !== userId && p.playerCount === count);
    if (partnerIdx === -1) {
      this.queue.push({ userId, joinedAt: Date.now(), preferredRole, playerCount: count });
      this.emitQueueUpdate(userId, count);
      return Ok({
        matchId: '',
        role: preferredRole ?? 'retail',
        opponent: null,
        waiting: true,
        currentPlayers: 1,
        requiredPlayers: count,
      }, '已加入匹配队列，等待对手');
    }

    if (count === 2) {
      const partner = this.queue.splice(partnerIdx, 1)[0];
      this.startQuickMatchCountdown([userId, partner.userId], preferredRole, partner.preferredRole);
      return Ok({
        matchId: '',
        role: preferredRole ?? 'retail',
        opponent: null,
        waiting: true,
        currentPlayers: 2,
        requiredPlayers: 2,
      }, '对手已匹配，即将开始');
    }

    // 3-player quick match: need 2 more in queue with same count
    const others = this.queue.filter((p) => p.userId !== userId && p.playerCount === 3);
    if (others.length < 2) {
      this.queue.push({ userId, joinedAt: Date.now(), preferredRole, playerCount: 3 });
      this.emitQueueUpdate(userId, 3);
      return Ok({
        matchId: '',
        role: preferredRole ?? 'retail',
        opponent: null,
        waiting: true,
        currentPlayers: others.length + 1,
        requiredPlayers: 3,
      }, '已加入匹配队列，等待对手');
    }

    const p2 = others[0];
    const p3 = others[1];
    this.queue.splice(this.queue.findIndex((p) => p.userId === p2.userId), 1);
    this.queue.splice(this.queue.findIndex((p) => p.userId === p3.userId), 1);
    this.startQuickMatchCountdown(
      [userId, p2.userId, p3.userId],
      preferredRole,
      p2.preferredRole,
      p3.preferredRole,
    );
    return Ok({
      matchId: '',
      role: preferredRole ?? 'retail',
      opponent: null,
      waiting: true,
      currentPlayers: 3,
      requiredPlayers: 3,
    }, '对手已匹配，即将开始');
  }

  // =========================================================
  // 房间匹配
  // =========================================================

  createRoom(hostId: string, playerCount = 2): ApiResponse<{
    code: string;
    currentPlayers: number;
    requiredPlayers: number;
    waiting: boolean;
  }> {
    if (!hostId) return Fail('缺少 hostId');
    const count = playerCount === 3 ? 3 : 2;

    const existingRoomCode = this.userRoomMap.get(hostId);
    if (existingRoomCode) {
      const existing = this.rooms.get(existingRoomCode);
      if (existing && existing.status !== 'started') {
        return Ok({
          code: existingRoomCode,
          currentPlayers: existing.members.length,
          requiredPlayers: existing.playerCount,
          waiting: true,
        }, '已在房间中');
      }
    }

    let code = generateRoomCode();
    for (let i = 0; i < 5 && this.rooms.has(code); i++) code = generateRoomCode();
    if (this.rooms.has(code)) return Fail('房间码生成失败，请重试');

    const room: RoomMeta = {
      hostId,
      createdAt: Date.now(),
      playerCount: count,
      members: [hostId],
      status: 'waiting',
    };
    this.rooms.set(code, room);
    this.userRoomMap.set(hostId, code);
    this.emitRoomUpdate(code);
    this.logger.log(`Room created: ${code} host=${hostId} players=${count}`);
    return Ok({ code, currentPlayers: 1, requiredPlayers: count, waiting: true });
  }

  joinRoom(userId: string, code: string): ApiResponse<{
    matchId?: string;
    role?: Role;
    opponent?: string;
    waiting: boolean;
    code: string;
    currentPlayers: number;
    requiredPlayers: number;
  }> {
    if (!userId) return Fail('缺少 userId');
    if (!code) return Fail('缺少房间码');
    const upper = code.toUpperCase();
    const room = this.rooms.get(upper);
    if (!room) return Fail('房间不存在');
    if (room.status === 'started' && room.matchId) return Fail('房间已开始对局');
    if (room.status === 'countdown') {
      return Ok({
        waiting: true,
        code: upper,
        currentPlayers: room.members.length,
        requiredPlayers: room.playerCount,
      }, '房间已满，即将开始');
    }
    if (room.hostId === userId && !room.members.includes(userId)) return Fail('不能加入自己创建的房间');
    if (room.members.includes(userId)) {
      return Ok({
        waiting: room.members.length < room.playerCount,
        code: upper,
        currentPlayers: room.members.length,
        requiredPlayers: room.playerCount,
      }, '已在房间中');
    }
    if (room.members.length >= room.playerCount) return Fail('房间已满');

    room.members.push(userId);
    this.userRoomMap.set(userId, upper);
    this.emitRoomUpdate(upper);

    if (room.members.length >= room.playerCount) {
      this.startRoomCountdown(upper);
      return Ok({
        waiting: true,
        code: upper,
        currentPlayers: room.members.length,
        requiredPlayers: room.playerCount,
      }, '房间已满，即将开始');
    }

    this.logger.log(`Room ${upper}: ${userId} joined (${room.members.length}/${room.playerCount})`);
    return Ok({
      waiting: true,
      code: upper,
      currentPlayers: room.members.length,
      requiredPlayers: room.playerCount,
    }, '已加入房间，等待其他玩家');
  }

  cancelWaiting(userId: string): ApiResponse<{ cancelled: boolean }> {
    if (!userId) return Fail('缺少 userId');

    const queueIdx = this.queue.findIndex((p) => p.userId === userId);
    if (queueIdx >= 0) {
      this.queue.splice(queueIdx, 1);
      this.emit('match:queue-left', { userId }, { scope: 'user', userId });
      this.logger.log(`[cancel] user ${userId} left quick-match queue`);
      return Ok({ cancelled: true });
    }

    const roomCode = this.userRoomMap.get(userId);
    if (roomCode) {
      const room = this.rooms.get(roomCode);
      if (room && room.status !== 'started') {
        if (room.countdownTimer) clearTimeout(room.countdownTimer);
        if (room.hostId === userId) {
          this.destroyRoom(roomCode, userId, 'disconnected');
          for (const mid of room.members) {
            if (mid !== userId) {
              this.userRoomMap.delete(mid);
              this.emit('room:closed', { code: roomCode, message: '房主已取消房间' }, { scope: 'user', userId: mid });
            }
          }
        } else {
          room.members = room.members.filter((m) => m !== userId);
          this.userRoomMap.delete(userId);
          this.emitRoomUpdate(roomCode);
          this.emit('room:left', { code: roomCode, userId }, { scope: 'user', userId: room.hostId });
        }
        return Ok({ cancelled: true });
      }
    }

    return Ok({ cancelled: false }, '无等待中的匹配');
  }

  // =========================================================
  // 连接 / 断线
  // =========================================================

  handlePlayerConnect(matchId: string, userId: string) {
    const m = this.activeMatches.get(matchId);
    if (!m || m.finishedAt) return;
    if (!m.connections[userId]) m.connections[userId] = { connected: true };
    m.connections[userId].connected = true;
    m.connections[userId].disconnectedAt = undefined;
    m.allDisconnectedAt = undefined;
    m.lastDisconnectAt = undefined;
  }

  handlePlayerDisconnect(userId: string) {
    const matchId = this.userMatchMap.get(userId);
    if (!matchId) return;
    const m = this.activeMatches.get(matchId);
    if (!m || m.finishedAt) return;

    const conn = m.connections[userId] ?? { connected: false };
    conn.connected = false;
    conn.disconnectedAt = Date.now();
    m.connections[userId] = conn;
    m.lastDisconnectAt = conn.disconnectedAt;

    if (this.areAllHumanPlayersDisconnected(m)) {
      m.allDisconnectedAt = m.allDisconnectedAt ?? Date.now();
    }

    const reconnectDeadline = conn.disconnectedAt + RECONNECT_MS;
    this.emit('match:disconnect-warning', {
      matchId,
      userId,
      reconnectDeadline,
      message: '连接中断，30秒内重连将保留对局',
    }, { scope: 'user', userId });

    this.emit('match:peer-disconnect', {
      matchId,
      userId,
      reconnectDeadline,
    }, { scope: 'match', matchId });
  }

  // =========================================================
  // 查询
  // =========================================================

  listLobby(): ApiResponse<{ activeMatches: number; queueSize: number; rooms: { code: string; hostId: string; ageMs: number; currentPlayers: number; requiredPlayers: number }[] }> {
    const rooms = Array.from(this.rooms.entries()).map(([code, r]) => ({
      code,
      hostId: r.hostId,
      ageMs: Date.now() - r.createdAt,
      currentPlayers: r.members.length,
      requiredPlayers: r.playerCount,
    })).filter((r) => r.ageMs < 30 * 60 * 1000 && r.currentPlayers < r.requiredPlayers);
    return Ok({
      activeMatches: this.activeMatches.size,
      queueSize: this.queue.length,
      rooms,
    });
  }

  getMatch(matchId: string): ApiResponse<any> {
    const inMem = this.activeMatches.get(matchId);
    if (!inMem) {
      const row = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as any;
      if (!row) return Fail('对局不存在', 404);
      return Ok({
        id: row.id,
        status: row.status,
        player1: row.player1_id,
        player2: row.player2_id,
        p1Role: row.p1_role,
        p2Role: row.p2_role,
        currentDay: row.current_day,
        currentTick: row.current_tick,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        winnerId: row.winner_id,
      });
    }
    return Ok({
      id: matchId,
      status: inMem.finishedAt ? 'finished' : 'playing',
      player1: inMem.player1Id,
      player2: inMem.player2Id,
      player3: inMem.player3Id,
      p1Role: inMem.p1Role,
      p2Role: inMem.p2Role,
      p3Role: inMem.p3Role,
      symbol: inMem.symbol,
      playerCount: inMem.playerCount,
    });
  }

  solo(userId: string, preferredRole?: Role): ApiResponse<{ matchId: string; role: Role; opponentId: string }> {
    if (!userId) return Fail('缺少 userId');

    const userRole: Role =
      preferredRole ?? (Math.random() < 0.45 ? 'dealer' : Math.random() < 0.5 ? 'retail' : 'regulator');

    const opponentRole: Role =
      userRole === 'dealer' ? 'retail' :
      userRole === 'retail' ? 'dealer' :
      Math.random() < 0.5 ? 'dealer' : 'retail';

    const opponentId = `bot_${uuidv4().slice(0, 8)}`;
    const symbol = this.playerSelectedSymbol.get(userId) ?? 'QDN';
    const matchId = newMatchId();
    const now = Date.now();

    this.db.prepare(
      `INSERT INTO matches
        (id, status, player1_id, player2_id, p1_role, p2_role, initial_price, started_at)
        VALUES (?, 'playing', ?, ?, ?, ?, ?, ?)`,
    ).run(matchId, userId, opponentId, userRole, opponentRole, this.engine.getQuote(symbol)?.price ?? 0, now);

    this.upsertUserMatchState(matchId, userId, userRole);
    this.upsertUserMatchState(matchId, opponentId, opponentRole);

    this.engine.registerMatch(matchId, symbol);
    this.activeMatches.set(matchId, {
      player1Id: userId,
      player2Id: opponentId,
      p1Role: userRole,
      p2Role: opponentRole,
      symbol,
      playerCount: 2,
      createdAt: now,
      matchStartedAt: now,
      connections: { [userId]: { connected: false } },
      forfeited: new Set(),
    });
    this.userMatchMap.set(userId, matchId);

    this.logger.log(`Solo match created: ${matchId} (${userId} as ${userRole} vs AI ${opponentId} as ${opponentRole})`);
    return Ok({ matchId, role: userRole, opponentId });
  }

  getOpponent(matchId: string, userId: string) {
    const m = this.activeMatches.get(matchId);
    if (!m) return null;
    const players = [m.player1Id, m.player2Id, m.player3Id].filter(Boolean) as string[];
    return players.find((p) => p !== userId && !p.startsWith('bot_')) ?? null;
  }

  getRole(matchId: string, userId: string): Role | null {
    const m = this.activeMatches.get(matchId);
    if (!m) {
      const row = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as any;
      if (!row) return null;
      if (row.player1_id === userId) return row.p1_role as Role;
      if (row.player2_id === userId) return row.p2_role as Role;
      return null;
    }
    if (m.player1Id === userId) return m.p1Role;
    if (m.player2Id === userId) return m.p2Role;
    if (m.player3Id === userId) return m.p3Role ?? null;
    return null;
  }

  getPlayers(matchId: string): { p1: string; p2: string; p3?: string } | null {
    const m = this.activeMatches.get(matchId);
    if (!m) return null;
    return { p1: m.player1Id, p2: m.player2Id, p3: m.player3Id };
  }

  getMatchIdForUser(userId: string): string | undefined {
    return this.userMatchMap.get(userId);
  }

  // =========================================================
  // 对局收尾
  // =========================================================

  endMatch(matchId: string, winnerId?: string) {
    const m = this.activeMatches.get(matchId);
    if (!m) return;
    if (m.finishedAt) return;

    m.finishedAt = Date.now();
    m.winnerId = winnerId;
    this.db.prepare(
      `UPDATE matches SET status = 'finished', finished_at = ?, winner_id = ? WHERE id = ?`,
    ).run(m.finishedAt, winnerId ?? null, matchId);

    this.emit('match:end', { matchId, winnerId }, { scope: 'match', matchId });
    this.logger.log(`Match ended: ${matchId} winner=${winnerId} (cleanup in ${MATCH_END_CLEANUP_MS / 1000}s)`);
  }

  // =========================================================
  // 周期性清理
  // =========================================================

  private periodicCleanup() {
    const now = Date.now();

    for (const [code, room] of [...this.rooms.entries()]) {
      if (room.status === 'started') continue;
      if (now - room.createdAt >= EMPTY_ROOM_MS) {
        for (const mid of room.members) {
          if (mid !== room.hostId) {
            this.emit('room:closed', { code, message: '房间已超时销毁' }, { scope: 'user', userId: mid });
          }
          this.userRoomMap.delete(mid);
        }
        this.destroyRoom(code, room.hostId, 'timeout');
      }
    }

    for (let i = this.queue.length - 1; i >= 0; i--) {
      const p = this.queue[i];
      if (now - p.joinedAt >= QUICK_MATCH_TIMEOUT_MS) {
        this.queue.splice(i, 1);
        this.emit('match:timeout', {
          userId: p.userId,
          message: '暂无对手，是否切换单人模式？',
        }, { scope: 'user', userId: p.userId });
        this.logger.log(`[cleanup] quick-match timeout for user ${p.userId}`);
      }
    }

    for (const [matchId, m] of [...this.activeMatches.entries()]) {
      if (m.finishedAt) {
        if (now - m.finishedAt >= MATCH_END_CLEANUP_MS) {
          if (!m.replaySaved) {
            try {
              this.replay.saveRecording(matchId);
            } catch (err: any) {
              this.logger.warn(`[cleanup] replay save failed for ${matchId}: ${err?.message}`);
            }
            m.replaySaved = true;
          }
          this.destroyMatch(matchId, 'finished');
        }
        continue;
      }

      if (this.areAllHumanPlayersDisconnected(m)) {
        if (!m.allDisconnectedAt) m.allDisconnectedAt = now;
        if (now - m.allDisconnectedAt >= ALL_DISCONNECT_MS) {
          this.destroyMatch(matchId, 'disconnected');
          continue;
        }
      } else {
        m.allDisconnectedAt = undefined;
      }

      for (const [userId, conn] of Object.entries(m.connections)) {
        if (userId.startsWith('bot_')) continue;
        if (conn.connected) continue;
        if (!conn.disconnectedAt) continue;
        if (now - conn.disconnectedAt < RECONNECT_MS) continue;
        const key = `${matchId}:${userId}`;
        if (this.forfeitedHandled.has(key)) continue;
        this.forfeitPlayer(matchId, userId);
      }
    }
  }

  private forfeitPlayer(matchId: string, userId: string) {
    const m = this.activeMatches.get(matchId);
    if (!m || m.finishedAt) return;

    const key = `${matchId}:${userId}`;
    if (this.forfeitedHandled.has(key)) return;
    this.forfeitedHandled.add(key);
    m.forfeited.add(userId);

    if (m.playerCount >= 3 && m.player3Id) {
      this.downgradeToTwoPlayer(matchId, userId);
      return;
    }

    const opponent = this.getOpponent(matchId, userId);
    const winnerId = opponent ?? undefined;

    this.emit('match:forfeit', {
      matchId,
      userId,
      winnerId,
      message: '你已被判定弃权',
      self: true,
    }, { scope: 'user', userId });

    if (opponent) {
      this.emit('match:forfeit', {
        matchId,
        userId,
        winnerId,
        message: `对手 ${userId} 弃权，您获胜`,
      }, { scope: 'user', userId: opponent });
    }

    this.emit('match:forfeit', { matchId, userId, winnerId }, { scope: 'match', matchId });
    this.endMatch(matchId, winnerId);
  }

  private downgradeToTwoPlayer(matchId: string, forfeitedUserId: string) {
    const m = this.activeMatches.get(matchId);
    if (!m) return;

    const botId = `bot_${uuidv4().slice(0, 8)}`;
    const role = this.getRole(matchId, forfeitedUserId) ?? 'retail';

    if (m.player1Id === forfeitedUserId) {
      m.player1Id = botId;
      m.p1Role = role;
    } else if (m.player2Id === forfeitedUserId) {
      m.player2Id = botId;
      m.p2Role = role;
    } else if (m.player3Id === forfeitedUserId) {
      m.player3Id = botId;
      m.p3Role = role;
    }

    m.playerCount = 2;
    delete m.connections[forfeitedUserId];
    m.connections[botId] = { connected: true };
    this.userMatchMap.delete(forfeitedUserId);

    this.upsertUserMatchState(matchId, botId, role);
    this.db.prepare(
      `UPDATE matches SET player2_id = CASE WHEN player2_id = ? THEN ? ELSE player2_id END,
                          player1_id = CASE WHEN player1_id = ? THEN ? ELSE player1_id END
       WHERE id = ?`,
    ).run(forfeitedUserId, botId, forfeitedUserId, botId, matchId);

    this.emit('match:downgrade', {
      matchId,
      forfeitedUserId,
      botId,
      playerCount: 2,
      message: '一名玩家弃权，对局降级为双人对战（AI 接管）',
    }, { scope: 'match', matchId });

    this.emit('match:forfeit', {
      matchId,
      userId: forfeitedUserId,
      message: '你已被判定弃权',
      self: true,
    }, { scope: 'user', userId: forfeitedUserId });

    this.logger.log(`[cleanup] match ${matchId} downgraded to 2-player after forfeit by ${forfeitedUserId}`);
  }

  private destroyRoom(code: string, hostId: string, reason: DestroyReason) {
    const room = this.rooms.get(code);
    if (room?.countdownTimer) clearTimeout(room.countdownTimer);
    if (room) {
      for (const mid of room.members) this.userRoomMap.delete(mid);
    }
    this.rooms.delete(code);
    this.userRoomMap.delete(hostId);
    this.emit('match:destroyed', {
      code,
      reason,
      message: reason === 'timeout' ? '房间已超时销毁' : '房间已关闭',
    }, { scope: 'user', userId: hostId });
    this.logger.log(`[cleanup] destroyed room ${code} (reason: ${reason})`);
  }

  private destroyMatch(matchId: string, reason: DestroyReason) {
    const m = this.activeMatches.get(matchId);
    if (!m) return;

    const playerIds = [m.player1Id, m.player2Id, m.player3Id].filter(Boolean) as string[];
    this.activeMatches.delete(matchId);
    this.engine.unregisterMatch(matchId);

    for (const pid of playerIds) {
      if (!pid.startsWith('bot_')) this.userMatchMap.delete(pid);
    }

    for (const [code, room] of this.rooms.entries()) {
      if (room.matchId === matchId) this.rooms.delete(code);
    }

    this.emit('match:destroyed', { matchId, reason }, { scope: 'match', matchId });
    this.logger.log(`[cleanup] destroyed room ${matchId} (reason: ${reason})`);
  }

  private areAllHumanPlayersDisconnected(m: ActiveMatchMeta): boolean {
    const humans = Object.entries(m.connections).filter(([id]) => !id.startsWith('bot_'));
    if (humans.length === 0) return false;
    return humans.every(([, c]) => !c.connected);
  }

  private emit(event: string, payload: any, target: MatchEventTarget) {
    this.emitEvent?.(event, payload, target);
  }

  private emitRoomUpdate(code: string) {
    const room = this.rooms.get(code);
    if (!room || room.status === 'started') return;
    const payload = {
      code,
      currentPlayers: room.members.length,
      requiredPlayers: room.playerCount,
      members: room.members,
      hostId: room.hostId,
      status: room.status,
    };
    for (const uid of room.members) {
      this.emit('room:update', payload, { scope: 'user', userId: uid });
    }
  }

  private emitQueueUpdate(userId: string, playerCount: number) {
    const sameCount = this.queue.filter((p) => p.playerCount === playerCount);
    const payload = {
      currentPlayers: sameCount.length,
      requiredPlayers: playerCount,
      mode: 'quick' as const,
    };
    for (const p of sameCount) {
      this.emit('room:update', payload, { scope: 'user', userId: p.userId });
    }
  }

  private startRoomCountdown(code: string) {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'waiting') return;
    room.status = 'countdown';
    room.countdownEndsAt = Date.now() + ROOM_COUNTDOWN_MS;

    const readyPayload = {
      code,
      currentPlayers: room.members.length,
      requiredPlayers: room.playerCount,
    };
    for (const uid of room.members) {
      this.emit('room:ready', readyPayload, { scope: 'user', userId: uid });
      this.emit('room:countdown', { code, seconds: 3 }, { scope: 'user', userId: uid });
    }

    room.countdownTimer = setTimeout(() => {
      this.createMatchFromRoom(code);
    }, ROOM_COUNTDOWN_MS);
    this.logger.log(`Room ${code} countdown started (${room.members.length} players)`);
  }

  private startQuickMatchCountdown(
    memberIds: string[],
    ...preferredRoles: (Role | undefined)[]
  ) {
    const playerCount = memberIds.length;
    const tempCode = `QM_${uuidv4().slice(0, 8)}`;
    const room: RoomMeta = {
      hostId: memberIds[0],
      createdAt: Date.now(),
      playerCount,
      members: [...memberIds],
      status: 'countdown',
      countdownEndsAt: Date.now() + ROOM_COUNTDOWN_MS,
    };
    this.rooms.set(tempCode, room);
    for (const uid of memberIds) this.userRoomMap.set(uid, tempCode);

    const readyPayload = { currentPlayers: playerCount, requiredPlayers: playerCount, mode: 'quick' as const };
    for (const uid of memberIds) {
      this.emit('room:ready', readyPayload, { scope: 'user', userId: uid });
      this.emit('room:countdown', { seconds: 3, mode: 'quick' }, { scope: 'user', userId: uid });
    }

    room.countdownTimer = setTimeout(() => {
      this.createMatchFromMembers(memberIds, preferredRoles, tempCode);
    }, ROOM_COUNTDOWN_MS);
    this.logger.log(`Quick-match countdown for ${memberIds.join(', ')}`);
  }

  private createMatchFromRoom(code: string) {
    const room = this.rooms.get(code);
    if (!room || room.status === 'started') return;
    this.createMatchFromMembers(room.members, [], code);
  }

  private createMatchFromMembers(
    memberIds: string[],
    preferredRoles: (Role | undefined)[],
    roomCode?: string,
  ) {
    if (memberIds.length < 2) return;

    const roles = this.assignRoles(memberIds.length, preferredRoles);
    const symbol =
      memberIds.map((id) => this.playerSelectedSymbol.get(id)).find(Boolean) ?? 'QDN';
    const matchId = newMatchId();
    const now = Date.now();
    const upperCode = roomCode?.startsWith('QM_') ? undefined : roomCode;

    if (memberIds.length >= 3) {
      const [p1, p2, p3] = memberIds;
      const [r1, r2, r3] = roles as [Role, Role, Role];
      this.db.prepare(
        `INSERT INTO matches
          (id, status, player1_id, player2_id, p1_role, p2_role, initial_price, started_at)
          VALUES (?, 'playing', ?, ?, ?, ?, ?, ?)`,
      ).run(matchId, p1, p2, r1, r2, this.engine.getQuote(symbol)?.price ?? 0, now);
      // player3 stored via user_match_state; schema has no player3 column
      this.upsertUserMatchState(matchId, p1, r1);
      this.upsertUserMatchState(matchId, p2, r2);
      this.upsertUserMatchState(matchId, p3, r3);

      this.engine.registerMatch(matchId, symbol);
      const connections: Record<string, PlayerConn> = {};
      for (const id of memberIds) connections[id] = { connected: false };

      const meta: ActiveMatchMeta = {
        player1Id: p1,
        player2Id: p2,
        player3Id: p3,
        p1Role: r1,
        p2Role: r2,
        p3Role: r3,
        symbol,
        playerCount: 3,
        createdAt: now,
        matchStartedAt: now,
        roomCode: upperCode,
        connections,
        forfeited: new Set(),
      };
      this.activeMatches.set(matchId, meta);
      for (const id of memberIds) {
        this.userMatchMap.set(id, matchId);
        this.userRoomMap.delete(id);
      }

      const roleMap: Record<string, Role> = { [p1]: r1, [p2]: r2, [p3]: r3 };
      for (const uid of memberIds) {
        const opponents = memberIds.filter((m) => m !== uid);
        this.emit('match:start', {
          matchId,
          role: roleMap[uid],
          opponents,
          playerCount: 3,
          code: upperCode,
        }, { scope: 'user', userId: uid });
      }
    } else {
      const [p1, p2] = memberIds;
      const [r1, r2] = roles as [Role, Role];
      this.db.prepare(
        `INSERT INTO matches
          (id, status, player1_id, player2_id, p1_role, p2_role, initial_price, started_at)
          VALUES (?, 'playing', ?, ?, ?, ?, ?, ?)`,
      ).run(matchId, p1, p2, r1, r2, this.engine.getQuote(symbol)?.price ?? 0, now);

      this.upsertUserMatchState(matchId, p1, r1);
      this.upsertUserMatchState(matchId, p2, r2);

      this.engine.registerMatch(matchId, symbol);
      const meta: ActiveMatchMeta = {
        player1Id: p1,
        player2Id: p2,
        p1Role: r1,
        p2Role: r2,
        symbol,
        playerCount: 2,
        createdAt: now,
        matchStartedAt: now,
        roomCode: upperCode,
        connections: {
          [p1]: { connected: false },
          [p2]: { connected: false },
        },
        forfeited: new Set(),
      };
      this.activeMatches.set(matchId, meta);
      for (const id of memberIds) {
        this.userMatchMap.set(id, matchId);
        this.userRoomMap.delete(id);
      }

      this.emit('match:start', {
        matchId,
        role: r1,
        opponents: [p2],
        opponent: p2,
        playerCount: 2,
        code: upperCode,
      }, { scope: 'user', userId: p1 });
      this.emit('match:start', {
        matchId,
        role: r2,
        opponents: [p1],
        opponent: p1,
        playerCount: 2,
        code: upperCode,
      }, { scope: 'user', userId: p2 });
    }

    if (roomCode) {
      const room = this.rooms.get(roomCode);
      if (room) {
        room.status = 'started';
        room.matchId = matchId;
        room.joinedAt = now;
        if (room.countdownTimer) clearTimeout(room.countdownTimer);
        if (roomCode.startsWith('QM_')) {
          this.rooms.delete(roomCode);
        }
      }
    }

    this.logger.log(`Match created: ${matchId} (${memberIds.join(' vs ')})`);
  }

  private assignRoles(count: number, preferred: (Role | undefined)[]): Role[] {
    const all: Role[] = ['dealer', 'retail', 'regulator'];
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    if (count === 2) {
      const r1: Role = preferred[0] ?? (Math.random() < 0.5 ? 'dealer' : 'retail');
      const r2: Role = preferred[1] ?? (r1 === 'dealer' ? 'retail' : 'dealer');
      return [r1, r2];
    }
    return shuffled.slice(0, 3);
  }

  // =========================================================
  // User match-state 工具
  // =========================================================

  private upsertUserMatchState(matchId: string, userId: string, role: Role) {
    this.db.prepare(
      `INSERT OR IGNORE INTO user_match_state
         (match_id, user_id, role, cash, borrowed, leverage, total_trade_count, best_trade_pnl)
       VALUES (?, ?, ?, 100000000, 0, 2, 0, 0)`,
    ).run(matchId, userId, role);
  }

  getUserMatchState(matchId: string, userId: string) {
    return this.db.prepare('SELECT * FROM user_match_state WHERE match_id = ? AND user_id = ?')
      .get(matchId, userId) as any;
  }

  setUserMatchState(matchId: string, userId: string, fields: Partial<{ cash: number; borrowed: number; leverage: number; total_trade_count: number; best_trade_pnl: number }>) {
    const cur = this.getUserMatchState(matchId, userId);
    if (!cur) return;
    const cash = fields.cash ?? cur.cash;
    const borrowed = fields.borrowed ?? cur.borrowed;
    const leverage = fields.leverage ?? cur.leverage;
    const total_trade_count = fields.total_trade_count ?? cur.total_trade_count;
    const best_trade_pnl = fields.best_trade_pnl ?? cur.best_trade_pnl;
    this.db.prepare(
      `UPDATE user_match_state
          SET cash = ?, borrowed = ?, leverage = ?, total_trade_count = ?, best_trade_pnl = ?
        WHERE match_id = ? AND user_id = ?`,
    ).run(cash, borrowed, leverage, total_trade_count, best_trade_pnl, matchId, userId);
  }

  setSelectedSymbol(userId: string, symbol: string) {
    this.playerSelectedSymbol.set(userId, symbol);
  }

  getActiveMatchIds(): string[] {
    return [...this.activeMatches.entries()]
      .filter(([, m]) => !m.finishedAt)
      .map(([id]) => id);
  }

  getCurrentTick(matchId: string): number {
    const row = this.db.prepare(`SELECT current_tick FROM matches WHERE id = ?`).get(matchId) as any;
    return row?.current_tick ?? 0;
  }

  getCurrentDay(matchId: string): number {
    const row = this.db.prepare(`SELECT current_day FROM matches WHERE id = ?`).get(matchId) as any;
    return row?.current_day ?? 1;
  }

  getQuotePrice(symbol: string): number {
    return this.engine.getQuote(symbol)?.price ?? 0;
  }

  incrementTick(matchId: string): number {
    const next = this.getCurrentTick(matchId) + 1;
    this.db.prepare(`UPDATE matches SET current_tick = ? WHERE id = ?`).run(next, matchId);
    return next;
  }

  getJusticeScore(matchId: string): number {
    const row = this.db.prepare(`SELECT justice_score FROM matches WHERE id = ?`).get(matchId) as any;
    return row?.justice_score ?? 0;
  }

  adjustJusticeScore(matchId: string, delta: number): number {
    const cur = this.getJusticeScore(matchId);
    const next = cur + delta;
    this.db.prepare(`UPDATE matches SET justice_score = ? WHERE id = ?`).run(next, matchId);
    return next;
  }

  /** Total assets for a player in a match (cash + positions - borrowed). */
  computeTotalAssets(matchId: string, userId: string): number {
    const state = this.getUserMatchState(matchId, userId);
    if (!state) return 0;
    const positions = this.db.prepare(
      `SELECT symbol, quantity, avg_cost FROM positions WHERE match_id = ? AND user_id = ?`,
    ).all(matchId, userId) as any[];
    let positionValue = 0;
    for (const p of positions) {
      const px = this.engine.getQuote(p.symbol)?.price ?? p.avg_cost;
      positionValue += px * p.quantity;
    }
    return state.cash + positionValue - (state.borrowed ?? 0);
  }

  findOpponent(matchId: string, userId: string): string | null {
    const m = this.activeMatches.get(matchId);
    if (!m) return null;
    const ids = [m.player1Id, m.player2Id, m.player3Id].filter(Boolean) as string[];
    return ids.find((id) => id !== userId) ?? null;
  }

  findDealerUserId(matchId: string): string | null {
    const m = this.activeMatches.get(matchId);
    if (!m) return null;
    if (m.p1Role === 'dealer') return m.player1Id;
    if (m.p2Role === 'dealer') return m.player2Id;
    if (m.p3Role === 'dealer' && m.player3Id) return m.player3Id;
    return null;
  }
}

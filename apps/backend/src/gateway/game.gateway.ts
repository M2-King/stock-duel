import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { MarketEngine } from '../market/market.engine';
import { TradingService } from '../trading/trading.service';
import { DealerService } from '../dealer/dealer.service';
import { RegulatorService } from '../regulator/regulator.service';
import { MatchService } from '../match/match.service';
import { AuthService } from '../auth/auth.service';
import { STOCK_MAP } from '../market/stocks.seed';

/**
 * WebSocket Gateway — namespace: /game。
 *
 * 事件列表（client → server）：
 *   join-match    (matchId, token)            玩家加入
 *   leave-match   (matchId)                    玩家离开
 *   trade:buy     (matchId, symbol, price, qty, leverage?)
 *   trade:sell    (matchId, symbol, price, qty)
 *   dealer:action (matchId, type, power, symbol)
 *   regulator:action (matchId, alertId, action)
 *   select-symbol (symbol)                     切换标的（按 userId 记）
 *
 * 事件列表（server → client）：
 *   market:tick    每 200ms 推送最新 quote / kline / orderBook
 *   market:news    30-60s 随机新闻
 *   market:special 黑天鹅事件
 *   market:update  切换 symbol 后推送该 symbol 全量行情
 *   trade:result   买入/卖出回执
 *   dealer:result  庄家动作回执
 *   regulator:result 监管执法回执
 *   alert:new      新告警
 *   match:end              对局结算
 *   match:disconnect-warning  断线重连提示
 *   match:peer-disconnect     对手断线
 *   match:forfeit             弃权判定
 *   match:destroyed           房间/对局销毁
 *   match:timeout             快速匹配超时（提示切换单人）
 *   match:downgrade           三人对局降级（一人弃权）
 *   room:update               等待房间人数更新
 *   room:ready                房间已满
 *   room:countdown            开局倒计时
 *   match:start               对局创建完成，可 join-match
 *   room:closed               房间被关闭
 *   connected      鉴权成功
 *   error          鉴权失败 / 错误
 */
@WebSocketGateway({ namespace: '/game', cors: { origin: '*' } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  /** socket.id → { userId, matchId? } */
  private sessions = new Map<string, { userId: string; matchId?: string }>();

  /** userId → 当前在线 socket 集合（支持多端重连） */
  private userSockets = new Map<string, Set<string>>();

  /** userId → 当前 subscribe 的符号集 */
  private userSubscribedSymbols = new Map<string, Set<string>>();

  /** 行情 tick 定时器 */
  private tickInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly engine: MarketEngine,
    private readonly trading: TradingService,
    private readonly dealer: DealerService,
    private readonly reg: RegulatorService,
    private readonly matches: MatchService,
    private readonly auth: AuthService,
  ) {}

  // ============================================================
  // Lifecycle
  // ============================================================

  afterInit() {
    this.logger.log('WebSocket gateway /game initialized');

    this.matches.setEventEmitter((event, payload, target) => {
      if (target.scope === 'match') {
        this.server.to(`match:${target.matchId}`).emit(event, payload);
        return;
      }
      if (target.scope === 'user') {
        this.emitToUser(target.userId, event, payload);
        return;
      }
      this.server.emit(event, payload);
    });

    this.reg.setEventEmitter((event, payload, matchId) => {
      this.server.to(`match:${matchId}`).emit(event, payload);
    });

    // 200ms 广播一次盘内行情
    this.tickInterval = setInterval(() => this.broadcastTick(), 200);

    // 3s 推进对局 tick（与前端 1x 速度对齐）
    setInterval(() => {
      for (const matchId of this.matches.getActiveMatchIds()) {
        const tick = this.matches.incrementTick(matchId);
        this.dealer.onTick(matchId);
        this.server.to(`match:${matchId}`).emit('match:tick', { matchId, currentTick: tick });
      }
    }, 3000);

    // 订阅 news / blackSwan → 全局广播
    this.engine.onNews((item) => {
      this.server.emit('market:news', item);
    });
    this.engine.onBlackSwan((payload) => {
      this.server.emit('market:special', payload);
    });
  }

  handleConnection(socket: Socket) {
    this.logger.debug(`Client connected: ${socket.id}`);
    // 默认加入 public room — 接收全局市场新闻
    socket.join('public');
  }

  handleDisconnect(socket: Socket) {
    const session = this.sessions.get(socket.id);
    if (session?.userId) {
      const set = this.userSockets.get(session.userId);
      set?.delete(socket.id);
      if (set?.size === 0) this.userSockets.delete(session.userId);
      this.matches.handlePlayerDisconnect(session.userId);
    }
    if (session?.matchId) {
      socket.leave(`match:${session.matchId}`);
    }
    socket.leave('public');
    this.sessions.delete(socket.id);
    this.logger.debug(`Client disconnected: ${socket.id}`);
  }

  // ============================================================
  // Client → Server
  // ============================================================

  @SubscribeMessage('auth')
  async onAuth(@ConnectedSocket() socket: Socket, @MessageBody() data: { token: string; userId?: string }) {
    // 两种鉴权：
    //   1. 有 token → 校验
    //   2. 没 token 但有 userId → 直接登记（guest 流，简化重连）
    let userId: string | undefined;
    if (data?.token) {
      const res = this.auth.verify(data.token);
      if (res.code === 0 && res.data) userId = (res.data as any).user.id;
    } else if (data?.userId) {
      userId = data.userId;
    }
    if (!userId) {
      socket.emit('error', { message: '鉴权失败：缺少 token 或 userId' });
      return { ok: false };
    }
    this.sessions.set(socket.id, { userId });
    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
    this.userSockets.get(userId)!.add(socket.id);

    const activeMatchId = this.matches.getMatchIdForUser(userId);
    if (activeMatchId) {
      this.sessions.get(socket.id)!.matchId = activeMatchId;
      socket.join(`match:${activeMatchId}`);
      this.matches.handlePlayerConnect(activeMatchId, userId);
    }

    socket.emit('connected', { userId, matchId: activeMatchId });
    return { ok: true, userId };
  }

  @SubscribeMessage('join-match')
  async onJoinMatch(@ConnectedSocket() socket: Socket, @MessageBody() data: { matchId: string }) {
    console.log('[gateway] join-match:', data);
    const session = this.sessions.get(socket.id);
    if (!session?.userId) {
      console.log('[gateway] join-match reject: no session.userId (socket must auth first)');
      socket.emit('error', { message: '请先 auth' });
      return { ok: false, reason: 'no_session' };
    }
    const role = this.matches.getRole(data.matchId, session.userId);
    if (!role) {
      const players = this.matches.getPlayers(data.matchId);
      console.log(
        '[gateway] join-match reject: user not in match',
        { matchId: data.matchId, sessionUserId: session.userId, players },
      );
      socket.emit('error', { message: '用户不在该对局中' });
      return { ok: false, reason: 'not_in_match' };
    }
    console.log('[gateway] join-match ok:', { matchId: data.matchId, userId: session.userId, role });
    session.matchId = data.matchId;
    socket.join(`match:${data.matchId}`);
    this.matches.handlePlayerConnect(data.matchId, session.userId);
    // 通知对手（如果有别的 session 也连着）
    socket.to(`match:${data.matchId}`).emit('match:peer-join', { userId: session.userId, role });
    // 同步对局当前完整行情 + 玩家资产（cash 以后端为准）
    const symbol = 'QDN';
    const portfolioRes = this.trading.portfolio(data.matchId, session.userId);
    const portfolio = portfolioRes.code === 0 ? portfolioRes.data : null;
    const dealerResources = role === 'dealer'
      ? this.dealer.resources(data.matchId, session.userId)
      : undefined;
    socket.emit('match:snapshot', {
      matchId: data.matchId,
      role,
      symbol,
      quote: this.engine.getQuote(symbol),
      klines: this.engine.getKlines(symbol),
      orderBook: this.engine.getOrderBook(symbol),
      indicators: this.engine.getIndicators(symbol),
      currentDay: 1,
      currentTick: 0,
      session: 'morning',
      portfolio,
      dealerResources,
    });
    return { ok: true, role };
  }

  @SubscribeMessage('leave-match')
  async onLeaveMatch(@ConnectedSocket() socket: Socket, @MessageBody() data: { matchId: string }) {
    const session = this.sessions.get(socket.id);
    if (session?.matchId === data.matchId) session.matchId = undefined;
    socket.leave(`match:${data.matchId}`);
    socket.to(`match:${data.matchId}`).emit('match:peer-leave', { userId: session?.userId });
    return { ok: true };
  }

  @SubscribeMessage('trade:buy')
  async onBuy(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const session = this.sessions.get(socket.id);
    if (!session?.userId) {
      socket.emit('trade:result', { code: 401, message: '未鉴权' });
      return;
    }
    const res = await this.trading.buy({
      ...data,
      userId: session.userId,
    });
    const out = { side: 'buy' as const, ...this.enrichWithPortfolio(data.matchId, session.userId, res) };
    socket.emit('trade:result', out);
    if (res.code === 0 && data.matchId) {
      socket.to(`match:${data.matchId}`).emit('peer:trade', { userId: session.userId, side: 'buy', symbol: data.symbol });
    }
  }

  @SubscribeMessage('trade:sell')
  async onSell(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const session = this.sessions.get(socket.id);
    if (!session?.userId) {
      socket.emit('trade:result', { code: 401, message: '未鉴权' });
      return;
    }
    const res = await this.trading.sell({
      ...data,
      userId: session.userId,
    });
    const out = { side: 'sell' as const, ...this.enrichWithPortfolio(data.matchId, session.userId, res) };
    socket.emit('trade:result', out);
    if (res.code === 0 && data.matchId) {
      socket.to(`match:${data.matchId}`).emit('peer:trade', { userId: session.userId, side: 'sell', symbol: data.symbol });
    }
  }

  @SubscribeMessage('dealer:action')
  async onDealerAction(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const session = this.sessions.get(socket.id);
    if (!session?.userId) {
      socket.emit('dealer:result', { code: 401, message: '未鉴权' });
      return;
    }
    const res = await this.dealer.action({ ...data, userId: session.userId });
    const enriched = this.enrichWithPortfolio(data?.matchId, session.userId, res);
    socket.emit('dealer:result', enriched);
    if (data.matchId) socket.to(`match:${data.matchId}`).emit('peer:dealer', { userId: session.userId, ...enriched });
  }

  /** 与 dealer:action 相同 session.userId，避免 REST query userId 与 WS 不一致 */
  @SubscribeMessage('portfolio:sync')
  async onPortfolioSync(@ConnectedSocket() socket: Socket, @MessageBody() data: { matchId: string }) {
    const session = this.sessions.get(socket.id);
    if (!session?.userId) {
      return { code: 401, message: '未鉴权', data: null };
    }
    if (!data?.matchId) {
      return { code: 1, message: '缺少 matchId', data: null };
    }
    const portfolioRes = this.trading.portfolio(data.matchId, session.userId);
    if (portfolioRes.code !== 0) {
      return portfolioRes;
    }
    const role = this.matches.getRole(data.matchId, session.userId);
    const dealerResources = role === 'dealer'
      ? this.dealer.resources(data.matchId, session.userId)
      : undefined;
    return {
      code: 0,
      message: 'ok',
      data: { portfolio: portfolioRes.data, dealerResources },
    };
  }

  private enrichWithPortfolio(matchId: string | undefined, userId: string, res: any) {
    if (!matchId) return res;
    const portfolioRes = this.trading.portfolio(matchId, userId);
    if (portfolioRes.code !== 0 || !portfolioRes.data) return res;
    const role = this.matches.getRole(matchId, userId);
    const dealerResources = role === 'dealer'
      ? this.dealer.resources(matchId, userId)
      : undefined;
    const data = res.code === 0 && res.data
      ? { ...res.data, portfolio: portfolioRes.data, resources: dealerResources ?? res.data.resources }
      : { ...(res.data ?? {}), portfolio: portfolioRes.data, resources: dealerResources };
    return { ...res, data };
  }

  @SubscribeMessage('regulator:action')
  async onRegulatorAction(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const session = this.sessions.get(socket.id);
    if (!session?.userId) {
      socket.emit('regulator:result', { code: 401, message: '未鉴权' });
      return;
    }
    if (data?.matchId) {
      const role = this.matches.getRole(data.matchId, session.userId);
      if (role !== 'regulator') {
        socket.emit('regulator:result', { code: 403, message: '仅监管者可执法' });
        return;
      }
    }
    const res = await this.reg.resolve({ ...data, regulatorUserId: session.userId });
    socket.emit('regulator:result', res);
    if (data.matchId) {
      socket.to(`match:${data.matchId}`).emit('peer:regulator', res);
    }
  }

  @SubscribeMessage('select-symbol')
  async onSelectSymbol(@ConnectedSocket() socket: Socket, @MessageBody() data: { symbol: string }) {
    const session = this.sessions.get(socket.id);
    if (!session?.userId) return;
    this.matches.setSelectedSymbol(session.userId, data.symbol);
    const meta = STOCK_MAP[data.symbol];
    if (!meta) return;
    socket.emit('market:update', {
      symbol: data.symbol,
      quote: this.engine.getQuote(data.symbol),
      klines: this.engine.getKlines(data.symbol),
      orderBook: this.engine.getOrderBook(data.symbol),
      indicators: this.engine.getIndicators(data.symbol),
      timeline: this.engine.getTimeline(data.symbol),
    });
  }

  @SubscribeMessage('match:end')
  async onMatchEnd(@ConnectedSocket() socket: Socket, @MessageBody() data: { matchId: string; winnerId?: string }) {
    this.matches.endMatch(data.matchId, data.winnerId);
    this.server.of('/game').to(`match:${data.matchId}`).emit('match:end', data);
  }

  // ============================================================
  // Server → Client
  // ============================================================

  /**
   * 每 200ms 推送一次 tick 行情。
   * public room（大厅展示）+ 每个 match:xxx 房间。
   */
  private broadcastTick() {
    const symbols = Object.keys(STOCK_MAP);

    // 关键：一次 tick 推送全量 symbol，保证前端切换到任意股票时曲线都有实时数据。
    // payload 形如：
    //   market:tick (S→C) { quotes: { QDN: Quote, AAPL: Quote, ... }, orderBooks: { ... } }
    const quotes: Record<string, any> = {};
    const orderBooks: Record<string, any> = {};
    for (const sym of symbols) {
      const q = this.engine.getQuote(sym);
      if (q) quotes[sym] = q;
      orderBooks[sym] = this.engine.getOrderBook(sym);
    }

    const payload = { quotes, orderBooks };
    // 大厅
    this.server.to('public').emit('market:tick', payload);
    // 遍历已加入的 match room（adapter.rooms 是 Map<string, Set<Socket>>）
    const rooms = (this.server.adapter as any).rooms as Map<string, Set<any>>;
    for (const room of rooms.keys()) {
      if (typeof room === 'string' && room.startsWith('match:')) {
        this.server.to(room).emit('market:tick', payload);
      }
    }
  }

  /** 手动触发一次 ticker（由 REST 比如 /api/match/end 调用） */
  emitMatchEnd(matchId: string, payload: any) {
    this.server.to(`match:${matchId}`).emit('match:end', payload);
  }

  private emitToUser(userId: string, event: string, payload: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    for (const sid of sockets) {
      this.server.to(sid).emit(event, payload);
    }
  }
}

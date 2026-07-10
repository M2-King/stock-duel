/**
 * socket.io 客户端单例。命名空间 /game，与后端 GameGateway 一致。
 *
 * 设计要点：
 *  1. 单例：全局只有一个连接，避免 HMR 反复 connect。
 *  2. emitWithAck：把 socket.io 的 emit + Promise ack 统一包装，方便 gameStore await。
 *  3. on/off 暴露订阅接口给 store 直接用，不强制走 eventEmitter。
 *  4. 自动重连由 socket.io 内置完成，外部只需要 on('connect'|'disconnect') 同步状态。
 *
 * 后端事件一览（来自 apps/backend/src/gateway/game.gateway.ts）：
 *   auth              (C→S) { token | userId }
 *   join-match        (C→S) { matchId }
 *   leave-match       (C→S) { matchId }
 *   trade:buy         (C→S) { matchId, symbol, price, qty, leverage? }
 *   trade:sell        (C→S) { matchId, symbol, price, qty }
 *   dealer:action     (C→S) { matchId, type, power, cost, energy, riskIndex, symbol }
 *   regulator:action  (C→S) { matchId, alertId, action }
 *   select-symbol     (C→S) { symbol }
 *
 *   market:tick       (S→C) { symbol, quote, orderBook, timeline }
 *   market:news       (S→C) news
 *   market:special    (S→C) { symbol, newPrice, label, multiplier }
 *   market:update     (S→C) { symbol, quote, klines, orderBook, indicators, timeline }
 *   trade:result      (S→C) { side, code, data, message }
 *   dealer:result     (S→C) { code, data, message }
 *   regulator:result  (S→C) { code, data, message }
 *   regulator:freeze  (S→C) { symbol, maxSingle, maxDaily, expiresTick, restrictionType, ... }
 *   regulator:warn    (S→C) { symbol, maxSingle, maxDaily, expiresTick, restrictionType, ... }
 *   regulator:kick    (S→C) { penalizedUserId, fine, symbol, ... }
 *   match:snapshot    (S→C) { matchId, role, symbol, quote, klines, orderBook, indicators, portfolio?, dealerResources? }
 *   match:peer-join   (S→C) { userId, role }
 *   match:peer-leave  (S→C) { userId }
 *   peer:trade        (S→C) { userId, side, symbol }
 *   peer:dealer       (S→C) { userId, ...res }
 *   peer:regulator    (S→C) res
 *   match:end         (S→C) { matchId, winnerId }
 *   match:disconnect-warning (S→C) { matchId, userId, reconnectDeadline, message }
 *   match:peer-disconnect    (S→C) { matchId, userId, reconnectDeadline }
 *   match:forfeit            (S→C) { matchId, userId, winnerId?, message?, self? }
 *   match:destroyed          (S→C) { matchId?, code?, reason, message? }
 *   match:timeout              (S→C) { userId, message }
 *   match:downgrade            (S→C) { matchId, forfeitedUserId, botId, playerCount, message }
 *   room:update                (S→C) { code?, currentPlayers, requiredPlayers, mode? }
 *   room:ready                 (S→C) { code?, currentPlayers, requiredPlayers }
 *   room:countdown             (S→C) { code?, seconds, mode? }
 *   match:start                (S→C) { matchId, role, opponent?, opponents?, playerCount }
 *   room:closed                (S→C) { code, message }
 *   connected         (S→C) { userId, matchId? }
 *   error             (S→C) { message }
 */

import { io, Socket } from 'socket.io-client';
import { getWsNamespace, SOCKET_IO_PATH } from '../config';

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

/** Socket.IO 连接目标：localhost → http://localhost:3000/game；服务器 → /game */
function resolveWsUrl(): string {
  return getWsNamespace();
}

let socket: Socket | null = null;
let status: WsStatus = 'idle';
let authed = false;                   // backend session.userId 是否已建立（auth ack 收到）
let authWaiters: Array<() => void> = [];  // 等 auth 完成的 promise 队列
const statusListeners = new Set<(s: WsStatus) => void>();

export function markAuthed() {
  authed = true;
  const ws = authWaiters;
  authWaiters = [];
  ws.forEach((fn) => fn());
}

export function resetAuth() {
  authed = false;
}

export function isAuthed() {
  return authed;
}

function setStatus(next: WsStatus) {
  status = next;
  statusListeners.forEach((fn) => fn(next));
}

export function getWsStatus(): WsStatus {
  return status;
}

export function onWsStatus(fn: (s: WsStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

/** 启动一个 socket.io 连接。如已存在则直接返回。 */
export function connect(): Socket {
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io(resolveWsUrl(), {
      path: SOCKET_IO_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 6000,
      autoConnect: true,
    });

    socket.on('connect', () => { authed = false; setStatus('connected'); });
    socket.on('disconnect', () => { authed = false; setStatus('disconnected'); });
    socket.on('connect_error', () => setStatus('error'));
    socket.io.on('reconnect_attempt', () => { authed = false; setStatus('connecting'); });
  }
  setStatus(socket.connected ? 'connected' : 'connecting');
  return socket;
}

export function disconnect() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    authed = false;
    setStatus('idle');
  }
}

function getSocket(): Socket {
  return socket ?? connect();
}

/**
 * 等待 socket 连上（最多 timeoutMs 毫秒）。用于 join-match / auth 等必须在
 * 连接就绪之后才能发出的事件。socket.io 会自己 buffer 未连接的 emit，
 * 但 ack 回调可能在后端看到 session 之前就触发，从而误判为 401。所以这里
 * 主动 await 'connect'。
 */
export function waitForConnect(timeoutMs = 6000): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (s.connected) {
      resolve(s);
      return;
    }
    const timer = setTimeout(() => {
      s.off('connect', onConnect);
      reject(new Error(`WS 连接超时 (${timeoutMs}ms)`));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      s.off('connect', onConnect);
      resolve(s);
    };
    s.on('connect', onConnect);
  });
}

/**
 * 等待 auth ack 收到（服务端 session.userId 已建立）。
 *  - 如果 socket 还没连，会先等 connect
 *  - 如果已经 authed，立即 resolve
 *  - 如果超时（timeoutMs）还没收到 auth ack，reject
 */
export function waitForAuth(timeoutMs = 8000): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      await waitForConnect(timeoutMs);
    } catch (err) {
      reject(err);
      return;
    }
    if (authed) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      const idx = authWaiters.indexOf(thunk);
      if (idx >= 0) authWaiters.splice(idx, 1);
      reject(new Error(`WS auth 超时 (${timeoutMs}ms)`));
    }, timeoutMs);
    const thunk = () => {
      clearTimeout(timer);
      resolve();
    };
    authWaiters.push(thunk);
  });
}

/** 带超时的 ack 调用。后端 ack 形如 { ok, code?, data?, message? }。 */
export function emitWithAck<T = any>(event: string, payload: any, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`WS ack 超时: ${event}`));
    }, timeoutMs);

    s.emit(event, payload, (ack: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack as T);
    });
  });
}

// ============================================================
// 后端已经在专用 channel 发回的结果型 ack（trade:result / dealer:result / regulator:result）
// 这些不在 emit 的回调里，而是 server 通过 emit('xxx:result', ...) 推过来。
// 这里提供一个 once-with-timeout 帮助一次性等结果。
// ============================================================
export function onceWithTimeout<T = any>(event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`等待 ${event} 超时`));
    }, timeoutMs);
    s.once(event, (payload: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// ============================================================
// 事件订阅 API。返回 unsub 函数，方便 React useEffect 清理。
// ============================================================
type Handler = (payload: any) => void;
const listeners = new Map<string, Set<Handler>>();

function ensureChannel(event: string) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  const set = listeners.get(event)!;
  if (set.size === 0) {
    getSocket().on(event, (p: any) => listeners.get(event)!.forEach((fn) => fn(p)));
  }
}

export function on<T = any>(event: string, fn: (payload: T) => void): () => void {
  ensureChannel(event);
  listeners.get(event)!.add(fn as Handler);
  return () => {
    listeners.get(event)?.delete(fn as Handler);
  };
}

export function off(event: string, fn?: Handler) {
  if (!fn) {
    listeners.get(event)?.clear();
    return;
  }
  listeners.get(event)?.delete(fn);
}

// ============================================================
// 业务方法（高层 API，调用方直接 await）
// ============================================================
export async function auth(token?: string, userId?: string) {
  const ack = await emitWithAck<{ ok: boolean; userId?: string }>('auth', { token, userId });
  if (ack?.ok) {
    markAuthed();
    console.log('[WS] auth OK; userId=', ack.userId);
  } else {
    console.warn('[WS] auth failed', ack);
  }
  return ack;
}

export async function joinMatch(matchId: string) {
  return emitWithAck('join-match', { matchId });
}

export async function leaveMatch(matchId: string) {
  return emitWithAck('leave-match', { matchId });
}

export async function syncPortfolio(matchId: string) {
  return emitWithAck<{ code: number; data?: { portfolio: any; dealerResources?: any }; message?: string }>(
    'portfolio:sync',
    { matchId },
    8000,
  );
}

/** 下买单 + 等结果。注意：send 是 fire-and-forget；结果走 trade:result 事件。 */
export function sendBuy(payload: { matchId: string; symbol: string; price: number; quantity: number; leverage?: number }) {
  getSocket().emit('trade:buy', payload);
}
export function sendSell(payload: { matchId: string; symbol: string; price: number; quantity: number }) {
  getSocket().emit('trade:sell', payload);
}
export function sendDealerAction(payload: { matchId: string; type: string; power?: number; cost?: number; energy?: number; riskIndex?: number; symbol?: string }) {
  getSocket().emit('dealer:action', payload);
}
export function sendRegulatorAction(payload: { matchId: string; alertId: string; action: string; symbol?: string }) {
  getSocket().emit('regulator:action', payload);
}

export const WS_BASE = resolveWsUrl();
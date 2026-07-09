/**
 * 轻量 REST 客户端。负责把 fetch 包装成统一的 Ok/Fail 类型，并暴露连接状态。
 *
 *  - 后端可达：用 fetch 把响应解析成 { code, data, message } 并返回
 *  - 后端不可达 / 网络错误：返回 Fail('网络错误'|'后端未启用') 由调用方决定降级
 *
 *  baseURL 取自 src/config.ts → EFFECTIVE_API_BASE
 *  localhost → :3000；服务器 → 同源 Nginx 反代。VITE_BACKEND_URL 可覆盖。
 */

import { EFFECTIVE_API_BASE } from '../config';

const BASE_URL = EFFECTIVE_API_BASE;

export interface ApiResponse<T = any> {
  code: number;
  data: T | null;
  message: string;
}

const Fail = (message: string, code = 1, data: any = null): ApiResponse => ({
  code,
  data,
  message,
});

async function http<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: any,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // 后端存在但返回 4xx/5xx (验证失败、参数错)
      return Fail(`${method} ${path} → ${res.status}`, res.status, null);
    }
    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch (e: any) {
    return Fail(`网络错误: ${e?.message ?? e}`, -1, null);
  }
}

/**
 * 探测后端是否可达。
 * Nginx 反代场景下 /health 常被 SPA fallback 成 index.html（仍 200），
 * 因此优先探测 /api/auth/guest 并校验 JSON { code }。
 */
export async function pingBackend(): Promise<boolean> {
  const probes = [`${BASE_URL}/api/auth/guest`, `${BASE_URL}/health`];
  for (const url of probes) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok || res.status >= 500) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) continue;
      const json = (await res.json()) as { code?: number };
      if (typeof json?.code === 'number') return true;
    } catch {
      /* try next probe */
    }
  }
  return false;
}

// ============================================================
// Auth
// ============================================================
export const apiAuth = {
  /** guest 登录，返回 { user, token }。会带 userId 让重连幂等。 */
  async guest(userId?: string): Promise<ApiResponse<{ user: any; token: string }>> {
    return http('GET', `/api/auth/guest${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
  },
  async verify(token: string): Promise<ApiResponse<{ user: any }>> {
    return http('POST', '/api/auth/verify', { token });
  },
};

/** 通用 GET — 用于 preview-cost 等需要 query string 的接口 */
export async function get<T = any>(path: string): Promise<ApiResponse<T>> {
  return http('GET', path);
}

// ============================================================
// Match
// ============================================================
export const apiMatch = {
  async quickMatch(userId: string, preferredRole?: 'dealer' | 'retail' | 'regulator', playerCount?: number) {
    return http<{
      matchId: string;
      role: string;
      opponent: string | null;
      waiting?: boolean;
      currentPlayers?: number;
      requiredPlayers?: number;
    }>('POST', '/api/match/quick-match', { userId, preferredRole, playerCount });
  },
  async createRoom(hostId: string, playerCount?: number) {
    return http<{
      code: string;
      currentPlayers: number;
      requiredPlayers: number;
      waiting: boolean;
    }>('POST', '/api/match/create-room', { hostId, playerCount });
  },
  async joinRoom(userId: string, code: string) {
    return http<{
      matchId?: string;
      role?: string;
      opponent?: string;
      waiting: boolean;
      code: string;
      currentPlayers: number;
      requiredPlayers: number;
    }>('POST', '/api/match/join-room', { userId, code });
  },
  async cancelWaiting(userId: string) {
    return http<{ cancelled: boolean }>('POST', '/api/match/cancel-waiting', { userId });
  },
  /**
   * 单人 demo：不开匹配直接开局，对手为 AI bot。
   * 后端会立刻创建对局并返回 matchId，前端再走 ws.join-match 即可。
   */
  async solo(userId: string, role?: 'dealer' | 'retail' | 'regulator') {
    return http<{ matchId: string; role: string; opponentId: string }>('POST', '/api/match/solo', { userId, role });
  },
  async info(matchId: string) {
    return http<any>('GET', `/api/match/${encodeURIComponent(matchId)}`);
  },
  async lobby() {
    return http<{ activeMatches: number; queueSize: number; rooms: any[] }>('GET', '/api/match/lobby');
  },
};

// ============================================================
// Market (read-only)
// ============================================================
export const apiMarket = {
  async stocks() {
    return http<any[]>('GET', '/api/market/stocks');
  },
  async quote(symbol: string) {
    return http<any>('GET', `/api/market/${encodeURIComponent(symbol)}`);
  },
  async klines(symbol: string) {
    return http<any[]>('GET', `/api/market/${encodeURIComponent(symbol)}/kline`);
  },
  async orderBook(symbol: string) {
    return http<any>('GET', `/api/market/${encodeURIComponent(symbol)}/orderbook`);
  },
  async indicators(symbol: string) {
    return http<any>('GET', `/api/market/${encodeURIComponent(symbol)}/indicators`);
  },
};

// ============================================================
// Trading (REST 兜底，WS 优先)
// ============================================================
export const apiTrade = {
  async buy(body: { matchId: string; userId: string; symbol: string; price: number; quantity: number; leverage?: number; orderType?: 'market' | 'limit' }) {
    return http<any>('POST', '/api/trade/buy', body);
  },
  async sell(body: { matchId: string; userId: string; symbol: string; price: number; quantity: number }) {
    return http<any>('POST', '/api/trade/sell', body);
  },
  async portfolio(matchId: string, userId: string) {
    return http<any>('GET', `/api/trade/portfolio?matchId=${encodeURIComponent(matchId)}&userId=${encodeURIComponent(userId)}`);
  },
};

// ============================================================
// Dealer
// ============================================================
export const apiDealer = {
  async action(body: { matchId: string; userId: string; type: string; power?: number; cost?: number; energy?: number; riskIndex?: number; symbol?: string }) {
    return http<any>('POST', '/api/dealer/action', body);
  },
  async insider(body: { matchId: string; userId: string }) {
    return http<any>('POST', '/api/dealer/insider', body);
  },
  async resources(matchId: string, userId: string) {
    return http<any>('GET', `/api/dealer/resources?matchId=${encodeURIComponent(matchId)}&userId=${encodeURIComponent(userId)}`);
  },
};

// ============================================================
// Regulator
// ============================================================
export const apiRegulator = {
  async alerts(matchId: string) {
    return http<any>('GET', `/api/regulator/alerts?matchId=${encodeURIComponent(matchId)}`);
  },
  async resolve(body: { matchId: string; alertId: string; action: 'warn' | 'freeze' | 'kick' | 'dismiss'; symbol?: string }) {
    return http<any>('POST', '/api/regulator/resolve', body);
  },
  async scores(matchId: string) {
    return http<any>('GET', `/api/regulator/scores?matchId=${encodeURIComponent(matchId)}`);
  },
};

export const BASE = BASE_URL;

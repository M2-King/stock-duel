/**
 * 全局前后端地址配置。
 *
 * 三种部署形态：
 *  - localhost (5173 / 3000)    → 前端直连后端 localhost:3000
 *  - 服务器（同源反代）            → API 用 window.location.origin
 *                                  WS 拼 `${origin}/game` (Nginx proxy_pass /game → 3000)
 *  - VITE_BACKEND_URL 显式覆盖   → .env / .env.local / CI 用
 *
 * 反代约定（Nginx 侧）：
 *   location /api/  → proxy_pass http://127.0.0.1:3000/api/
 *   location /game/  → proxy_pass http://127.0.0.1:3000/game/   (socket.io)
 */

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

/** 解析 API base URL */
function resolveApiBase(): string {
  if (typeof window === 'undefined') return '';
  if (isLocalHostname(window.location.hostname)) {
    return 'http://localhost:3000';
  }
  // 服务器部署：Nginx 反代 /api 和 /game 到 3000 端口
  return window.location.origin;
}

/** 解析 WebSocket URL — socket.io 客户端会从 URL 自动挑 ws/wss scheme */
function resolveWsUrl(apiBase: string): string {
  if (typeof window === 'undefined') return '';
  if (isLocalHostname(window.location.hostname)) {
    // socket.io 客户端会自动把 http:// 换成 ws://
    return 'http://localhost:3000/game';
  }
  // 同源：Nginx 把 /game 反代到 3000 上的 socket.io
  return `${apiBase}/game`;
}

const API_BASE = resolveApiBase();
const WS_URL = resolveWsUrl(API_BASE);

/** VITE_BACKEND_URL 覆盖（.env / CI 用） */
const envOverride: string | undefined = (import.meta as any).env?.VITE_BACKEND_URL;

export const EFFECTIVE_API_BASE = envOverride ?? API_BASE;
export const EFFECTIVE_WS_URL = (() => {
  if (!envOverride) return WS_URL;
  // 把 http(s) 改写成 ws(s)，再拼 /game
  const wsBase = envOverride
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');
  return `${wsBase}/game`;
})();
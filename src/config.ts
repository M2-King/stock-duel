/**
 * 全局前后端地址配置。
 *
 * 本地开发 (localhost:5173) → 直连 NestJS localhost:3000
 * 服务器部署 (Nginx 反代 /api、/game) → 同源 window.location.origin
 *
 * VITE_BACKEND_URL 可强制覆盖（.env / .env.local）。
 */

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function resolveBases(): { api: string; ws: string } {
  if (typeof window === 'undefined') {
    return { api: '', ws: '' };
  }
  if (isLocalHostname(window.location.hostname)) {
    return {
      api: 'http://localhost:3000',
      ws: 'http://localhost:3000/game',
    };
  }
  const origin = window.location.origin;
  return {
    api: origin,
    ws: `${origin}/game`,
  };
}

const { api, ws } = resolveBases();

export const API_BASE = api;
export const WS_URL = ws;

const envOverride: string | undefined = (import.meta as any).env?.VITE_BACKEND_URL;

export const EFFECTIVE_API_BASE = envOverride ?? API_BASE;
export const EFFECTIVE_WS_URL = envOverride
  ? envOverride.replace(/^http/, 'ws').replace(/^https/, 'wss') + '/game'
  : WS_URL;

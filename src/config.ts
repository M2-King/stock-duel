/**
 * 全局前后端地址配置。
 *
 * Socket.IO 有两个概念，不要混用：
 *  - namespace（业务通道）: `/game`  ← NestJS @WebSocketGateway({ namespace: '/game' })
 *  - path（Engine 握手路径）: `/socket.io` ← 默认，客户端 io() 的 path 选项
 *
 * 客户端连接: io(WS_NAMESPACE, { path: SOCKET_IO_PATH })
 *  - WS_NAMESPACE = '/game'（不是 Engine path）
 *  - 实际 HTTP 握手: GET /socket.io/?EIO=4&transport=polling
 *
 * 三种部署形态：
 *  - localhost (5173 / 3000)    → 前端直连后端 localhost:3000
 *  - 服务器（同源反代）            → 相对路径 `/api`、`/game`（空 base）
 *  - VITE_BACKEND_URL 显式覆盖   → .env / .env.local / CI 用
 *
 * Nginx 反代约定（必须与 SOCKET_IO_PATH 一致）：
 *   location /api/       → proxy_pass http://127.0.0.1:3000/api/;
 *   location /socket.io/ → proxy_pass http://127.0.0.1:3000/socket.io/;
 *     proxy_http_version 1.1;
 *     proxy_set_header Upgrade $http_upgrade;
 *     proxy_set_header Connection "upgrade";
 *
 * 注意：反代 /game/ 不能替代 /socket.io/；/game 只是 namespace，不是 Engine path。
 */

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

/**
 * 解析 API base URL（每次调用时解析）。
 *  - VITE_BACKEND_URL → 显式覆盖
 *  - localhost → http://localhost:3000
 *  - 服务器同源反代 → ''（相对路径，fetch('/api/...')）
 */
export function resolveApiBase(): string {
  const envOverride: string | undefined = (import.meta as any).env?.VITE_BACKEND_URL;
  if (envOverride) return String(envOverride).replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  if (isLocalHostname(window.location.hostname)) {
    return 'http://localhost:3000';
  }
  // 服务器部署：空字符串 = 同源相对路径，避免写死 origin / 误用 localhost
  return '';
}

/** Socket.IO namespace（NestJS GameGateway） */
export const SOCKET_IO_NAMESPACE = '/game';

/** Socket.IO Engine 握手路径（与 Nginx location /socket.io/ 对应） */
export const SOCKET_IO_PATH = '/socket.io';

/** socket.io 连接用的 namespace URL */
export function resolveWsNamespace(): string {
  const envOverride: string | undefined = (import.meta as any).env?.VITE_BACKEND_URL;
  if (envOverride) {
    return `${String(envOverride).replace(/\/$/, '')}${SOCKET_IO_NAMESPACE}`;
  }
  if (typeof window === 'undefined') return SOCKET_IO_NAMESPACE;
  if (isLocalHostname(window.location.hostname)) {
    return `http://localhost:3000${SOCKET_IO_NAMESPACE}`;
  }
  // 同源部署：相对 namespace，Engine 仍走 /socket.io/
  return SOCKET_IO_NAMESPACE;
}

export function getApiBase(): string {
  return resolveApiBase();
}

export function getWsNamespace(): string {
  return resolveWsNamespace();
}

/** 明确导出名，供 wsService / apiService 使用 */
export const API_BASE = resolveApiBase();
export const WS_URL = resolveWsNamespace();

/**
 * 兼容旧导入名。注意：这是模块加载时求值一次的快照。
 * 新代码请用 getApiBase() / getWsNamespace() / WS_URL。
 */
export const EFFECTIVE_API_BASE = API_BASE;
export const EFFECTIVE_WS_NAMESPACE = WS_URL;
/** 兼容旧名 */
export const EFFECTIVE_WS_URL = WS_URL;

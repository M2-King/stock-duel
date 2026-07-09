/**
 * 全局前后端地址配置。
 * 本地开发 → localhost
 * 部署到服务器 / 局域网 → 49.235.107.48:3000
 *
 * 通过比对 window.location.hostname 自动选择。
 * （如果 host 是别的子域 / IP，可在此扩展。）
 */

export const API_BASE: string =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'http://49.235.107.48:3000';

export const WS_URL: string =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'ws://localhost:3000/game'
    : 'ws://49.235.107.48:3000/game';

/**
 * Vite 注入的覆盖：开发环境 .env / .env.local 可显式指定
 *   VITE_BACKEND_URL=http://192.168.1.5:3000
 * 一旦设置了，强制使用它（不走 hostname 自动判断）。
 */
const envOverride: string | undefined = (import.meta as any).env?.VITE_BACKEND_URL;

export const EFFECTIVE_API_BASE = envOverride ?? API_BASE;
export const EFFECTIVE_WS_URL = envOverride
  ? envOverride.replace(/^http/, 'ws') + '/game'
  : WS_URL;
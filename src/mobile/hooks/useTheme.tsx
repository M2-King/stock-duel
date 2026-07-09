/**
 * 主题切换 hook + provider。
 *
 * 主题模型：
 *  - 'dark'  → :root[data-theme="dark"]  （黑底白字）
 *  - 'light' → :root[data-theme="light"] （白底黑字）
 *
 * 持久化：
 *  - localStorage.theme      （用户偏好，覆盖 system）
 *  - 不存 → 跟随 prefers-color-scheme
 *
 * 切换时同步 document.documentElement.dataset.theme，避免
 * 「HTML attribute 还没更新 → 屏幕上闪一帧旧主题」。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'stock-duel-mobile-theme';

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

/** 在 documentElement 上设置 data-theme。无 SSR 时直接设置安全。 */
function applyToDOM(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/** 从 localStorage 或系统主题解析初始主题。 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* ignored */
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // mount 后立即同步一次，并监听系统主题变化（仅在用户没显式选过时生效）
  useEffect(() => {
    applyToDOM(theme);
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onSys = (e: MediaQueryListEvent) => {
      // 只在用户没手动存过时跟随系统
      try {
        if (window.localStorage.getItem(STORAGE_KEY)) return;
      } catch { /* ignored */ }
      setThemeState(e.matches ? 'light' : 'dark');
    };
    if (mql.addEventListener) mql.addEventListener('change', onSys);
    else mql.addListener(onSys);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onSys);
      else mql.removeListener(onSys);
    };
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyToDOM(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* storage may be disabled; theme still applies for the session */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<ThemeCtx>(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) {
    // 没在 ThemeProvider 里也能用兜底（比抛错友好）
    return {
      theme: 'dark',
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return v;
}

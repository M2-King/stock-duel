import { useEffect, useState } from 'react';

/**
 * 监听 window.innerWidth，返回当前视口宽度。
 * SSR-safe；初始值用 1024 占位，等 mount 后第一次 resize 用真值。
 */
export function useViewportWidth(): number {
  const [w, setW] = useState<number>(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setW(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

import { useEffect, useState } from 'react';

/**
 * 监听视口宽度，返回当前宽度（px）。
 *
 *  - SSR-safe：服务端返回 1024 占位，客户端首次渲染时取真实 innerWidth
 *  - 用 matchMedia 作为"快速通道"，并辅以 resize 事件双保险
 *  - 同时监听 orientationchange / visualViewport.resize（处理手机
 *    软键盘弹出 / 横竖屏切换时部分浏览器不触发 resize 的边角）
 */
export function useViewportWidth(): number {
  const [w, setW] = useState<number>(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      // visualViewport 在手机上更准确（包括地址栏折叠 / 软键盘）
      const vv = (window as any).visualViewport;
      const width = vv && vv.width ? vv.width : window.innerWidth;
      setW(width);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    if ((window as any).visualViewport) {
      (window as any).visualViewport.addEventListener('resize', update);
    }

    // matchMedia 变化时也强制同步一次（用户切桌面-移动模拟器时常用）
    const mql = window.matchMedia('(max-width: 767px)');
    const onMq = () => update();
    if (mql.addEventListener) mql.addEventListener('change', onMq);
    else mql.addListener(onMq);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if ((window as any).visualViewport) {
        (window as any).visualViewport.removeEventListener('resize', update);
      }
      if (mql.removeEventListener) mql.removeEventListener('change', onMq);
      else mql.removeListener(onMq);
    };
  }, []);

  return w;
}

/**
 * 返回一个 boolean：是否处于移动端宽度（< 768px）。
 * 同 useViewportWidth，但更适合直接用于条件渲染。
 */
export function useIsMobile(breakpoint = 768): boolean {
  return useViewportWidth() < breakpoint;
}
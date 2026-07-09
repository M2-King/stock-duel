/**
 * 移动端 sparkline — 纯 SVG，无依赖
 * 默认 56 高，宽 = 100% of container
 * 主题感知：跟随 :root[data-theme] 切换色调
 */

import { useEffect, useMemo, useState } from 'react';

interface Props {
  points: number[];
  className?: string;
  strokeWidth?: number;
}

export default function MobileSparkline({ points, className, strokeWidth = 1.5 }: Props) {
  const data = points && points.length ? points : [0, 0];

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      const v = document.documentElement.getAttribute('data-theme');
      setTheme(v === 'light' ? 'light' : 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const { path, area, fill, stroke } = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 100;
    const h = 100;
    const n = data.length;
    const px = (i: number) => (i / Math.max(n - 1, 1)) * w;
    const py = (v: number) => (1 - (v - min) / range) * h;
    const pathSegs = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(v).toFixed(2)}`).join(' ');
    const path = pathSegs;
    const area = `${pathSegs} L ${w} ${h} L 0 ${h} Z`;
    const up = data[n - 1] >= data[0];

    const isLight = theme === 'light';
    const stroke = up
      ? (isLight ? '#e11d48' : '#ff4d4f')
      : (isLight ? '#059669' : '#16c784');
    const fill = up
      ? (isLight ? 'rgba(225,29,72,0.16)' : 'rgba(255,77,79,0.16)')
      : (isLight ? 'rgba(5,150,105,0.16)' : 'rgba(22,199,132,0.16)');

    return { path, area, up, fill, stroke };
  }, [data, theme]);

  return (
    <svg
      className={className ?? 'm-spark'}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="m-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#m-spark-fill)" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth / 10 * 1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
/**
 * 移动端 sparkline — 纯 SVG，无依赖
 * 默认 56 高，宽 = 100% of container
 */

import { useMemo } from 'react';

interface Props {
  points: number[];
  className?: string;
  strokeWidth?: number;
}

export default function MobileSparkline({ points, className, strokeWidth = 1.5 }: Props) {
  const data = points && points.length ? points : [0, 0];

  const { path, area, last, first, up } = useMemo(() => {
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
    return { path, area, last: data[n - 1], first: data[0], up: data[n - 1] >= data[0] };
  }, [data]);

  const dir = up ? 'm-spark-up' : 'm-spark-down';
  const fill = up ? 'rgba(220,38,38,0.18)' : 'rgba(22,163,74,0.18)';

  // viewBox uses 100×100; preserveAspectRatio="none" so it fills width
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
      <path d={path} className={dir} fill="none" strokeWidth={strokeWidth / 10 * 1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

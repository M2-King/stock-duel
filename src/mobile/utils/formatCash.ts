/** 移动端统一现金展示格式 */
export function formatMobileCash(n: number): string {
  if (!Number.isFinite(n)) return '¥0';
  return `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

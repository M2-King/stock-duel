import { useCashBalance } from '../../hooks/useCashBalance';
import { formatMobileCash } from '../utils/formatCash';

interface Props {
  label?: string;
  className?: string;
  /** 可选：是否显示带前缀的 "¥" */
  withSymbol?: boolean;
}

/**
 * 可用资金 — Tools / Trade 共用。
 * 唯一来源：useCashBalance()（= store.cash），所有页面看到同一个值。
 */
export default function CashBalance({ className, withSymbol }: Props) {
  const { cash } = useCashBalance();
  const text = withSymbol ? `¥${formatMobileCash(cash)}` : formatMobileCash(cash);
  return <span className={className ?? 'value m-mono'}>{text}</span>;
}
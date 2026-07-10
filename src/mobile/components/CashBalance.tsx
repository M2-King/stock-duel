import { useGameStore } from '../../store/gameStore';
import { formatMobileCash } from '../utils/formatCash';

interface Props {
  label?: string;
  className?: string;
}

/** 可用资金 — Tools / Trade 共用，只读 store.cash */
export default function CashBalance({ className }: Props) {
  const cash = useGameStore((s) => s.cash);
  return (
    <span className={className ?? 'value m-mono'}>{formatMobileCash(cash)}</span>
  );
}

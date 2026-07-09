/**
 * 移动端匹配模式选择 — 与桌面 MatchModePopover 共用 MatchModeFlow + 样式。
 */
import { MatchModeFlow } from '../../components/MatchModePopover';
import '../../components/MatchModePopover.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileMatchModeSheet({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="m-match-sheet-shade" onClick={onClose} role="presentation">
      <div
        className="match-mode-popover match-mode-popover--sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="选择匹配模式"
      >
        <MatchModeFlow onClose={onClose} />
      </div>
    </div>
  );
}

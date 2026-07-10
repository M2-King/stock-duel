import { useGameStore } from '../../store/gameStore';

/** 全站唯一现金来源 — 与 store.cash / store.playerCash 同步 */
export function usePlayerCash(): number {
  return useGameStore((s) => s.cash);
}

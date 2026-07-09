/** Default per-stock trade limits before regulatory action (¥). */
export const DEFAULT_TRADE_MAX_SINGLE = 5_000_000;
export const DEFAULT_TRADE_MAX_DAILY = 50_000_000;

/** Freeze duration in match ticks. */
export const FREEZE_TICKS = 70;
export const WARN_TICKS = 30;

/** Dynamic limit multipliers (applied to avg turnover). */
export const FREEZE_SINGLE_RATIO = 0.1;
export const FREEZE_DAILY_RATIO = 0.3;
/** Warn is 20% more permissive than freeze. */
export const WARN_SINGLE_RATIO = FREEZE_SINGLE_RATIO * 1.2;
export const WARN_DAILY_RATIO = FREEZE_DAILY_RATIO * 1.2;

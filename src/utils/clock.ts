// Shared A-share trading clock. Single source of truth for both Header and StatusBar.
// Maps tick engine session + tick (0..60 per half-session) to wall-clock HH:MM[:SS].

export type Session = 'morning' | 'lunch' | 'afternoon' | 'closed';

export function clockFromTick(session: string, tick: number): string {
  if (session === 'morning') {
    // 09:30 .. 11:30 (60 ticks)
    const totalMin = 9 * 60 + 30 + tick;
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  if (session === 'afternoon') {
    // 13:00 .. 15:00 (60 ticks)
    const totalMin = 13 * 60 + tick;
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return '--:--';
}

// Seconds-precision variant for the StatusBar (one canonical clock only).
export function clockFromTickSeconds(session: string, tick: number): string {
  const base = clockFromTick(session, tick);
  if (base === '--:--') return '--:--:--';
  // Each tick = 1 minute simulated, so we approximate seconds with 00 / 30.
  const seconds = (tick % 2 === 0) ? '00' : '30';
  return `${base}:${seconds}`;
}

export const sessionLabel: Record<Session, string> = {
  morning: 'AM Session',
  lunch: 'Lunch Break',
  afternoon: 'PM Session',
  closed: 'Market Closed',
};
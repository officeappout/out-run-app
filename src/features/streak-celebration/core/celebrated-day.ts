/**
 * The day key of the last streak celebration shown on this device — the "once per day,
 * never twice for the same day" guard. localStorage, so it survives app restarts; a
 * failed read means "not shown", a failed write means it may show again (harmless).
 */
export const CELEBRATED_DAY_KEY = 'out-streak-celebrated-day-v1';

export function readCelebratedDay(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(CELEBRATED_DAY_KEY);
  } catch {
    return null;
  }
}

export function markCelebratedDay(dayKey: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(CELEBRATED_DAY_KEY, dayKey);
  } catch {
    /* storage unavailable */
  }
}

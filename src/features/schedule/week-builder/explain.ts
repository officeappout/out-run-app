/**
 * Week builder — the "why" line of every day, from the engine's own reasons (explain.dayReasons
 * over the edited layout), so a moved session gets the same explanation the engine would give.
 * Pure.
 */
import { longRunTargetDay, type DayAvailability } from '../engine-v2/availability';
import { dayReasons } from '../engine-v2/explain';
import { renderV2ReasonHe, type V2Reason } from '../engine-v2/reasonsV2';
import { toPlacedDays } from './layout';
import type { WbRules, WbWeek } from './types';

/** Codes that say nothing the card doesn't (rest / closed / "strength on its own day"). */
const GENERIC = new Set<V2Reason['code']>(['REST_DAY', 'NOT_AVAILABLE', 'STRENGTH_OWN_DAY']);

const trim = (s: string) => s.replace(/\.$/, '');

function availabilityOf<P>(week: WbWeek<P>): DayAvailability {
  const open = week.days.map((d) => d.open);
  return { open, marked: [...open], windows: week.days.map((d) => [d.window]), exception: week.days.map(() => null) };
}

/** "אימון ראשון בשבוע" / "48 שעות בין אימוני כוח" — the strength-only line (signup S-5c / S-2d). */
export function strengthGapLineHe(prevDow: number | null, dow: number): string {
  if (prevDow == null) return 'אימון ראשון בשבוע';
  const hours = (dow - prevDow) * 24;
  return hours >= 48 ? `${hours} שעות בין אימוני כוח` : `${hours} שעות מהאימון הקודם`;
}

/** Re-explains every day of `week` (keeps everything else). */
export function explainWeek<P>(week: WbWeek<P>, rules: Pick<WbRules, 'preferredLongRunDay'>): WbWeek<P> {
  const placed = toPlacedDays(week);
  const av = availabilityOf(week);
  const perDay = dayReasons(placed, { av, longRunTarget: longRunTargetDay(av.open, rules.preferredLongRunDay ?? null) });

  let prevStrength: number | null = null;
  const days = week.days.map((day, d) => {
    const strength = day.sessions.some((s) => s.track === 'strength');
    const reason = perDay[d].find((r) => !GENERIC.has(r.code));
    let whyHe: string | null = reason ? trim(renderV2ReasonHe(reason)) : null;
    if (!whyHe && strength) whyHe = strengthGapLineHe(prevStrength, d);
    if (strength) prevStrength = d;
    return { ...day, whyHe: day.sessions.length ? whyHe : null };
  });
  return { ...week, days };
}

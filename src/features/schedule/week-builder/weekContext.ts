/**
 * The week as one short line for Kelly ("סדר לי במילים", enable_week_builder_v1): the days that
 * hold a session, in order — "א׳ אימון איכות + רגליים · ב׳ דחיפה · ה׳ ריצה ארוכה". It goes into
 * the chat composer as the user's own words (never auto-sent), so Kelly gets the week the user
 * is looking at without any prompt change. Pure.
 */
import { DAY_LETTERS_HE } from '../utils/runWeekRecommendation';
import type { WbWeek } from './types';

export function weekContextLineHe<P>(week: WbWeek<P>): string {
  return week.days
    .filter((d) => d.sessions.length > 0)
    .map((d) => `${DAY_LETTERS_HE[d.dow]}׳ ${d.sessions.map((s) => s.titleHe).join(' + ')}`)
    .join(' · ');
}

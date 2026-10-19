/**
 * "אולי זה מה שחיפשת" — up to 4 situation-based shortcuts for the empty search screen. Pure:
 * the hook passes in what it knows (hour, parks within 1 km, events this week, groups nearby).
 */
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import type { ResultCategory } from './types';

export type SituationIcon = 'park' | 'strength' | 'help' | 'event' | 'route' | 'group';

export type SituationAction =
  | { type: 'category'; category: ResultCategory }
  | { type: 'muscle'; muscle: MuscleGroup };

export interface Situation {
  id: string;
  title: string;
  sub: string;
  icon: SituationIcon;
  action: SituationAction;
}

export interface SituationInput {
  hour: number;
  parksWithin1Km: number | null;
  eventsThisWeek: number;
  groupsNearby: number;
}

export function situationSuggestions(s: SituationInput): Situation[] {
  const out: Situation[] = [];
  if (s.parksWithin1Km && s.parksWithin1Km > 0) {
    out.push({ id: 'park', title: 'גינה קרובה', sub: s.parksWithin1Km === 1 ? 'גינה אחת עד 1 ק״מ' : `${s.parksWithin1Km} גינות עד 1 ק״מ`, icon: 'park', action: { type: 'category', category: 'parks' } });
  }
  // evening → a run; the rest of the day → a short bodyweight block
  if (s.hour >= 17 && s.hour < 22) {
    out.push({ id: 'run', title: 'ריצת ערב', sub: 'מסלולים לידך', icon: 'route', action: { type: 'category', category: 'routes' } });
  } else {
    out.push({ id: 'abs', title: 'תרגילי בטן', sub: 'בלי ציוד, מכל מקום', icon: 'strength', action: { type: 'muscle', muscle: 'abs' } });
  }
  out.push({ id: 'help', title: 'איך משתמשים', sub: 'סיור קצר ושאלות נפוצות', icon: 'help', action: { type: 'category', category: 'help' } });
  if (s.eventsThisWeek > 0) {
    out.push({ id: 'events', title: 'אירועים השבוע', sub: s.eventsThisWeek === 1 ? 'אירוע אחד בעיר שלך' : `${s.eventsThisWeek} בעיר שלך`, icon: 'event', action: { type: 'category', category: 'events' } });
  } else if (s.groupsNearby > 0) {
    out.push({ id: 'groups', title: 'קבוצות לידך', sub: `${s.groupsNearby} קבוצות פעילות`, icon: 'group', action: { type: 'category', category: 'social' } });
  }
  if (out.length < 4 && !out.some((x) => x.id === 'park')) {
    out.unshift({ id: 'parks', title: 'גינות כושר', sub: 'מצאו גינה לאימון', icon: 'park', action: { type: 'category', category: 'parks' } });
  }
  return out.slice(0, 4);
}

/** Events in the next 7 days (from `now`). */
export function countEventsThisWeek(dates: ReadonlyArray<Date | string | number | null | undefined>, now = new Date()): number {
  const start = now.getTime() - 12 * 3600_000;
  const end = now.getTime() + 7 * 24 * 3600_000;
  return dates.filter((d) => {
    const t = d instanceof Date ? d.getTime() : d != null ? new Date(d).getTime() : NaN;
    return Number.isFinite(t) && t >= start && t <= end;
  }).length;
}

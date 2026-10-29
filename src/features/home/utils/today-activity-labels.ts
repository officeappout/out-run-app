/**
 * today-activity-labels — copy for the home "today" activity cards (G7.3, Sderot pilot).
 *
 * A hybrid ("אימון משולב") completion is STYLED as strength on these cards (the 3-way
 * ActivityCategory has no hybrid bucket — fill colour/icon are a styling choice), but its
 * TEXT must never say strength. Before this, every fallback path — home remount after the
 * 30-min completion payload is consumed, a second workout the same day, a past-day view —
 * titled a hybrid card "אימון כוח" and subtitled it "· כוח". Pure; page.tsx + TodayActivityCard
 * apply it.
 */
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import { makeLiveT } from '@/lib/i18n/live-t';
import { home } from '@/messages/ns/home';

const t = makeLiveT(home);

const isHybrid = (savedCategory?: string, workoutType?: string) =>
  savedCategory === 'hybrid' || workoutType === 'hybrid';

/** Card title fallback when no real workout title exists (catalog `home`, `todayActivityLabels.title.*`). */
export function todayCardFallbackTitle(
  displayCategory: ActivityCategory,
  savedCategory?: string,
  workoutType?: string,
): string {
  return t(isHybrid(savedCategory, workoutType) ? 'todayActivityLabels.title.hybrid' : `todayActivityLabels.title.${displayCategory}`);
}

/** The short label after "N min ·" on the card (`todayActivityLabels.short.*`). */
export function todayCardShortLabel(displayCategory: ActivityCategory, workoutType?: string): string {
  return t(isHybrid(undefined, workoutType) ? 'todayActivityLabels.short.hybrid' : `todayActivityLabels.short.${displayCategory}`);
}

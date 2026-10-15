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

const CATEGORY_TITLE: Record<ActivityCategory, string> = {
  strength: 'אימון כוח',
  cardio: 'אימון אירובי',
  maintenance: 'גמישות ותנועתיות',
};

const CATEGORY_SHORT: Record<ActivityCategory, string> = {
  strength: 'כוח',
  cardio: 'אירובי',
  maintenance: 'גמישות',
};

export const HYBRID_TITLE = 'אימון משולב';
const HYBRID_SHORT = 'משולב';

const isHybrid = (savedCategory?: string, workoutType?: string) =>
  savedCategory === 'hybrid' || workoutType === 'hybrid';

/** Card title fallback when no real workout title exists. */
export function todayCardFallbackTitle(
  displayCategory: ActivityCategory,
  savedCategory?: string,
  workoutType?: string,
): string {
  return isHybrid(savedCategory, workoutType) ? HYBRID_TITLE : CATEGORY_TITLE[displayCategory];
}

/** The short label after "N דק' ·" on the card. */
export function todayCardShortLabel(displayCategory: ActivityCategory, workoutType?: string): string {
  return isHybrid(undefined, workoutType) ? HYBRID_SHORT : CATEGORY_SHORT[displayCategory];
}

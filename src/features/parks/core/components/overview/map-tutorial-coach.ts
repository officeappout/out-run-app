/**
 * enable_map_tutorial_v1 (board M7, L13): the workout drawer's tour targets. Literals of
 * MAP_TUTORIAL_COACH (onboarding/services/map-tutorial-tour.ts) — a test keeps them equal.
 */
import type { JourneyStripItem } from '@/components/ui/v2/journey-strip';

export const DRAWER_COACH = {
  walk: 'route-drawer-walk',
  strength: 'route-drawer-strength',
  strip: 'route-drawer-strip',
  start: 'route-drawer-start',
} as const;

/** PURE: mark the first walk / run block and the first strength block of the strip. */
export function tagDrawerCoach(items: readonly JourneyStripItem[]): JourneyStripItem[] {
  let walk = false;
  let strength = false;
  return items.map((it) => {
    if (!walk && (it.kind === 'aerobic' || it.kind === 'repeat')) {
      walk = true;
      return { ...it, coach: DRAWER_COACH.walk };
    }
    if (!strength && it.kind === 'strength') {
      strength = true;
      return { ...it, coach: DRAWER_COACH.strength };
    }
    return it;
  });
}

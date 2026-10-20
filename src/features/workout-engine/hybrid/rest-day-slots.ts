/**
 * The map's "מה עושים היום?" carousel on a REST day (enable_home_v2, owner-approved audit ש4,
 * 20.10.2026). PURE.
 *
 * A rest day = the user has a plan (strength / running) and nothing is planned today (no
 * strength day, no run, no walk) — the same day home shows recovery on.
 *  - strength cards drop: the full park workout (or its assessment prompt) and the route +
 *    strength stops;
 *  - the walk + strength card stays only while steps are still missing, and light (1 bolt →
 *    the engine's lowest difficulty);
 *  - the plan's own cards, the free walk / run and anything else stay as they are.
 * Not a rest day → the slots unchanged.
 */
import type { HybridSlot } from './hybrid-slots';
import { MIN_STEPS_GAP } from '@/features/home/utils/next-recommendation';

export interface MapRestDayInput {
  hasStrengthProgram: boolean;
  hasRunningPlan: boolean;
  strengthToday: boolean;
  runToday: boolean;
  walkToday: boolean;
}

export function isMapRestDay(i: MapRestDayInput): boolean {
  return (i.hasStrengthProgram || i.hasRunningPlan) && !i.strengthToday && !i.runToday && !i.walkToday;
}

/** Strength-led cards — gone on a rest day. */
const REST_DAY_DROPPED = new Set(['full_park', 'assessment_prompt', 'route_stops']);
/** The walk + strength cards (smart and legacy) — kept light while steps are missing. */
const WALK_STRENGTH_IDS = new Set(['walk_strength', 'recommended']);

export const REST_DAY_WALK_REASON = 'יום מנוחה — הליכה עם כוח קל להשלמת הצעדים';

/**
 * @param stepsRemaining today's missing steps; null = unknown (kept, light).
 */
export function restDaySlots(slots: readonly HybridSlot[], isRestDay: boolean, stepsRemaining: number | null): HybridSlot[] {
  if (!isRestDay) return [...slots];
  const stepsMissing = stepsRemaining == null || stepsRemaining >= MIN_STEPS_GAP;
  const out: HybridSlot[] = [];
  for (const s of slots) {
    if (REST_DAY_DROPPED.has(s.id)) continue;
    if (WALK_STRENGTH_IDS.has(s.id) && s.kind === 'hybrid') {
      if (!stepsMissing) continue;
      out.push({
        ...s,
        bolts: 1,
        preset: { ...s.preset, bolts: 1 },
        reason: REST_DAY_WALK_REASON,
        cacheKeySuffix: `${s.cacheKeySuffix ?? ''}|rest`,
      });
      continue;
    }
    out.push(s);
  }
  return out;
}

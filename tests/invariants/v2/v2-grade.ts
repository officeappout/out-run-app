/**
 * v2-grade.ts — grades one V2Run: hard H1–H5 (hard-invariants.ts) + H6–H8 (v2-invariants.ts)
 * + soft warnings. Shared by the vitest ratchet and scripts/audit/build-v2-matrix-bench.ts. Pure.
 *
 * Group-specific rules:
 *   day groups   H1–H8 + V1–V5
 *   topup        H2 (the completed domain only) + H4/H5; H1 against the user's HOME gear is
 *                reported as V6 (the generator is called without a location → park default)
 *   hybrid / route stops  H1/H4/H5 + H6 = "a station is never silently push-only";
 *                V8 a station with a pull bar and no pull; V9 route stops miss an active program's area
 *   day groups   V10 no pull gear, upper / pull day, no pullGap stamp
 *   any          V7 nothing generated
 */
import { checkHardInvariants, type HardId } from '../hard-invariants';
import { checkV2Hard, checkV2Soft, mainAreas, type V2HardId, type V2Violation } from './v2-invariants';
import type { V2Run } from './v2-runner';

export type AnyHardId = HardId | V2HardId;
export const ALL_HARD: AnyHardId[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'];
export const SOFT_LABELS_HE: Record<string, string> = {
  V1: 'יום תחתון/רגליים בלי רגליים',
  V2: 'כותרת סותרת את הפוקוס',
  V3: 'pullGap=push_only (רק דחיפה)',
  V4: 'יום עליון בלי דחיפה',
  V5: 'יום כל הגוף עם פחות מ-3 אזורים',
  V6: 'השלמת סטים לא לפי הציוד בבית',
  V7: 'לא נוצר אימון',
  V8: 'תחנה עם מתח בלי משיכה',
  V9: 'מסלול+עצירות מפספס אזור של תוכנית',
  V10: 'אין מתח אבל pullGap לא סומן',
};

export interface V2Graded {
  hard: V2Violation[];
  soft: V2Violation[];
}

export function gradeV2Run(r: V2Run): V2Graded {
  const g = r.scenario.group;
  const hard: V2Violation[] = [];
  const soft: V2Violation[] = [];
  const empty = r.workout.exercises.length === 0;
  if (empty) {
    soft.push({ id: 'V7', detail: `${g}: empty (${String(r.meta.hint ?? '')})` });
    return { hard, soft };
  }
  const base = checkHardInvariants(r.workout, r.hardCtx);
  if (g === 'topup') {
    for (const v of base) (v.id === 'H1' ? soft : hard).push(v.id === 'H1' ? { id: 'V6', detail: v.detail } : v);
    return { hard, soft };
  }
  hard.push(...base);
  if (g === 'hybrid' || g === 'route_stops') {
    const areas = mainAreas(r.workout);
    if (areas.size === 1 && areas.has('push')) hard.push({ id: 'H6', detail: `${g} station is push-only` });
    if (r.meta.pullGear && !areas.has('pull')) soft.push({ id: 'V8', detail: `station has pull gear, areas [${Array.from(areas).join(',')}]` });
    const miss = (r.meta.unionMissing as string[] | undefined) ?? [];
    if (miss.length) soft.push({ id: 'V9', detail: `programs [${(r.meta.targets as string[]).join(',')}] — stops miss [${miss.join(',')}]` });
    return { hard, soft };
  }
  if (r.v2Ctx) {
    hard.push(...checkV2Hard(r.workout, r.v2Ctx));
    soft.push(...checkV2Soft(r.workout, r.v2Ctx));
  }
  return { hard, soft };
}

/** The ratchet key of a run (scenario + bolt). */
export const runKey = (r: V2Run) => `${r.scenario.id}#b${r.bolt}`;

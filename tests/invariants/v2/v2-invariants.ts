/**
 * v2-invariants.ts — hard invariants H6–H8 for the enable_home_v2 strength path
 * (#539 day focus, #545 pull gap + why line) and the soft v2 checks. Pure.
 *
 *   H6 upper / pull day trains pull — ≥ 1 main pull exercise, OR (no pull gear here)
 *      the gap is stamped (`pullGap` core / push_only). With pull gear, pull is required.
 *      A `bodyweight_pull` stamp without a pull exercise is a lie → fail.
 *   H7 day focus matches the split — `workout.dayFocus` = the oracle's focus for this
 *      level × goals × strength days × day index (v2-oracle.ts), and every main exercise
 *      is inside the focus areas (+ core when the day took core for a pull gap).
 *   H8 why line consistent — the line the overview shows (whyLineOfWorkout, the same call
 *      WorkoutWhyLine makes) names the day's focus, the split and the days; says "אין מתח"
 *      only when there is no pull gear here and the day wants pull, with the right place
 *      word; and what it claims (gear-free pull / push + core) is in the workout.
 *
 *   soft (warnings, never fail CI): V1 lower day without legs · V2 title contradicts the
 *   focus · V3 push_only (nothing pull-ish or core fit) · V4 upper day without push ·
 *   V5 a full-body day trains < 3 areas · V10 no pull gear on an upper / pull day
 *   but no `pullGap` stamp (options of the same day explain it differently).
 */
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { strictDomainsOfExercise } from '@/features/workout-engine/logic/strict-focus.utils';
import { baseDomainOf, exName } from '../hard-invariants';
import { FOCUS_DOMAINS, FOCUS_HE, SPLIT_HE, type Focus, type OracleSplit } from './v2-oracle';

export type V2HardId = 'H6' | 'H7' | 'H8';
export const V2_HARD_LABELS: Record<V2HardId, string> = {
  H6: 'upper/pull day has pull (or flagged pullGap)',
  H7: 'day focus matches split',
  H8: 'why-line consistent with focus/equipment',
};
export const V2_HARD_LABELS_HE: Record<V2HardId, string> = {
  H6: 'יום עליון/משיכה כולל משיכה (או pullGap מסומן)',
  H7: 'פוקוס היום תואם לפיצול',
  H8: 'שורת "למה האימון" תואמת פוקוס/ציוד',
};

export interface V2Context {
  /** The oracle's focus for this day (null = no focus should apply). */
  expectedFocus: Focus | null;
  expectedSplit: OracleSplit;
  strengthDays: number;
  /** Does this place have real pull gear (bar / rings / TRX / band)? */
  pullGear: boolean;
  atHome: boolean;
  /** The line the overview shows for this workout (null = none). */
  whyLine: string | null;
}

export interface V2Violation { id: V2HardId | `V${number}` | `H${number}`; detail: string }

const isMain = (e: WorkoutExercise) => (e.exerciseRole ?? 'main') !== 'warmup' && e.exerciseRole !== 'cooldown';
const areasOf = (e: WorkoutExercise): string[] => {
  const s = new Set<string>(strictDomainsOfExercise(e.exercise));
  const b = baseDomainOf(e);
  if (b) s.add(b);
  return Array.from(s);
};
export const mainAreas = (w: GeneratedWorkout): Set<string> =>
  new Set(w.exercises.filter(isMain).flatMap(areasOf));

export function checkV2Hard(w: GeneratedWorkout, ctx: V2Context): V2Violation[] {
  const out: V2Violation[] = [];
  const main = w.exercises.filter(isMain);
  const areas = mainAreas(w);
  const focus = (w.dayFocus ?? null) as Focus | null;

  // H7 — focus = oracle; content inside the focus
  if (focus !== ctx.expectedFocus) out.push({ id: 'H7', detail: `dayFocus ${focus ?? '∅'} ≠ expected ${ctx.expectedFocus ?? '∅'} (${ctx.expectedSplit}, ${ctx.strengthDays}d)` });
  if (focus && focus !== 'full' && main.length) {
    const allowed = new Set<string>([...FOCUS_DOMAINS[focus], ...(w.pullGap ? ['core'] : [])]);
    const off = main.filter((e) => !areasOf(e).some((a) => allowed.has(a)));
    if (off.length) out.push({ id: 'H7', detail: `${focus} day has off-focus ${off.map((e) => `"${exName(e)}"(${baseDomainOf(e) ?? e.exercise?.movementGroup})`).slice(0, 3).join(', ')}` });
  }

  // H6 — an upper / pull day trains pull, or says why not
  if ((focus === 'upper' || focus === 'pull') && main.length) {
    const hasPull = areas.has('pull');
    if (w.pullGap === 'bodyweight_pull' && !hasPull) out.push({ id: 'H6', detail: 'pullGap=bodyweight_pull but no pull exercise' });
    if (!hasPull && ctx.pullGear) out.push({ id: 'H6', detail: `no pull although pull gear is here (pullGap=${w.pullGap ?? '∅'})` });
    if (!hasPull && !ctx.pullGear && !w.pullGap) out.push({ id: 'H6', detail: 'no pull, no pull gear, and no pullGap stamp (silent push-only)' });
  }

  // H8 — the why line
  const line = ctx.whyLine ?? '';
  if (focus && !ctx.whyLine) out.push({ id: 'H8', detail: `focus ${focus} but no why line` });
  if (ctx.whyLine) {
    const saysNoBar = line.includes('אין מתח');
    if (saysNoBar && ctx.pullGear) out.push({ id: 'H8', detail: `"${line}" but pull gear is here` });
    if (saysNoBar && focus && !['upper', 'pull', 'full'].includes(focus)) out.push({ id: 'H8', detail: `"${line}" on a ${focus} day` });
    if (saysNoBar) {
      const place = ctx.atHome ? 'בבית' : 'כאן';
      if (!line.includes(`אין מתח ${place}`)) out.push({ id: 'H8', detail: `"${line}" — place word should be "${place}"` });
      if (line.includes('משיכה בלי ציוד') && !areas.has('pull')) out.push({ id: 'H8', detail: `"${line}" but no pull exercise` });
      if (line.includes('דחיפה + ליבה') && !(areas.has('push') && areas.has('core'))) out.push({ id: 'H8', detail: `"${line}" but areas are [${Array.from(areas).join(',')}]` });
    } else if (focus) {
      if (!line.includes(FOCUS_HE[focus])) out.push({ id: 'H8', detail: `"${line}" does not name the ${focus} day (${FOCUS_HE[focus]})` });
      if (focus !== 'full' && !line.includes(SPLIT_HE[ctx.expectedSplit])) out.push({ id: 'H8', detail: `"${line}" does not name the split ${SPLIT_HE[ctx.expectedSplit]}` });
      if (ctx.strengthDays > 1 && !line.includes(`${ctx.strengthDays} ימים בשבוע`)) out.push({ id: 'H8', detail: `"${line}" — strength days should be ${ctx.strengthDays}` });
    }
    if (/undefined|null|NaN|\{|\}/.test(line)) out.push({ id: 'H8', detail: `broken copy "${line}"` });
  }
  return out;
}

export function checkV2Soft(w: GeneratedWorkout, ctx?: Pick<V2Context, 'pullGear'>): V2Violation[] {
  const out: V2Violation[] = [];
  const focus = (w.dayFocus ?? null) as Focus | null;
  const areas = mainAreas(w);
  if (!focus || !w.exercises.some(isMain)) return out;
  if ((focus === 'lower' || focus === 'legs') && !areas.has('legs')) out.push({ id: 'V1', detail: `${focus} day without legs [${Array.from(areas).join(',')}]` });
  const title = w.title ?? '';
  const wrongTitle = focus !== 'full' && title.includes(FOCUS_HE.full)
    || (focus === 'upper' && title.includes(FOCUS_HE.lower)) || (focus === 'lower' && title.includes(FOCUS_HE.upper));
  if (wrongTitle) out.push({ id: 'V2', detail: `title "${title}" on a ${focus} day` });
  if (w.pullGap === 'push_only') out.push({ id: 'V3', detail: 'push_only: no gear-free pull and no core fit' });
  if (focus === 'upper' && !areas.has('push')) out.push({ id: 'V4', detail: `upper day without push [${Array.from(areas).join(',')}]` });
  if (focus === 'full' && areas.size < 3) out.push({ id: 'V5', detail: `full-body day trains only [${Array.from(areas).join(',')}]` });
  if ((focus === 'upper' || focus === 'pull') && ctx && !ctx.pullGear && !w.pullGap) out.push({ id: 'V10', detail: `no pull gear but pullGap not stamped (areas [${Array.from(areas).join(',')}]) — the why line won't say "אין מתח"` });
  return out;
}

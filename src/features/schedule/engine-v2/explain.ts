/**
 * Reasons: one short Hebrew "why" per day, and week-level warnings. Typed codes first
 * (reasonsV2.ts renders them), so tests and Kelly can read codes and users read Hebrew.
 */
import { isKeySlot, isQualitySlot } from './config';
import { canonicalSlug, MODERATE_LEGS, profileOf } from './programProfiles';
import { gapDays, nextDay } from './rules';
import type { V2Reason } from './reasonsV2';
import type { DayAvailability } from './availability';
import type { PlacedSession, RunSlot } from './types';
import type { KeyRun } from '../engine/reasons';

const keyOf = (slot: RunSlot | undefined): KeyRun | null =>
  slot === 'long_run' ? 'long' : isQualitySlot(slot) ? 'quality' : null;

export interface DayReasonCtx {
  av: DayAvailability;
  longRunTarget: { day: number | null; source: 'preferred' | 'last_free' };
  makeupDays?: ReadonlySet<number>;
}

export function dayReasons(days: PlacedSession[][], ctx: DayReasonCtx): V2Reason[][] {
  const out: V2Reason[][] = [];
  for (let d = 0; d < 7; d++) {
    const r: V2Reason[] = [];
    const ss = days[d];
    const run = ss.find((s) => s.kind === 'run' && !s.optional);
    const strength = ss.filter((s) => s.kind === 'strength' && !s.optional);
    const mainStrength = strength.filter((s) => profileOf(s.slug ?? '').slotKind === 'main' || s.variantOf);
    const n = nextDay(d);
    const tomorrowRun = n !== null ? days[n].find((s) => s.kind === 'run' && !s.optional) : undefined;
    const tomorrowKey = keyOf(tomorrowRun?.slot);

    if (ss.some((s) => s.makeup)) r.push({ code: 'MAKEUP_MISSED', kind: run?.makeup ? 'run' : 'strength', day: d });
    if (run?.fixed) r.push({ code: 'GROUP_RUN_FILLS_SLOT', slot: run.slot!, time: run.time });
    if (run?.slot === 'long_run') {
      r.push({ code: 'LONG_RUN_PROTECTED' });
      if (ctx.longRunTarget.day === d) {
        r.push(ctx.longRunTarget.source === 'preferred' ? { code: 'LONG_RUN_PREFERRED_DAY', day: d } : { code: 'LONG_RUN_LAST_FREE_DAY', day: d });
      }
    }
    if (run && isQualitySlot(run.slot)) {
      const other = days.findIndex((x, e) => e !== d && x.some((s) => s.kind === 'run' && isQualitySlot(s.slot) && !s.optional));
      if (other >= 0 && gapDays(d, other) === 2) r.push({ code: 'RUN_SPACING' });
    }
    if (run && mainStrength.length) {
      const runFirst = ss.indexOf(run) < ss.indexOf(mainStrength[0]);
      if (isKeySlot(run.slot)) r.push({ code: 'QUALITY_RUN_FIRST', day: d });
      else if (!runFirst) r.push({ code: 'EASY_DOUBLE_STRENGTH_FIRST', day: d });
      else r.push({ code: 'EASY_DAY_DOUBLED', day: d });
    }
    if (mainStrength.length && !run) r.push({ code: 'STRENGTH_OWN_DAY' });
    if (mainStrength.some((s) => s.variantOf) && tomorrowKey) r.push({ code: 'FULL_BODY_NO_LEGS', run: tomorrowKey });
    else if (mainStrength.length && tomorrowKey && mainStrength.every((s) => profileOf(s.slug ?? '').load.legs < MODERATE_LEGS)) {
      r.push({ code: 'UPPER_ONLY_BEFORE_KEY_RUN', run: tomorrowKey });
    }
    if (strength.some((s) => s.combined)) r.push({ code: 'COMBINED_SESSION' });
    if (strength.some((s) => s.volumePct === 50 && canonicalSlug(s.slug ?? '') === 'front_lever')) r.push({ code: 'OAPU_RECOVERY_SESSION' });
    if (strength.some((s) => canonicalSlug(s.slug ?? '') === 'handstand')) r.push({ code: 'HANDSTAND_FREE_SLOT' });
    if (ss.some((s) => s.kind === 'mobility')) r.push({ code: 'MOBILITY_AFTER_RUN' });
    if (ss.some((s) => s.kind === 'walk')) r.push({ code: 'WALK_REST_DAY' });
    if (ss.some((s) => s.optional && s.kind !== 'walk')) r.push({ code: 'TRAVEL_DAY_OPTIONAL' });
    if (r.length === 0 && run) r.push({ code: 'RUN_OWN_DAY', slot: run.slot! });
    if (ss.length === 0) r.push(ctx.av.marked[d] && !ctx.av.exception[d] ? { code: 'REST_DAY' } : { code: 'NOT_AVAILABLE' });
    out.push(r);
  }
  return out;
}

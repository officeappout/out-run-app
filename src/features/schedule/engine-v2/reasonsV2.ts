/**
 * Engine v2 reasons — typed codes + ONE Hebrew renderer, in the same style as
 * engine/reasons.ts (which stays the renderer for every code it already knows: v2 reuses
 * those codes and delegates to renderScheduleReasonHe, so the two never drift).
 * Never emits an internal id ("easy_run", "UPPER_BODY") into user text.
 */
import {
  renderScheduleReasonHe,
  type KeyRun,
  type ScheduleReason,
} from '../engine/reasons';
import { RUNNING_SLOT_NAME_HE } from '../engine/runningRules';
import type { RunSlot } from './types';
import { defaultScheduleT, type ScheduleT } from '../engine/schedule-t';

export type V2OnlyReason =
  // ── per day ──
  | { code: 'LONG_RUN_PREFERRED_DAY'; day: number }
  | { code: 'LONG_RUN_LAST_FREE_DAY'; day: number }
  | { code: 'UPPER_ONLY_BEFORE_KEY_RUN'; run: KeyRun }
  | { code: 'FULL_BODY_NO_LEGS'; run: KeyRun }
  | { code: 'STRENGTH_OWN_DAY' }
  | { code: 'DOUBLE_ON_QUALITY_DAY'; day: number }
  | { code: 'EASY_DOUBLE_STRENGTH_FIRST'; day: number }
  | { code: 'COMBINED_SESSION' }
  | { code: 'OAPU_RECOVERY_SESSION' }
  | { code: 'HANDSTAND_FREE_SLOT' }
  | { code: 'MOBILITY_AFTER_RUN' }
  | { code: 'WALK_REST_DAY' }
  | { code: 'NOT_AVAILABLE' }
  | { code: 'TRAVEL_DAY_OPTIONAL' }
  | { code: 'GROUP_RUN_FILLS_SLOT'; slot: RunSlot; time?: string }
  | { code: 'MOVED_FOR_MAKEUP' }
  | { code: 'RUN_OWN_DAY'; slot: RunSlot }
  // ── per week ──
  | { code: 'STRENGTH_FLOOR_UNMET_AVAILABILITY'; days: number; floor: number }
  | { code: 'OPTIONAL_MIDWEEK_MICRO_SESSION' }
  | { code: 'DAYS_BELOW_SKILL_MIN'; skills: number; required: number; available: number }
  | { code: 'LONG_TRAINING_STREAK'; days: number }
  | { code: 'STRENGTH_REDUCED_LONG_RUN_PROTECTED' }
  | { code: 'STRENGTH_MERGED' }
  | { code: 'Q2_TO_EASY' }
  | { code: 'DELOAD_WEEK'; strength: boolean; running: boolean }
  | { code: 'TRAVEL_WEEK' }
  | { code: 'STEPS_DAILY'; goal: number }
  | { code: 'RUN_WEEK_REPEATED' }
  | { code: 'RE_ENTRY' }
  | { code: 'MAKEUP_DROPPED'; kind: 'strength' | 'run'; why: 'too_old' | 'no_room' | 'easy_run' | 'week_limit' }
  | { code: 'LONG_RUN_NEXT_CAP' }
  | { code: 'SEARCH_TRUNCATED' };

export type V2Reason = ScheduleReason | V2OnlyReason;
export type V2ReasonCode = V2Reason['code'];

// Weekday names stay here for wave 3 (fmt): Intl would not produce the same Hebrew.
const DAY_NAME_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const; // i18n-allow-hebrew: weekday names (wave 3)
export const dayNameHe = (day: number): string => DAY_NAME_HE[((day % 7) + 7) % 7];
const dayHe = (t: ScheduleT, day: number) => t('engine.dayLabel', { name: dayNameHe(day) });
const keyRunHe = (t: ScheduleT, run: KeyRun) => t('engine.keyRun', { run });

const V2_ONLY_CODES = new Set<string>([
  'LONG_RUN_PREFERRED_DAY', 'LONG_RUN_LAST_FREE_DAY', 'UPPER_ONLY_BEFORE_KEY_RUN', 'FULL_BODY_NO_LEGS',
  'STRENGTH_OWN_DAY', 'DOUBLE_ON_QUALITY_DAY', 'EASY_DOUBLE_STRENGTH_FIRST', 'COMBINED_SESSION',
  'OAPU_RECOVERY_SESSION', 'HANDSTAND_FREE_SLOT', 'MOBILITY_AFTER_RUN', 'WALK_REST_DAY', 'NOT_AVAILABLE',
  'TRAVEL_DAY_OPTIONAL', 'GROUP_RUN_FILLS_SLOT', 'MOVED_FOR_MAKEUP', 'RUN_OWN_DAY', 'STRENGTH_FLOOR_UNMET_AVAILABILITY',
  'OPTIONAL_MIDWEEK_MICRO_SESSION', 'DAYS_BELOW_SKILL_MIN', 'LONG_TRAINING_STREAK',
  'STRENGTH_REDUCED_LONG_RUN_PROTECTED', 'STRENGTH_MERGED', 'Q2_TO_EASY', 'DELOAD_WEEK', 'TRAVEL_WEEK',
  'STEPS_DAILY', 'RUN_WEEK_REPEATED', 'RE_ENTRY', 'MAKEUP_DROPPED', 'LONG_RUN_NEXT_CAP', 'SEARCH_TRUNCATED',
]);

function isV2Only(r: V2Reason): r is V2OnlyReason {
  return V2_ONLY_CODES.has(r.code);
}

function renderV2OnlyHe(r: V2OnlyReason, t: ScheduleT): string {
  switch (r.code) {
    case 'LONG_RUN_PREFERRED_DAY':
    case 'LONG_RUN_LAST_FREE_DAY':
    case 'DOUBLE_ON_QUALITY_DAY':
    case 'EASY_DOUBLE_STRENGTH_FIRST':
      return t(`engine.reason.${r.code}`, { day: dayHe(t, r.day) });
    case 'UPPER_ONLY_BEFORE_KEY_RUN':
    case 'FULL_BODY_NO_LEGS':
      return t(`engine.reason.${r.code}`, { run: keyRunHe(t, r.run) });
    case 'STRENGTH_OWN_DAY':
    case 'COMBINED_SESSION':
    case 'OAPU_RECOVERY_SESSION':
    case 'HANDSTAND_FREE_SLOT':
    case 'MOBILITY_AFTER_RUN':
    case 'WALK_REST_DAY':
    case 'NOT_AVAILABLE':
    case 'TRAVEL_DAY_OPTIONAL':
    case 'MOVED_FOR_MAKEUP':
    case 'OPTIONAL_MIDWEEK_MICRO_SESSION':
    case 'STRENGTH_REDUCED_LONG_RUN_PROTECTED':
    case 'STRENGTH_MERGED':
    case 'Q2_TO_EASY':
    case 'TRAVEL_WEEK':
    case 'RUN_WEEK_REPEATED':
    case 'RE_ENTRY':
    case 'LONG_RUN_NEXT_CAP':
    case 'SEARCH_TRUNCATED':
      return t(`engine.reason.${r.code}`);
    case 'GROUP_RUN_FILLS_SLOT':
      return t('engine.reason.GROUP_RUN_FILLS_SLOT', {
        hasTime: r.time ? 'yes' : 'no',
        time: r.time ?? '',
        slot: RUNNING_SLOT_NAME_HE[r.slot],
      });
    case 'RUN_OWN_DAY':
      return t('engine.reason.RUN_OWN_DAY', { slot: RUNNING_SLOT_NAME_HE[r.slot] });
    case 'STRENGTH_FLOOR_UNMET_AVAILABILITY':
      return t('engine.reason.STRENGTH_FLOOR_UNMET_AVAILABILITY', { days: r.days, floor: String(r.floor) });
    case 'DAYS_BELOW_SKILL_MIN':
      return t('engine.reason.DAYS_BELOW_SKILL_MIN', {
        skills: String(r.skills),
        required: String(r.required),
        available: String(r.available),
      });
    case 'LONG_TRAINING_STREAK':
      return t('engine.reason.LONG_TRAINING_STREAK', { days: String(r.days) });
    case 'DELOAD_WEEK':
      return t('engine.reason.DELOAD_WEEK', { scope: r.strength && r.running ? 'both' : r.strength ? 'strength' : 'running' });
    case 'STEPS_DAILY':
      return t('engine.reason.STEPS_DAILY', { goal: r.goal.toLocaleString('en-US') });
    case 'MAKEUP_DROPPED':
      return t('engine.reason.MAKEUP_DROPPED', { why: r.why });
  }
}

/** `t` defaults to Hebrew. The codes shared with engine/reasons.ts are still rendered by that (Hebrew-only) renderer. */
export function renderV2ReasonHe(r: V2Reason, t: ScheduleT = defaultScheduleT()): string {
  return isV2Only(r) ? renderV2OnlyHe(r, t) : renderScheduleReasonHe(r);
}

export function renderV2ReasonsHe(reasons: readonly V2Reason[], t: ScheduleT = defaultScheduleT()): string[] {
  const out: string[] = [];
  for (const r of reasons) {
    const text = renderV2ReasonHe(r, t);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

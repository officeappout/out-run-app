/**
 * Missed-workout policy (§4.5): the latest miss only, ≤ MAKEUP_MAX_AGE_DAYS old, at most one
 * makeup per week. Order: shift → swap (long run ↔ easy day) / promote (Q2 → Q1) → merge
 * (strength, combined) → drop. Never doubles volume (H9): one key run and one main
 * strength session per day, no next-week compensation. Pure.
 */
import { MAKEUP_MAX_AGE_DAYS } from '@/lib/calm-return/policy';
import { isKeySlot, isQualitySlot, MAKEUP_PER_WEEK, MAKEUP_WEIGHTS, COMBINED_VOLUME_PCT, STRENGTH_FLOOR_DAYS } from './config';
import { resolveDays } from './availability';
import { refKey } from './diff';
import { orderDay } from './finalize';
import { H6_PATTERNS, profileOf, SHARED_PATTERN_LOAD } from './programProfiles';
import { renderV2ReasonsHe, type V2Reason } from './reasonsV2';
import { validateLayout } from './validate';
import { makeRunUnit, makeStrengthUnit } from './units';
import type { PlacedSession, ScheduleEngineInput, SessionRef } from './types';

export interface MakeupInput {
  /** Availability, levels and priority of the user (programs are read for profiles only). */
  week: ScheduleEngineInput;
  /** The current week as planned (0 = Sunday). */
  planned: Partial<Record<number, SessionRef[]>>;
  missed: { dow: number; weekOffset?: number; session: SessionRef };
  todayDow: number;
  makeupsThisWeek?: number;
}

export type MakeupAction = 'shift' | 'swap' | 'promote' | 'merge' | 'drop';

export interface MakeupChange {
  action: MakeupAction;
  session: SessionRef & { makeup?: boolean };
  fromDow?: number;
  toDow?: number;
}

export interface MakeupPlan {
  action: MakeupAction;
  changes: MakeupChange[];
  layout: PlacedSession[][];
  /** Other valid options, cheapest first (e.g. "Wednesday, after Q2"). */
  alternatives: Array<{ action: MakeupAction; toDow: number; cost: number }>;
  reasons: V2Reason[];
  reasonsHe: string[];
}

type Week = SessionRef[][];

const cloneWeek = (w: Week): Week => w.map((d) => [...d]);
const isRun = (r: SessionRef): r is Extract<SessionRef, { kind: 'run' }> => r.kind === 'run';

function toWeek(planned: MakeupInput['planned']): Week {
  return Array.from({ length: 7 }, (_, d) => [...(planned[d] ?? [])]);
}

function toLayout(w: Week, makeupDay: number | null, makeupRef: SessionRef | null, priority: ScheduleEngineInput['priority']): PlacedSession[][] {
  return w.map((refs, d) => {
    const run = refs.find(isRun);
    const strength = refs.filter((r): r is Extract<SessionRef, { kind: 'strength' }> => r.kind === 'strength');
    const runU = run ? makeRunUnit(run.slot) : null;
    let strU = strength[0] ? makeStrengthUnit(strength[0].slug) : null;
    if (strU && strength.length > 1) strU = { ...strU, slugs: strength.map((s) => s.slug), combined: true };
    const sessions = orderDay(runU, strU, priority ?? 'balanced');
    if (makeupDay === d && makeupRef) {
      for (const s of sessions) {
        if ((isRun(makeupRef) && s.slot === makeupRef.slot) || (!isRun(makeupRef) && s.slug === makeupRef.slug)) s.makeup = true;
      }
    }
    for (const s of sessions) if (s.combined) s.volumePct = COMBINED_VOLUME_PCT;
    return sessions;
  });
}

function violationKeys(w: Week, input: MakeupInput): Set<string> {
  const av = resolveDays(input.week.availability, 0);
  const v = validateLayout(
    toLayout(w, null, null, input.week.priority),
    { open: av.open.map((o, d) => o || w[d].length > 0), maxPerDay: input.week.availability.maxSessionsPerDay },
    input.week.levels.running,
  );
  return new Set(v.map((x) => `${x.rule}:${x.days.join(',')}`));
}

function introducesViolation(w: Week, baseline: Set<string>, input: MakeupInput): boolean {
  return Array.from(violationKeys(w, input)).some((k) => !baseline.has(k));
}

const sharesPattern = (a: string, b: string) => {
  const pa = profileOf(a).load;
  const pb = profileOf(b).load;
  return H6_PATTERNS.some((p) => pa[p] >= SHARED_PATTERN_LOAD && pb[p] >= SHARED_PATTERN_LOAD);
};

const keyRunOn = (w: Week, d: number) => d >= 0 && d < 7 && w[d].some((r) => isRun(r) && isKeySlot(r.slot));

export function planMakeup(input: MakeupInput): MakeupPlan {
  const { missed, todayDow } = input;
  const ref = missed.session;
  const base = toWeek(input.planned);
  // The missed session didn't happen: take it off its day (same week only).
  if (!missed.weekOffset) {
    const i = base[missed.dow].findIndex((r) => refKey(r) === refKey(ref));
    if (i >= 0) base[missed.dow].splice(i, 1);
  }
  const baseline = violationKeys(base, input);
  const av = resolveDays(input.week.availability, todayDow);
  const maxPerDay = input.week.availability.maxSessionsPerDay;
  const age = todayDow - (missed.dow + 7 * (missed.weekOffset ?? 0));
  const reasons: V2Reason[] = [];
  const kindOf = isRun(ref) ? 'run' : 'strength';

  const drop = (why: 'too_old' | 'no_room' | 'easy_run' | 'week_limit'): MakeupPlan => {
    reasons.push({ code: 'MAKEUP_DROPPED', kind: kindOf, why });
    if (isRun(ref) && ref.slot === 'long_run') reasons.push({ code: 'LONG_RUN_NEXT_CAP' });
    if (!isRun(ref)) {
      const days = base.filter((d) => d.some((r) => r.kind === 'strength')).length;
      if (days < STRENGTH_FLOOR_DAYS) reasons.push({ code: 'WHO_STRENGTH_GAP', done: days, target: STRENGTH_FLOOR_DAYS });
    }
    return {
      action: 'drop',
      changes: [{ action: 'drop', session: ref, fromDow: missed.dow }],
      layout: toLayout(base, null, null, input.week.priority),
      alternatives: [],
      reasons,
      reasonsHe: renderV2ReasonsHe(reasons),
    };
  };

  if ((input.makeupsThisWeek ?? 0) >= MAKEUP_PER_WEEK) return drop('week_limit');
  if (age > MAKEUP_MAX_AGE_DAYS || age < 1) return drop('too_old');
  if (isRun(ref) && (ref.slot === 'easy_run' || ref.slot === 'recovery')) return drop('easy_run');

  // ── shift ──
  type Cand = { cost: number; week: Week; day: number; moved?: { from: number; to: number; ref: SessionRef } };
  const cands: Cand[] = [];
  const lastDay = isRun(ref) && isQualitySlot(ref.slot) ? Math.min(6, missed.dow + 7 * (missed.weekOffset ?? 0) + 2) : 6;
  for (let d = todayDow; d <= lastDay; d++) {
    if (!av.open[d]) continue;
    const w = cloneWeek(base);
    let moved: Cand['moved'];
    if (isRun(ref)) {
      if (w[d].some(isRun)) continue;
      // A key-run makeup needs 48h to the next / previous key run (never double load).
      if (isKeySlot(ref.slot) && (keyRunOn(w, d - 1) || keyRunOn(w, d + 1))) continue;
      const str = w[d].find((r) => r.kind === 'strength');
      const mustMove = !!str && (ref.slot === 'long_run' || w[d].length + 1 > maxPerDay);
      w[d].push(ref);
      if (mustMove && str) {
        w[d] = w[d].filter((r) => r !== str);
        let placed = false;
        for (const e of [0, 1, 2, 3, 4, 5, 6].sort((a, b) => Math.abs(a - d) - Math.abs(b - d))) {
          if (e === d || e < todayDow || !av.open[e] || w[e].some((r) => r.kind === 'strength')) continue;
          if (w[e].length + 1 > maxPerDay || w[e].some((r) => isRun(r) && r.slot === 'long_run')) continue;
          w[e].push(str);
          if (introducesViolation(w, baseline, input)) {
            w[e].pop();
            continue;
          }
          moved = { from: d, to: e, ref: str };
          placed = true;
          break;
        }
        if (!placed) continue;
      }
    } else {
      if (w[d].some((r) => r.kind === 'strength')) continue;
      if (w[d].some((r) => isRun(r) && r.slot === 'long_run')) continue;
      if (w[d].length + 1 > maxPerDay) continue;
      w[d].push(ref);
    }
    if (introducesViolation(w, baseline, input)) continue;
    const double = w[d].length > 1 ? 1 : 0;
    cands.push({
      cost: (d - todayDow) * MAKEUP_WEIGHTS.DELAY_PER_DAY + double * MAKEUP_WEIGHTS.DOUBLE + (moved ? MAKEUP_WEIGHTS.MOVE_OTHER : 0),
      week: w,
      day: d,
      moved,
    });
  }
  cands.sort((a, b) => a.cost - b.cost || a.day - b.day);
  if (cands.length) {
    const c = cands[0];
    const changes: MakeupChange[] = [{ action: 'shift', session: { ...ref, makeup: true }, fromDow: missed.dow, toDow: c.day }];
    if (c.moved) changes.push({ action: 'shift', session: c.moved.ref, fromDow: c.moved.from, toDow: c.moved.to });
    reasons.push({ code: 'MAKEUP_MISSED', kind: kindOf, day: missed.dow });
    if (c.moved) reasons.push({ code: 'MOVED_FOR_MAKEUP' });
    return {
      action: 'shift',
      changes,
      layout: toLayout(c.week, c.day, ref, input.week.priority),
      alternatives: cands.slice(1).map((x) => ({ action: 'shift' as const, toDow: x.day, cost: x.cost })),
      reasons,
      reasonsHe: renderV2ReasonsHe(reasons),
    };
  }

  // ── swap / promote (runs) ──
  if (isRun(ref)) {
    const swapFrom: 'easy_run' | 'quality_secondary' | null =
      ref.slot === 'long_run' ? 'easy_run' : ref.slot === 'quality_primary' ? 'quality_secondary' : null;
    for (let e = todayDow; swapFrom && e < 7; e++) {
      const i = base[e].findIndex((r) => isRun(r) && r.slot === swapFrom);
      if (i < 0) continue;
      const w = cloneWeek(base);
      w[e][i] = ref;
      if (ref.slot === 'long_run') w[e] = w[e].filter((r) => r.kind !== 'strength');
      if (introducesViolation(w, baseline, input)) continue;
      const action: MakeupAction = ref.slot === 'long_run' ? 'swap' : 'promote';
      reasons.push({ code: 'MAKEUP_MISSED', kind: 'run', day: missed.dow });
      return {
        action,
        changes: [
          { action, session: { ...ref, makeup: true }, fromDow: missed.dow, toDow: e },
          { action: 'drop', session: { kind: 'run', slot: swapFrom }, fromDow: e },
        ],
        layout: toLayout(w, e, ref, input.week.priority),
        alternatives: [],
        reasons,
        reasonsHe: renderV2ReasonsHe(reasons),
      };
    }
    return drop('no_room');
  }

  // ── merge (strength, different patterns) ──
  for (let e = todayDow; e < 7; e++) {
    const host = base[e].find((r): r is Extract<SessionRef, { kind: 'strength' }> => r.kind === 'strength');
    if (!host || sharesPattern(host.slug, ref.slug)) continue;
    const w = cloneWeek(base);
    w[e].push(ref);
    if (introducesViolation(w, baseline, input)) continue;
    reasons.push({ code: 'MAKEUP_MISSED', kind: 'strength', day: missed.dow }, { code: 'COMBINED_SESSION' });
    return {
      action: 'merge',
      changes: [{ action: 'merge', session: { ...ref, makeup: true }, fromDow: missed.dow, toDow: e }],
      layout: toLayout(w, e, ref, input.week.priority),
      alternatives: [],
      reasons,
      reasonsHe: renderV2ReasonsHe(reasons),
    };
  }
  return drop('no_room');
}

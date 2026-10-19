/**
 * Grid → ordered sessions per day: in-day order (H5), windows, free slots (handstand first,
 * mobility after runs), walks toward the weekly aerobic target, deload / combined /
 * post-OAPU volumes, and optional travel-day sessions. Pure.
 */
import { RUNNING_MODERATE_EQUIV_FACTOR } from '@/lib/who-strength-target';
import {
  COMBINED_VOLUME_PCT,
  isKeySlot,
  MOBILITY_MINUTES,
  OAPU_RECOVERY_VOLUME_PCT,
  PRIORITY_TUNING,
  RUN_DELOAD_VOLUME_PCT,
  RUN_SLOT_MINUTES,
  STRENGTH_DELOAD_VOLUME_PCT,
  WALK_MINUTES,
} from './config';
import type { DayAvailability } from './availability';
import { canonicalSlug, isOapu, profileOfProgram } from './programProfiles';
import type { Grid } from './rules';
import type { PlacedSession, ScheduleEngineInput, SchedulePriority, TimeWindow } from './types';
import type { Unit } from './units';

function strengthSessions(u: Unit): PlacedSession[] {
  if (u.combined) {
    return u.slugs.map((slug) => ({ kind: 'strength', slug, volumePct: COMBINED_VOLUME_PCT, combined: true }));
  }
  const s: PlacedSession = { kind: 'strength', slug: u.slugs[0] };
  if (u.variantOf) s.variantOf = u.variantOf;
  return [s];
}

function runSession(u: Unit): PlacedSession {
  const s: PlacedSession = { kind: 'run', slot: u.slot };
  if (u.workout) s.workout = u.workout;
  if (u.minutes) s.minutes = u.minutes;
  if (u.fixedDow !== undefined) {
    s.fixed = true;
    if (u.fixedTime) s.time = u.fixedTime;
  }
  return s;
}

/** Main sessions of one day in their in-day order. */
export function orderDay(run: Unit | null, strength: Unit | null, priority: SchedulePriority): PlacedSession[] {
  const st = strength ? strengthSessions(strength) : [];
  if (!run) return st;
  const r = runSession(run);
  if (!strength) return [r];
  // H5: a quality / long run always goes first. Easy-run doubles follow the priority.
  if (!isKeySlot(run.slot) && PRIORITY_TUNING[priority].strengthFirstOnEasyDouble) return [...st, r];
  return [r, ...st];
}

const isMain = (s: PlacedSession) => s.kind === 'run' || s.kind === 'strength';

export interface FinalizeCtx {
  input: ScheduleEngineInput;
  priority: SchedulePriority;
  av: DayAvailability;
  frozen: readonly boolean[];
}

export function finalizeLayout(grid: Grid, ctx: FinalizeCtx): PlacedSession[][] {
  const { input, priority, av } = ctx;
  const days: PlacedSession[][] = [];
  for (let d = 0; d < 7; d++) days.push(orderDay(grid.run[d], grid.strength[d], priority));

  // Volumes: strength deload (cycle week 5), run deload, FIX-01 recovery after OAPU.
  const strengthDeload = input.strengthCycleWeek === 5;
  const runDeload = !!input.running?.isDeloadWeek;
  const oapuDay = days.findIndex((ss) => ss.some((s) => s.kind === 'strength' && s.slug && isOapu(s.slug)));
  for (let d = 0; d < 7; d++) {
    for (const s of days[d]) {
      if (s.kind === 'strength' && strengthDeload) s.volumePct = Math.min(s.volumePct ?? 100, STRENGTH_DELOAD_VOLUME_PCT);
      if (s.kind === 'run' && runDeload) s.volumePct = Math.min(s.volumePct ?? 100, RUN_DELOAD_VOLUME_PCT);
      if (oapuDay >= 0 && d > oapuDay && s.kind === 'strength' && s.slug && canonicalSlug(s.slug) === 'front_lever') {
        s.volumePct = Math.min(s.volumePct ?? 100, OAPU_RECOVERY_VOLUME_PCT);
      }
    }
  }

  const freeDay = (d: number) => av.open[d] && !ctx.frozen[d] && !days[d].some(isMain);

  // Free slots: handstand first on strength days; mobility after runs, then rest days.
  for (const p of input.strength) {
    const prof = profileOfProgram(p);
    if (prof.slotKind !== 'free') continue;
    const slug = canonicalSlug(p.slug);
    let left = Math.max(0, Math.round(p.sessionsPerWeek));
    const order: number[] = [];
    if (slug === 'mobility') {
      for (let d = 0; d < 7; d++) if (days[d].some((s) => s.kind === 'run') && !days[d].some((s) => s.kind === 'strength')) order.push(d);
      for (let d = 0; d < 7; d++) if (freeDay(d)) order.push(d);
    } else {
      for (let d = 0; d < 7; d++) if (days[d].some((s) => s.kind === 'strength')) order.push(d);
      for (let d = 0; d < 7; d++) if (freeDay(d)) order.push(d);
    }
    for (const d of order) {
      if (left <= 0) break;
      if (ctx.frozen[d]) continue;
      if (slug === 'mobility') days[d].push({ kind: 'mobility', minutes: MOBILITY_MINUTES });
      else days[d].unshift({ kind: 'strength', slug: p.slug, minutes: prof.sessionMinutes });
      left--;
    }
  }

  // Walks toward the weekly aerobic target (WHO: run minutes count double).
  const target = input.walking?.weeklyAerobicTargetMin;
  if (target) {
    let aerobic = 0;
    for (const ss of days)
      for (const s of ss) if (s.kind === 'run') aerobic += (s.minutes ?? RUN_SLOT_MINUTES[s.slot!]) * RUNNING_MODERATE_EQUIV_FACTOR;
    for (let d = 0; d < 7 && aerobic < target; d++) {
      if (!freeDay(d) || days[d].length > 0) continue;
      days[d].push({ kind: 'walk', minutes: WALK_MINUTES, optional: true });
      aerobic += WALK_MINUTES;
    }
  }

  // Travel days: optional no-equipment strength + an optional easy run.
  for (const ex of input.availability.exceptions ?? []) {
    if (ex.kind !== 'travel') continue;
    const tdays: number[] = [];
    for (let d = ex.fromDow; d <= ex.toDow; d++) if (av.marked[d] && !ctx.frozen[d]) tdays.push(d);
    if (tdays.length === 0) continue;
    const hasStrength = input.strength.some((p) => !p.freeSlot);
    const sDay = tdays[Math.min(1, tdays.length - 1)];
    const rDay = tdays[Math.min(2, tdays.length - 1)];
    if (hasStrength) days[sDay].push({ kind: 'strength', slug: 'push', minutes: 20, optional: true, equipment: ex.equipment ?? 'none' });
    if (input.running && (rDay !== sDay || !hasStrength)) days[rDay].push({ kind: 'run', slot: 'easy_run', minutes: 30, optional: true });
  }

  // Windows: two main sessions → earliest + latest window; one window = one continuous session.
  for (let d = 0; d < 7; d++) {
    const w: TimeWindow[] = av.windows[d].length ? av.windows[d] : ['evening'];
    const mains = days[d].filter(isMain);
    mains.forEach((s, i) => {
      s.window = i === 0 ? w[0] : w[w.length - 1];
      if (i > 0 && w.length === 1) s.continuous = true;
    });
    for (const s of days[d]) if (!s.window) s.window = s.kind === 'walk' || s.kind === 'mobility' ? w[w.length - 1] : w[0];
  }
  return days;
}

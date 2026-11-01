/**
 * Diff of the proposed week vs the user's existing week: "חדש" / "נשאר" /
 * "הוזז: … · כי …" / "הוסר". The "because" names the rule the old day would break now.
 */
import { RUNNING_SLOT_NAME_HE } from '../engine/runningRules';
import { isKeySlot } from './config';
import { canonicalSlug, HEAVY_LEGS, MODERATE_LEGS, profileOf, slugNameHe } from './programProfiles';
import { dayNameHe } from './reasonsV2';
import { breaksH6, nextDay } from './rules';
import { makeStrengthUnit } from './units';
import type { DayAvailability } from './availability';
import { defaultScheduleT, type ScheduleT } from '../engine/schedule-t';
import type { DiffEntry, ExistingWeek, PlacedSession, SessionRef } from './types';
import { programLabelEn } from '@/lib/i18n/static-labels';

export const refOf = (s: PlacedSession): SessionRef | null =>
  s.kind === 'run' && s.slot ? { kind: 'run', slot: s.slot } : s.kind === 'strength' && s.slug ? { kind: 'strength', slug: s.slug } : null;

export const refKey = (r: SessionRef): string => (r.kind === 'run' ? `run:${r.slot}` : `strength:${canonicalSlug(r.slug)}`);

export function refNameHe(r: SessionRef): string {
  return r.kind === 'run' ? RUNNING_SLOT_NAME_HE[r.slot] : slugNameHe(r.slug);
}

const from = (t: ScheduleT, d: number) => t('engine.diff.fromDay', { day: dayNameHe(d) });
const to = (t: ScheduleT, d: number) => t('engine.diff.toDay', { day: dayNameHe(d) });

/** Why `ref` can't stay on `day` in the new week (Hebrew, after "כי"). */
export function becauseHe(
  ref: SessionRef,
  day: number,
  days: PlacedSession[][],
  av: DayAvailability,
  t: ScheduleT = defaultScheduleT(),
): string {
  if (!av.open[day]) return t('engine.because.dayClosed');
  const here = days[day];
  if (ref.kind === 'strength') {
    if (here.some((s) => s.kind === 'run' && s.slot === 'long_run')) return t('engine.because.longRunDay');
    const prof = profileOf(ref.slug);
    const n = nextDay(day);
    const tomorrowKey = n !== null && days[n].some((s) => s.kind === 'run' && isKeySlot(s.slot) && !s.optional);
    if (tomorrowKey && prof.load.legs >= MODERATE_LEGS) {
      const isLong = days[n!].some((s) => s.slot === 'long_run');
      return t('engine.because.beforeKeyRun', { run: isLong ? 'long' : 'quality' });
    }
    const u = makeStrengthUnit(ref.slug);
    for (let e = 0; e < 7; e++) {
      if (e === day) continue;
      for (const s of days[e]) {
        if (s.kind !== 'strength' || !s.slug || s.optional) continue;
        if (breaksH6(u, day, makeStrengthUnit(s.slug), e)) return t('engine.because.needsRest', { name: programLabelEn(s.slug) ?? slugNameHe(s.slug) });
      }
    }
    if (here.some((s) => s.kind === 'strength' && !s.optional)) return t('engine.because.dayTaken');
  } else {
    if (here.some((s) => s.kind === 'run' && !s.optional)) return t('engine.because.dayTaken');
    if (ref.slot === 'long_run') return t('engine.because.longRunMoved');
    if (here.some((s) => s.kind === 'strength' && s.slug && profileOf(s.slug).load.legs >= HEAVY_LEGS)) return t('engine.because.legsSameDay');
  }
  return t('engine.because.balance');
}

export function diffWeek(
  days: PlacedSession[][],
  existing: ExistingWeek | null | undefined,
  av: DayAvailability,
  frozen: readonly boolean[],
  t: ScheduleT = defaultScheduleT(),
): DiffEntry[] {
  if (!existing) return [];
  const out: DiffEntry[] = [];
  const left = new Map<string, Array<{ day: number; ref: SessionRef }>>();
  for (let d = 0; d < 7; d++) {
    if (frozen[d]) continue;
    for (const r of existing.days[d] ?? []) {
      const k = refKey(r);
      const arr = left.get(k) ?? [];
      arr.push({ day: d, ref: r });
      left.set(k, arr);
    }
  }
  const pending: Array<{ day: number; ref: SessionRef }> = [];
  for (let d = 0; d < 7; d++) {
    if (frozen[d]) continue;
    for (const s of days[d]) {
      if (s.optional) continue;
      const ref = refOf(s);
      if (!ref) continue;
      const arr = left.get(refKey(ref));
      const i = arr ? arr.findIndex((x) => x.day === d) : -1;
      if (arr && i >= 0) {
        arr.splice(i, 1);
        out.push({ status: 'kept', session: ref, toDow: d, labelHe: t('engine.diff.kept') });
      } else pending.push({ day: d, ref });
    }
  }
  for (const p of pending) {
    const arr = left.get(refKey(p.ref));
    if (arr && arr.length) {
      arr.sort((a, b) => Math.abs(a.day - p.day) - Math.abs(b.day - p.day));
      const old = arr.shift()!;
      out.push({
        status: 'moved',
        session: p.ref,
        fromDow: old.day,
        toDow: p.day,
        labelHe: t('engine.diff.moved', {
          name: refNameHe(p.ref),
          from: from(t, old.day),
          to: to(t, p.day),
          because: becauseHe(p.ref, old.day, days, av, t),
        }),
      });
    } else {
      out.push({ status: 'new', session: p.ref, toDow: p.day, labelHe: t('engine.diff.new') });
    }
  }
  for (const arr of Array.from(left.values())) {
    for (const x of arr) out.push({ status: 'removed', session: x.ref, fromDow: x.day, labelHe: t('engine.diff.removed', { name: refNameHe(x.ref), from: from(t, x.day) }) });
  }
  return out.sort((a, b) => (a.toDow ?? a.fromDow ?? 0) - (b.toDow ?? b.fromDow ?? 0));
}

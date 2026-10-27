/**
 * The user's planned strength session length for today, from the schedule tutorial's saved
 * lifestyle.sessionMinutes with the first-weeks ramp applied (activeMinutesRamp.ts). Pure
 * (__tests__/plannedSessionMinutes.test.ts).
 *
 * Null when the user never chose a length (everyone before the tutorial): callers keep their
 * own defaults, so existing users behave exactly as before.
 */
import { computeBaseLevel } from '@/features/home/utils/dailyStrengthTarget';
import { rampSessionMinutes, weekIndexFrom, weeklyActiveTarget } from './activeMinutesRamp';

type Leveled = { currentLevel?: number } | null | undefined;

export interface PlannedMinutesProfile {
  lifestyle?: { sessionMinutes?: unknown } | null;
  progression?: {
    tracks?: Record<string, Leveled> | null;
    domains?: Record<string, Leveled> | null;
    activePrograms?: ReadonlyArray<{ startDate?: unknown } | null> | null;
  } | null;
}

export const SESSION_MINUTES_RANGE = { min: 10, max: 120 } as const;

/** A stored session length, or null when absent / not a sane number. */
export function storedSessionMinutes(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= SESSION_MINUTES_RANGE.min && v <= SESSION_MINUTES_RANGE.max
    ? Math.round(v)
    : null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') return toDate((v as { toDate: () => unknown }).toDate());
  return null;
}

/** The earliest active program start (the ramp's week 0), or null. */
export function programStartOf(p: PlannedMinutesProfile | null | undefined): Date | null {
  const starts = (p?.progression?.activePrograms ?? [])
    .map((a) => toDate(a?.startDate))
    .filter((d): d is Date => !!d);
  return starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
}

export function rampInputOf(p: PlannedMinutesProfile | null | undefined, now: Date): { level: number; weekIndex: number } {
  type Levels = Parameters<typeof computeBaseLevel>[0];
  const level = computeBaseLevel((p?.progression?.tracks ?? undefined) as Levels, (p?.progression?.domains ?? undefined) as Levels);
  return { level, weekIndex: weekIndexFrom(programStartOf(p), now) };
}

/** Today's planned session minutes, or null (no saved length). Weak weeks are not known here yet. */
export function plannedSessionMinutes(p: PlannedMinutesProfile | null | undefined, now: Date): number | null {
  const chosen = storedSessionMinutes(p?.lifestyle?.sessionMinutes);
  if (chosen == null) return null;
  return rampSessionMinutes(chosen, rampInputOf(p, now));
}

/** This week's active-minutes target for the user (the ramp; 150 for level 6+). */
export function weeklyActiveTargetOf(p: PlannedMinutesProfile | null | undefined, now: Date): number {
  return weeklyActiveTarget(rampInputOf(p, now));
}

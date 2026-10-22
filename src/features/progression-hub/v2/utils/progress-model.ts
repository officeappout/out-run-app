/**
 * Progress tab v2 (enable_home_v2) — the light shapes the tab works with.
 *
 * Firestore docs are mapped into these right at the service boundary
 * (services/progress-data.service.ts) so nothing heavy (routePath, laps…)
 * is kept in React state. Plain .ts, no React / Firebase — safe for tests.
 */
import { splitHybridWorkout } from '@/features/workout-engine/hybrid/hybrid-counting';
import { TRACK_COLORS } from '@/components/ui/v2/track-colors';

/** The four activity lenses of the tab. Walk & steps share amber (owner, 20.10.2026). */
export type ProgressKind = 'strength' | 'run' | 'walk' | 'other';

export const PROGRESS_COLORS = {
  strength: TRACK_COLORS.strength,
  run: TRACK_COLORS.run,
  runText: '#65a30d',
  walk: TRACK_COLORS.walk,
  walkText: '#b45309',
  steps: TRACK_COLORS.walk,
} as const;

export const KIND_LABEL: Record<Exclude<ProgressKind, 'other'>, string> = {
  strength: 'כוח',
  run: 'ריצה',
  walk: 'הליכה',
};

/** One saved workout, reduced to what the tab shows. */
export interface ProgressWorkout {
  id: string;
  date: Date;
  kind: ProgressKind;
  /** Raw workoutType ("running", "hybrid"…). */
  type: string;
  minutes: number;
  km: number;
  /** Minutes per km (0 = unknown). */
  pace: number;
  sets: number;
  /** Sets per program domain ("push": 12) — only docs saved with exerciseLog.domain. */
  domainSets: Record<string, number>;
  title?: string;
  /**
   * Set only on a PART of a combined workout (hybrid counting, owner 20.10.2026):
   * the saved doc's id. A combined doc becomes one entry per part (run / walk /
   * strength) so each lens counts its own part; session counts dedupe on this.
   */
  sessionId?: string;
}

/** The session a workout entry belongs to (its doc id, also for combined-workout parts). */
export function sessionKeyOf(w: Pick<ProgressWorkout, 'id' | 'sessionId'>): string {
  return w.sessionId ?? w.id;
}

/** One dailyActivity doc, reduced. */
export interface ProgressDay {
  /** YYYY-MM-DD */
  date: string;
  steps: number;
  stepsGoal: number;
  distanceMeters: number;
  activeMinutes: number;
  /** Active minutes per category (P-7: why a day counted — recovery = maintenance). */
  minutesByCategory?: { strength: number; cardio: number; maintenance: number };
}

/** workoutType → lens. A whole hybrid doc (legacy, no segments) counts as strength; see toProgressWorkouts. */
export function kindOfWorkoutType(type: string | null | undefined): ProgressKind {
  switch (type) {
    case 'running':
      return 'run';
    case 'walking':
      return 'walk';
    case 'strength':
    case 'workout':
    case 'hybrid':
      return 'strength';
    default:
      return 'other';
  }
}

interface RawSegment {
  actual?: { sets?: number; exerciseLog?: { confirmedReps?: unknown; domain?: unknown }[] } | null;
}

/** Sets from a workout doc: setsCompleted, else the per-exercise log; plus sets per domain. */
export function setsFromDoc(data: { setsCompleted?: unknown; segments?: unknown }): {
  sets: number;
  domainSets: Record<string, number>;
} {
  const domainSets: Record<string, number> = {};
  let logged = 0;
  const segs = Array.isArray(data.segments) ? (data.segments as RawSegment[]) : [];
  for (const seg of segs) {
    for (const ex of seg?.actual?.exerciseLog ?? []) {
      const n = Array.isArray(ex?.confirmedReps) ? ex.confirmedReps.length : 0;
      logged += n;
      if (n > 0 && typeof ex.domain === 'string' && ex.domain) {
        domainSets[ex.domain] = (domainSets[ex.domain] ?? 0) + n;
      }
    }
  }
  const explicit = typeof data.setsCompleted === 'number' && data.setsCompleted > 0 ? data.setsCompleted : 0;
  return { sets: explicit || logged, domainSets };
}

/** Firestore Timestamp / Date / epoch → Date (null when unreadable). */
export function readDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const t = v as { toDate?: () => Date; seconds?: number };
  if (typeof t.toDate === 'function') return t.toDate();
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000);
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** A raw `workouts` doc → ProgressWorkout (drops routePath & co). */
export function toProgressWorkout(id: string, data: Record<string, unknown>): ProgressWorkout | null {
  const date = readDate(data.date);
  if (!date) return null;
  const type = String(data.workoutType ?? data.activityType ?? '');
  const { sets, domainSets } = setsFromDoc(data);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const title = typeof data.title === 'string' ? data.title : typeof data.routeName === 'string' ? data.routeName : undefined;
  return {
    id,
    date,
    kind: kindOfWorkoutType(type),
    type,
    minutes: num(data.duration) / 60,
    km: num(data.distance),
    pace: num(data.pace),
    sets,
    domainSets,
    title,
  };
}

/** A raw `dailyActivity` doc → ProgressDay. */
export function toProgressDay(data: Record<string, unknown>, fallbackGoal: number): ProgressDay | null {
  const date = typeof data.date === 'string' ? data.date : '';
  if (!date) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const cats = (data.categories ?? {}) as Record<string, { minutes?: unknown } | undefined>;
  const minutesByCategory = {
    strength: num(cats.strength?.minutes),
    cardio: num(cats.cardio?.minutes),
    maintenance: num(cats.maintenance?.minutes),
  };
  const activeMinutes = minutesByCategory.strength + minutesByCategory.cardio + minutesByCategory.maintenance;
  return {
    date,
    steps: num(data.steps),
    stepsGoal: num(data.stepsGoal) || fallbackGoal,
    distanceMeters: num(data.distanceMeters),
    activeMinutes,
    minutesByCategory,
  };
}

/**
 * A raw `workouts` doc → the entries the tab counts. A combined workout (hybrid)
 * with segments → one entry per part (run legs, walk legs, done stations), each
 * tagged with `sessionId`; every other doc → its single entry.
 */
export function toProgressWorkouts(id: string, data: Record<string, unknown>): ProgressWorkout[] {
  const whole = toProgressWorkout(id, data);
  if (!whole) return [];
  if (whole.type !== 'hybrid' || !Array.isArray(data.segments) || data.segments.length === 0) return [whole];
  const p = splitHybridWorkout(data.segments);
  const parts: ProgressWorkout[] = [];
  const base = { date: whole.date, type: whole.type, title: whole.title, sessionId: id };
  const aerobic = (kind: 'run' | 'walk', a: { sec: number; km: number; legs: number }) => {
    if (a.legs === 0 || (a.sec <= 0 && a.km <= 0)) return;
    const minutes = a.sec / 60;
    parts.push({ ...base, id: `${id}:${kind}`, kind, minutes, km: a.km, pace: a.km > 0 ? minutes / a.km : 0, sets: 0, domainSets: {} });
  };
  aerobic('run', p.running);
  aerobic('walk', p.walking);
  if (p.strength.stations > 0) {
    parts.push({
      ...base,
      id: `${id}:strength`,
      kind: 'strength',
      minutes: p.strength.sec / 60,
      km: 0,
      pace: 0,
      sets: p.strength.setsCompleted,
      domainSets: p.strength.domainSets,
    });
  }
  return parts.length > 0 ? parts : [whole];
}

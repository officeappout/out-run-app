/**
 * Personal records + period totals (enable_home_v2; owner approved 20.10.2026).
 *
 * Additive, optional fields, written FORWARD-ONLY on the existing save paths
 * (no backfill — a record starts at the first workout saved under the flag):
 *   users/{uid}.progression.records.{longestRunKm|longestWalkKm|fastest5kSec}
 *       = { value, at }            — only when a record is broken
 *   users/{uid}.progression.periodTotals.{YYYY-MM}
 *       = { workouts, minutes.{strength,run,walk}, km.{run,walk}, sets }  — increment()
 *   users/{uid}/exerciseHistory/{exId}.{bestReps, bestAt, recentMax}
 * `progression.longestStreak` already exists (useActivityStore mirrors it).
 *
 * Pure — no Firebase. The write service turns these into one updateDoc.
 */

export interface RecordValue {
  value: number;
  /** Epoch ms. */
  at: number;
}

export interface ProgressionRecords {
  longestRunKm?: RecordValue;
  longestWalkKm?: RecordValue;
  /** Seconds, from a run of ≥ 5 km at its average pace. */
  fastest5kSec?: RecordValue;
}

export interface PeriodTotals {
  workouts?: number;
  minutes?: { strength?: number; run?: number; walk?: number };
  km?: { run?: number; walk?: number };
  sets?: number;
}

export interface WorkoutForAggregates {
  workoutType: 'strength' | 'running' | 'walking' | 'cycling' | 'hybrid';
  durationMinutes: number;
  distanceKm?: number;
  sets?: number;
  /** Per-category minutes for hybrid sessions. */
  categorySplits?: Array<{ category: string; durationMinutes: number }>;
  /** Hybrid: the session split per part (hybrid-counting.ts). Wins over categorySplits. */
  hybridParts?: { runMinutes: number; runKm: number; walkMinutes: number; walkKm: number; strengthMinutes: number };
}

/** Months are keyed "YYYY-MM" (local time). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dotted field paths → increment amounts for this workout's month. */
export function periodTotalsIncrements(w: WorkoutForAggregates, now: Date): Record<string, number> {
  const base = `progression.periodTotals.${monthKey(now)}`;
  const out: Record<string, number> = { [`${base}.workouts`]: 1 };
  const add = (k: string, v: number) => {
    if (v > 0 && Number.isFinite(v)) out[`${base}.${k}`] = (out[`${base}.${k}`] ?? 0) + round2(v);
  };
  const km = w.distanceKm ?? 0;
  if (w.workoutType === 'running') {
    add('minutes.run', w.durationMinutes);
    add('km.run', km);
  } else if (w.workoutType === 'walking') {
    add('minutes.walk', w.durationMinutes);
    add('km.walk', km);
  } else if (w.workoutType === 'strength') {
    add('minutes.strength', w.durationMinutes);
  } else if (w.workoutType === 'hybrid' && w.hybridParts) {
    // Per part (owner, 20.10.2026): run legs → run, walk legs → walk, stations → strength.
    add('minutes.run', w.hybridParts.runMinutes);
    add('km.run', w.hybridParts.runKm);
    add('minutes.walk', w.hybridParts.walkMinutes);
    add('km.walk', w.hybridParts.walkKm);
    add('minutes.strength', w.hybridParts.strengthMinutes);
  } else if (w.workoutType === 'hybrid') {
    const splits = w.categorySplits ?? [];
    const strengthMin = splits.filter((s) => s.category === 'strength').reduce((a, s) => a + s.durationMinutes, 0);
    const cardioMin = splits.filter((s) => s.category !== 'strength').reduce((a, s) => a + s.durationMinutes, 0);
    add('minutes.strength', strengthMin);
    add('minutes.run', cardioMin);
    add('km.run', km);
  }
  add('sets', w.sets ?? 0);
  return out;
}

/** Records this workout breaks → dotted field paths with the new { value, at }. */
export function recordUpdates(
  records: ProgressionRecords | null | undefined,
  w: WorkoutForAggregates,
  nowMs: number,
): Record<string, RecordValue> {
  const out: Record<string, RecordValue> = {};
  const km = w.distanceKm ?? 0;
  const beats = (cur: RecordValue | undefined, v: number, lowerIsBetter = false) =>
    !cur || !(cur.value > 0) || (lowerIsBetter ? v < cur.value : v > cur.value);

  if (w.workoutType === 'running' && km >= 0.5) {
    if (beats(records?.longestRunKm, round2(km))) out['progression.records.longestRunKm'] = { value: round2(km), at: nowMs };
    if (km >= 5 && w.durationMinutes > 0) {
      const sec5k = Math.round((w.durationMinutes * 60 * 5) / km);
      // Sanity: 5 km faster than 12:30 is not a phone-tracked run.
      if (sec5k >= 750 && beats(records?.fastest5kSec, sec5k, true)) {
        out['progression.records.fastest5kSec'] = { value: sec5k, at: nowMs };
      }
    }
  }
  if (w.workoutType === 'walking' && km >= 0.5 && beats(records?.longestWalkKm, round2(km))) {
    out['progression.records.longestWalkKm'] = { value: round2(km), at: nowMs };
  }
  return out;
}

export interface ExerciseAggregate {
  bestReps: number;
  /** Epoch ms of the session that set bestReps. */
  bestAt: number;
  /** Best set of each of the last 7 sessions, oldest → newest. */
  recentMax: number[];
}

export const RECENT_MAX_LEN = 7;

/** Next exerciseHistory aggregate after a session whose best set is `sessionMax`. */
export function nextExerciseAggregate(
  prev: Partial<ExerciseAggregate> | null | undefined,
  sessionMax: number,
  nowMs: number,
): ExerciseAggregate & { isNewBest: boolean } {
  const prevBest = typeof prev?.bestReps === 'number' && prev.bestReps > 0 ? prev.bestReps : 0;
  const prevAt = typeof prev?.bestAt === 'number' ? prev.bestAt : 0;
  const recent = Array.isArray(prev?.recentMax) ? prev!.recentMax!.filter((n) => typeof n === 'number') : [];
  const isNewBest = sessionMax > prevBest;
  return {
    bestReps: isNewBest ? sessionMax : prevBest,
    bestAt: isNewBest ? nowMs : prevAt,
    recentMax: [...recent, Math.max(0, sessionMax)].slice(-RECENT_MAX_LEN),
    isNewBest,
  };
}

/** The busiest month so far (from periodTotals) — the "הכי הרבה אימונים בחודש" record. */
export function bestMonth(totals: Record<string, PeriodTotals> | null | undefined): { month: string; workouts: number } | null {
  let best: { month: string; workouts: number } | null = null;
  for (const [month, t] of Object.entries(totals ?? {})) {
    const n = Number(t?.workouts) || 0;
    if (n > 0 && (!best || n > best.workouts)) best = { month, workouts: n };
  }
  return best;
}

/** Local mirror of recordUpdates() so the next comparison never uses a stale record. */
export function applyRecordUpdates(
  records: ProgressionRecords | null | undefined,
  updates: Record<string, RecordValue>,
): ProgressionRecords {
  const next: ProgressionRecords = { ...(records ?? {}) };
  for (const [path, v] of Object.entries(updates)) {
    const key = path.split('.').pop() as keyof ProgressionRecords;
    next[key] = v;
  }
  return next;
}

/** Local mirror of periodTotalsIncrements(). */
export function applyPeriodIncrements(
  totals: Record<string, PeriodTotals> | null | undefined,
  increments: Record<string, number>,
): Record<string, PeriodTotals> {
  const next: Record<string, PeriodTotals> = JSON.parse(JSON.stringify(totals ?? {}));
  for (const [path, v] of Object.entries(increments)) {
    const parts = path.split('.').slice(2); // drop "progression.periodTotals"
    let node = next as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = (node[parts[i]] as Record<string, unknown>) ?? {};
      node = node[parts[i]] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    node[leaf] = round2((Number(node[leaf]) || 0) + v);
  }
  return next;
}

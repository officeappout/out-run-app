/**
 * Strength page (hub v2, PG-4) — pure numbers: muscle balance this month,
 * sets per week, and the three insights — each shown ONLY when the data
 * supports it (owner: insights from real data only).
 */
import type { ProgressWorkout } from '../../utils/progress-model';
import { periodRanges, inRange } from '../../utils/progress-period';
import type { VolumeDatum } from '../components/VolumeChart';
import type { ExerciseTrend } from './exercise-trends.service';

export interface DomainSets {
  domain: string;
  sets: number;
}

/** Sets per program domain this month (docs saved with exerciseLog.domain only). */
export function monthDomainSets(workouts: readonly ProgressWorkout[], now: Date): DomainSets[] {
  const r = periodRanges('month', now).current;
  const acc: Record<string, number> = {};
  for (const w of workouts) {
    if (!inRange(w.date, r)) continue;
    for (const [d, n] of Object.entries(w.domainSets)) acc[d] = (acc[d] ?? 0) + n;
  }
  return Object.entries(acc)
    .map(([domain, sets]) => ({ domain, sets }))
    .sort((a, b) => b.sets - a.sets);
}

/** Sets per Sunday-week, the last `n` weeks (oldest → newest). */
export function weeklySets(workouts: readonly ProgressWorkout[], now: Date, n = 8): VolumeDatum[] {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - (n - 1 - i) * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const sets = workouts.filter((w) => w.date >= start && w.date < end).reduce((s, w) => s + w.sets, 0);
    return { key: `s${i}`, label: `${start.getDate()}/${start.getMonth() + 1}`, done: sets, current: i === n - 1 };
  });
}

// ── Insights ────────────────────────────────────────────────────────────────

export interface ImbalanceInsight {
  low: DomainSets;
  high: DomainSets;
}

/** A muscle group far behind: ≥ 12 sets logged this month and the lowest group ≤ 40% of the highest. */
export function imbalanceInsight(domains: readonly DomainSets[]): ImbalanceInsight | null {
  if (domains.length < 2) return null;
  const total = domains.reduce((s, d) => s + d.sets, 0);
  if (total < 12) return null;
  const high = domains[0];
  const low = domains[domains.length - 1];
  return low.sets <= high.sets * 0.4 ? { low, high } : null;
}

export interface ImprovedInsight {
  name: string;
  from: number;
  to: number;
  pct: number;
  sessions: number;
}

/** The exercise whose best set grew the most over its recent sessions (≥ 3 sessions, ≥ +1 rep). */
export function mostImproved(exercises: readonly ExerciseTrend[]): ImprovedInsight | null {
  let best: ImprovedInsight | null = null;
  for (const ex of exercises) {
    const r = ex.recentMax;
    if (r.length < 3 || !(r[0] > 0)) continue;
    const to = r[r.length - 1];
    if (to - r[0] < 1) continue;
    const pct = Math.round(((to - r[0]) / r[0]) * 100);
    if (!best || pct > best.pct) best = { name: ex.name, from: r[0], to, pct, sessions: r.length };
  }
  return best;
}

export interface RecordInsight {
  name: string;
  reps: number;
  at: Date;
}

/** A personal best set in the last 7 days (bestAt), the newest one. */
export function newRecord(exercises: readonly ExerciseTrend[], now: Date): RecordInsight | null {
  const since = now.getTime() - 7 * 86400000;
  const fresh = exercises
    .filter((e) => e.bestAt && e.bestAt.getTime() >= since && e.bestAt.getTime() <= now.getTime() && e.bestReps > 0)
    .sort((a, b) => (b.bestAt as Date).getTime() - (a.bestAt as Date).getTime());
  return fresh.length ? { name: fresh[0].name, reps: fresh[0].bestReps, at: fresh[0].bestAt as Date } : null;
}

/** Trend direction of an exercise's recent best sets. */
export function trendOf(recentMax: readonly number[]): 'up' | 'down' | 'flat' | null {
  if (recentMax.length < 2) return null;
  const d = recentMax[recentMax.length - 1] - recentMax[0];
  return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
}

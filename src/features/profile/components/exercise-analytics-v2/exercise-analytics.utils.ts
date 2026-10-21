/**
 * Exercise page v2 (boards P-5 / P-6) — pure helpers over the loaded sessions.
 * Sessions come in oldest → newest unless stated.
 */
import type { BarDatum } from '@/components/ui/v2/logic';
import { toneFor, type SetTile } from '@/components/ui/v2/summary';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';

export type ExerciseRange = '1m' | '3m' | 'all';
export type ExerciseMetric = 'maxReps' | 'totalVolume';

const DAY = 86_400_000;
const RANGE_DAYS: Record<Exclude<ExerciseRange, 'all'>, number> = { '1m': 30, '3m': 90 };

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']; // i18n-allow-hebrew: wave 3 (fmt) — month names
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']; // i18n-allow-hebrew: wave 3 (fmt) — weekday names

export function filterRange(sessions: RichExerciseSession[], range: ExerciseRange, nowMs: number): RichExerciseSession[] {
  if (range === 'all') return sessions;
  const cutoff = nowMs - RANGE_DAYS[range] * DAY;
  return sessions.filter((s) => s.dateMs >= cutoff);
}

export function chartData(sessions: RichExerciseSession[], metric: ExerciseMetric): BarDatum[] {
  return sessions.map((s, i) => {
    const d = new Date(s.dateMs);
    return { key: `${s.dateMs}-${i}`, label: `${d.getDate()}/${d.getMonth() + 1}`, value: metric === 'maxReps' ? s.maxReps || 0 : s.totalVolume || 0 };
  });
}

export interface TrendStats {
  best: number;
  /** % change first → best-of-range's last session; null with < 2 sessions. */
  changePct: number | null;
  sessions: number;
  totalReps: number;
  perWeek: number;
}

export function trendStats(sessions: RichExerciseSession[]): TrendStats {
  const n = sessions.length;
  const best = n ? Math.max(...sessions.map((s) => s.maxReps || 0)) : 0;
  const first = sessions[0]?.maxReps ?? 0;
  const last = sessions[n - 1]?.maxReps ?? 0;
  const changePct = n >= 2 && first > 0 ? Math.round(((last - first) / first) * 100) : null;
  const totalReps = sessions.reduce((s, x) => s + (x.totalVolume || 0), 0);
  const spanWeeks = n >= 2 ? Math.max(1, (sessions[n - 1].dateMs - sessions[0].dateMs) / (7 * DAY)) : 1;
  return { best, changePct, sessions: n, totalReps, perWeek: Math.round((n / spanWeeks) * 10) / 10 };
}

/** The session holding the best single set (latest on a tie). */
export function bestSession(sessions: RichExerciseSession[]): RichExerciseSession | null {
  let best: RichExerciseSession | null = null;
  for (const s of sessions) if (!best || (s.maxReps || 0) >= (best.maxReps || 0)) best = s;
  return best && best.maxReps > 0 ? best : null;
}

/** Last two sessions: "פעם קודמת 12 · היום 14". */
export function lastImprovement(sessions: RichExerciseSession[]): { previous: number; latest: number; delta: number } | null {
  const n = sessions.length;
  if (n < 2) return null;
  const previous = sessions[n - 2].maxReps || 0;
  const latest = sessions[n - 1].maxReps || 0;
  return { previous, latest, delta: latest - previous };
}

export function longDate(ms: number): string {
  const d = new Date(ms);
  return `יום ${WEEKDAYS[d.getDay()]} ${d.getDate()} ב${MONTHS[d.getMonth()]}`; // i18n-allow-hebrew: wave 3 (fmt) — long date
}

export function dayMonth(ms: number): { day: string; month: string } {
  const d = new Date(ms);
  return { day: String(d.getDate()), month: MONTHS[d.getMonth()] };
}

export function setTiles(reps: number[], target: number | null | undefined): SetTile[] {
  return reps.map((r) => ({ value: String(r), tone: toneFor(r, target && target > 1 ? target : null) }));
}

/** Treat a stored target ≤ 1 as "not set" (the picker's default). */
export function sessionTarget(s: RichExerciseSession): number | null {
  return typeof s.targetReps === 'number' && s.targetReps > 1 ? s.targetReps : null;
}

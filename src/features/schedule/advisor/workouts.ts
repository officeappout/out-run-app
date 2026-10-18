/**
 * Raw workout documents → AdvisorWorkout. Pure; shared by both adapters so the client and
 * the server classify a workout the same way (workouts/{id}.workoutType, the legacy
 * activityType, category — storage.service.ts's vocabulary).
 */
import type { AdvisorWorkout } from './types';

export interface RawAdvisorWorkout {
  /** Local calendar key, already resolved by the adapter (device-local / Israel time). */
  dateKey: string | null;
  workoutType?: unknown;
  activityType?: unknown;
  category?: unknown;
  /** Seconds (workouts/{id}.duration). */
  durationSec?: unknown;
  isRecovery?: unknown;
}

export function workoutKindOf(w: Omit<RawAdvisorWorkout, 'dateKey' | 'durationSec'>): AdvisorWorkout['kind'] {
  const wt = String(w.workoutType ?? w.activityType ?? '').toLowerCase();
  const cat = String(w.category ?? '').toLowerCase();
  if (w.isRecovery === true || wt === 'recovery' || cat === 'recovery') return 'other';
  if (wt === 'hybrid' || cat === 'hybrid') return 'hybrid';
  if (wt === 'strength' || wt === 'workout' || cat === 'strength') return 'strength';
  if (wt === 'running') return 'run';
  if (wt === 'walking') return 'walk';
  return 'other';
}

export function toAdvisorWorkouts(raw: RawAdvisorWorkout[]): AdvisorWorkout[] {
  const out: AdvisorWorkout[] = [];
  for (const w of raw) {
    if (!w.dateKey) continue;
    const sec = typeof w.durationSec === 'number' && Number.isFinite(w.durationSec) ? w.durationSec : 0;
    out.push({ date: w.dateKey, kind: workoutKindOf(w), minutes: Math.round(sec / 60) });
  }
  return out;
}

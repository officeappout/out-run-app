/**
 * Workout insights — the compact request for POST /api/insights/workout, built from the same
 * phase summary the v2 summary renders (utils/phase-summary.ts). Pure.
 *
 * The level-up screen (first) and the summary (second) build it from the SAME inputs, so the
 * key matches and one network call serves both screens (insight-api.ts dedupes by key).
 * Sent: exercise catalog names, per-set values, last-time improvement, duration, the level
 * move. Never: uid, names, bodyweight, location.
 */
import type { LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';
import type { InsightExercise, WorkoutInsightRequest } from '@/lib/ai/insights/schema';
import type { PhaseSummary } from '../utils/phase-summary';

const MAX_EXERCISES = 24;

function cleanName(name: string): string {
  return name.replace(/[<>{}\\`$]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function insightExercises(phases: readonly PhaseSummary[]): InsightExercise[] {
  const out: InsightExercise[] = [];
  for (const p of phases) {
    if (p.phase !== 'main') continue;
    for (const b of p.blocks) {
      for (const e of b.exercises) {
        if (e.unit === 'unknown' || e.doneSets === 0) continue;
        const name = cleanName(e.name);
        if (!name) continue;
        const sets = e.sets
          .map((s) => (s.done == null ? 0 : Math.max(0, Math.min(600, Math.round(s.done)))))
          .slice(0, 15);
        out.push({
          name,
          unit: e.unit,
          sets,
          ...(e.improvedBy != null && e.improvedBy > 0 ? { improvedBy: Math.min(600, Math.round(e.improvedBy)) } : {}),
        });
        if (out.length >= MAX_EXERCISES) return out;
      }
    }
  }
  return out;
}

/** djb2 — a short, stable fingerprint of the workout's sets (not security). */
export function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * The workout's cache key: its duration + every set (both screens have these, the summary has
 * no plan id). Two different workouts with the same duration to the second AND the same sets
 * would share one answer — harmless.
 */
export function insightKey(durationSec: number, exercises: readonly InsightExercise[]): string {
  const json = JSON.stringify([Math.round(durationSec), exercises.map((e) => [e.name, e.sets])]);
  return `s:${fingerprint(json)}:${fingerprint(json.split('').reverse().join(''))}`;
}

export interface StrengthInsightSource {
  durationSec: number;
  phases: readonly PhaseSummary[];
  outcome?: LevelUpOutcome | null;
  isRecovery?: boolean;
}

/** null = nothing worth asking about (no main-phase exercise was done). */
export function strengthInsightRequest(src: StrengthInsightSource): WorkoutInsightRequest | null {
  const exercises = insightExercises(src.phases);
  if (exercises.length === 0) return null;
  const durationSec = Math.max(0, Math.min(6 * 3600, Math.round(src.durationSec)));
  const o = src.outcome;
  return {
    key: insightKey(durationSec, exercises),
    kind: 'strength',
    durationSec,
    exercises,
    ...(o
      ? {
          level: {
            before: Math.max(0, Math.min(100, Math.round(o.before.level))),
            after: Math.max(0, Math.min(100, Math.round(o.after.level))),
            gainPercent: Math.max(0, Math.min(100, o.totalGain ?? 0)),
            leveledUp: o.leveledUp,
          },
          ...(o.isFirstWorkout ? { first: true } : {}),
        }
      : {}),
    ...(src.isRecovery ? { recovery: true } : {}),
  };
}

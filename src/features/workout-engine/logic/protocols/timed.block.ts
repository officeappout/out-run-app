/**
 * timed.block — AMRAP / EMOM main blocks from what the generator ALREADY
 * decides (enable_home_v2 consumers only). Pure.
 *
 * The generator has long chosen a timed structure without any consumer:
 *   - `structure: 'emom'` — the admin protocol lottery picked 'emom' from the
 *     program's preferredProtocols (selectProtocol);
 *   - `intentMode: 'blast'` (custom builder) → `structure` 'emom' | 'amrap'
 *     and `blastMode` (type + duration).
 * Like `tabataBlock`, plan-level fields never reach the player — the SEGMENT
 * is the only channel the runner executes. So the mappers (behind the flag)
 * turn seg-main into a block-scoped `emom` / `amrap` segment with a config
 * derived here. No new data fields: protocol / protocolConfig already exist
 * on WorkoutSegment, and the inputs are existing GeneratedWorkout fields.
 */
import type { AmrapProtocolConfig, EmomProtocolConfig } from '../../core/types/protocol.types';
import type { GeneratedWorkout, WorkoutExercise } from '../workout-generator.types';

export type TimedMainFormat = 'emom' | 'amrap';

export type TimedMainBlock =
  | { protocol: 'emom'; config: EmomProtocolConfig; minutes: number; title: string }
  | { protocol: 'amrap'; config: AmrapProtocolConfig; minutes: number; title: string };

export const TIMED_MAIN_MIN_MINUTES = { emom: 6, amrap: 5 } as const;
export const TIMED_MAIN_MAX_MINUTES = 20;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

function isMain(ex: Pick<WorkoutExercise, 'exerciseRole'> & { protocolBlock?: string }): boolean {
  const role = ex.exerciseRole;
  return (role === 'main' || !role) && ex.protocolBlock !== 'tabata';
}

/** Which timed format the generator chose for the main part (null = classic). */
export function timedMainFormat(gw: Pick<GeneratedWorkout, 'structure' | 'blastMode'>): TimedMainFormat | null {
  if (gw.structure === 'emom' || gw.structure === 'amrap') return gw.structure;
  return gw.blastMode?.type ?? null;
}

/**
 * The block for the main exercises, or null. Length ≈ one minute per planned
 * set (the classic main's own time budget), capped by the blast duration
 * when the builder set one, clamped to 6–20 (EMOM) / 5–20 (AMRAP) minutes.
 */
export function timedMainBlock(gw: Pick<GeneratedWorkout, 'structure' | 'blastMode' | 'exercises'>): TimedMainBlock | null {
  const format = timedMainFormat(gw);
  if (!format) return null;
  const main = (gw.exercises ?? []).filter((e) => isMain(e as WorkoutExercise & { protocolBlock?: string }));
  if (main.length === 0) return null;
  const sumSets = main.reduce((a, e) => a + (e.sets && e.sets > 0 ? e.sets : 3), 0);
  const blast = gw.blastMode?.type === format && gw.blastMode.durationMinutes > 0 ? gw.blastMode.durationMinutes : Infinity;
  const minutes = clamp(Math.min(sumSets, blast), TIMED_MAIN_MIN_MINUTES[format], TIMED_MAIN_MAX_MINUTES);
  if (format === 'emom') {
    return { protocol: 'emom', config: { intervalSec: 60, totalIntervals: minutes }, minutes, title: `EMOM ${minutes}′` };
  }
  // roundItems empty → the round is the segment's exercises in order (timed-spec).
  return { protocol: 'amrap', config: { capSec: minutes * 60, roundItems: [] }, minutes, title: `AMRAP ${minutes}′` };
}

/**
 * Mapper step (flag on only): seg-main → the timed block. Every other
 * segment is returned untouched; no block → the same array.
 */
export function withTimedMainBlock<S extends { id: string }>(
  segments: S[],
  gw: Pick<GeneratedWorkout, 'structure' | 'blastMode' | 'exercises'>,
): S[] {
  const block = timedMainBlock(gw);
  if (!block || !segments.some((s) => s.id === 'seg-main')) return segments;
  return segments.map((s) =>
    s.id === 'seg-main'
      ? {
          ...s,
          title: block.title,
          target: { type: 'time' as const, value: block.minutes * 60 },
          // In-block rest is the clock's job.
          restBetweenExercises: 0,
          protocol: block.protocol,
          protocolConfig: block.config,
        }
      : s,
  );
}

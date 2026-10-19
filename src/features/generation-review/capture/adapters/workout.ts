/**
 * GeneratedWorkout / StrengthBlockResult exercises → ExerciseSummary[] (ids, pattern, sets, level,
 * gear, media). Gear is checked HERE with the app's own matcher (normalizeGearIds +
 * satisfiesGearRequirement), against the place's gear when it is known.
 */
import type { WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { normalizeGearIds, satisfiesGearRequirement } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { ExerciseSummary } from '@/lib/generation-review/types';

interface MethodLike {
  equipmentIds?: string[];
  equipmentId?: string;
  gearIds?: string[];
  gearId?: string;
  media?: { mainVideoUrl?: string | null } | null;
}

function methodGear(method: MethodLike | null | undefined): string[] {
  if (!method) return [];
  const raw = [...(method.equipmentIds ?? []), method.equipmentId, ...(method.gearIds ?? []), method.gearId].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  try {
    return normalizeGearIds(raw);
  } catch {
    return raw;
  }
}

function gearOk(needs: string[], have: string[] | null | undefined): boolean | null {
  if (!have) return null;
  if (needs.length === 0) return true;
  let normalizedHave: string[];
  try {
    normalizedHave = normalizeGearIds(have);
  } catch {
    normalizedHave = have;
  }
  return needs.some((req) => satisfiesGearRequirement(req, normalizedHave));
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function summarizeExercises(list: WorkoutExercise[] | null | undefined, placeGear?: string[] | null): ExerciseSummary[] {
  return (list ?? [])
    .filter((we) => we?.exercise?.id && we.exerciseRole !== 'warmup' && we.exerciseRole !== 'cooldown')
    .slice(0, 40)
    .map((we) => {
      const method = we.method as unknown as MethodLike | undefined;
      const needs = methodGear(method);
      const media = (we.exercise as unknown as { media?: { videoUrl?: string; imageUrl?: string } }).media;
      const hasMedia = !!(method?.media?.mainVideoUrl || media?.videoUrl || media?.imageUrl);
      return {
        id: String(we.exercise.id).slice(0, 80).replace(/[^A-Za-z0-9_-]/g, '_'),
        pattern: we.exercise.movementGroup ?? null,
        sets: num(we.sets),
        reps: we.isTimeBased ? null : num(we.reps),
        durationSec: we.isTimeBased ? num(we.reps) : null,
        level: num(we.programLevel),
        equipment: needs.length ? needs.slice(0, 12) : ['none'],
        gearOk: gearOk(needs, placeGear),
        hasMedia,
      };
    });
}

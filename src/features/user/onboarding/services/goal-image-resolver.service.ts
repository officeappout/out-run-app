/**
 * Resolves the v2 program-path goal photos configured as `library` in
 * GOAL_IMAGE_CONFIG (constants/program-path-goal-images.ts) from the
 * exercise library — the same reader (getAllExercisesCached, 5-min shared
 * cache) and the same image resolver (resolveImageForLocation: Bunny
 * thumbnail → method image → legacy media image) the app already uses.
 * Program slugs are mapped to Firestore program ids with the onboarding
 * resolver's own resolveCategoryToProgramId. Read-only; never throws.
 */
import { getAllExercisesCached } from '@/features/content/exercises/core/exercise.service';
import { resolveImageForLocation } from '@/features/content/exercises/core/exercise.types';
import { resolveCategoryToProgramId } from './visual-content-resolver.service';
import {
  pickExerciseImageForProgramLevel,
  type GoalImageSource,
} from '../constants/program-path-goal-images';

export async function resolveLibraryGoalImage(
  source: Extract<GoalImageSource, { kind: 'library' }>,
): Promise<string | null> {
  try {
    const resolved = await Promise.all(
      source.programIds.map((slug) => resolveCategoryToProgramId(slug).catch(() => slug)),
    );
    const candidates = Array.from(new Set([...source.programIds, ...resolved]));
    const exercises = await getAllExercisesCached();
    return pickExerciseImageForProgramLevel(exercises, candidates, source.level, (ex) =>
      resolveImageForLocation(ex),
    );
  } catch (e) {
    console.warn('[ProgramPath] goal image lookup failed — using the fallback', e);
    return null;
  }
}

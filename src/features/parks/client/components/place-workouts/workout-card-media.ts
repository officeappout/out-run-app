/**
 * The generated park workout's card media (pure, owner device feedback 26.10:
 * the strength card showed the park photo instead of the workout's exercise).
 *
 * Home's rule first — pickHeroExercise + resolveHeroMedia (still + video loop)
 * — and when that one exercise resolves nothing, the next exercise that does
 * (main exercises first), so a single exercise with a content gap never drops
 * the whole card to the park photo. Machine stations (the park workout's
 * tabata machines) carry their media on their own method, not on an
 * execution_methods list — resolveHeroMedia's location gate blanks them, so
 * they resolve straight from that method. Empty only when NO exercise in the
 * workout has any media; then the caller shows the park photo.
 */

import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { pickHeroExercise, resolveHeroMedia } from '@/features/workout-engine/shared/utils/heroMedia.utils';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';

export interface CardMedia {
  thumbnailUrl: string;
  videoUrl: string;
}

const EMPTY: CardMedia = { thumbnailUrl: '', videoUrl: '' };
const hasMedia = (m: CardMedia) => !!(m.thumbnailUrl || m.videoUrl);
const isMain = (ex: WorkoutExercise) => ex.exercise.exerciseRole === 'main' || ex.exercise.exerciseRole == null;

function methodsOf(ex: WorkoutExercise): unknown[] {
  const e = ex.exercise as unknown as { execution_methods?: unknown[]; executionMethods?: unknown[] };
  return e.execution_methods ?? e.executionMethods ?? [];
}

function mediaOf(ex: WorkoutExercise, location: string, opts?: { posterFromVideo?: boolean }): CardMedia {
  const hero = resolveHeroMedia(ex, location, opts);
  if (hasMedia(hero)) return hero;
  // A machine station: no execution_methods, its media is on the method the composer built.
  const own = (ex as unknown as { method?: Record<string, unknown> | null }).method;
  if (methodsOf(ex).length === 0 && own?.media) {
    const { imageUrl, videoUrl } = resolveExerciseMedia(ex.exercise as unknown as Record<string, unknown>, own);
    return { thumbnailUrl: imageUrl || '', videoUrl: videoUrl || '' };
  }
  return EMPTY;
}

export function pickWorkoutCardMedia(
  exercises: readonly WorkoutExercise[] | undefined,
  location: string,
  opts?: { posterFromVideo?: boolean },
): CardMedia {
  if (!exercises?.length) return EMPTY;
  const list = [...exercises];
  const hero = pickHeroExercise(list, location);
  const ordered = [hero, ...list.filter(isMain), ...list.filter((e) => !isMain(e))].filter(
    (e, i, all): e is WorkoutExercise => !!e && all.indexOf(e) === i,
  );
  for (const ex of ordered) {
    const media = mediaOf(ex, location, opts);
    if (hasMedia(media)) return media;
  }
  return EMPTY;
}

/**
 * exercise-display — name / thumbnail of a station's planned exercise for the
 * v2 hybrid player (the pure list / card helpers take these as callbacks).
 */
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import { resolveExerciseMedia } from '../../shared/utils/media-resolution.utils';
import type { ContentExercise } from './hybrid-v2-view';

/** Hebrew name of an exercise doc (localized object or a plain string). */
export function exerciseNameOf(exercise: unknown): string {
  const name = (exercise as { name?: unknown } | null)?.name;
  if (typeof name === 'string') return name || 'תרגיל';
  return getLocalizedText(name as Parameters<typeof getLocalizedText>[0], 'he') || 'תרגיל';
}

/** Thumbnail of a planned exercise (its selected method first), or undefined. */
export function exerciseImageOf(entry: ContentExercise): string | undefined {
  if (!entry.exercise || typeof entry.exercise !== 'object') return undefined;
  try {
    return resolveExerciseMedia(entry.exercise as Record<string, unknown>, (entry.method ?? null) as Record<string, unknown> | null).imageUrl;
  } catch {
    return undefined;
  }
}

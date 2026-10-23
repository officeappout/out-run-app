/**
 * Catalog media for a shared workout: thumbnails / videos by exercise id, through the same
 * resolver the in-app preview uses (resolveExerciseMedia). Client-only (the exercise cache).
 */
import { getAllExercisesCached } from '@/features/content/exercises';
import { resolveExerciseMedia } from '../shared/utils/media-resolution.utils';
import type { CatalogMedia } from './shared-workout-view';

export async function loadCatalogMedia(ids: readonly string[]): Promise<Record<string, CatalogMedia>> {
  const wanted = new Set(ids);
  const out: Record<string, CatalogMedia> = {};
  if (wanted.size === 0) return out;
  try {
    const all = await getAllExercisesCached();
    for (const ex of all ?? []) {
      if (!wanted.has(ex.id)) continue;
      const { imageUrl, videoUrl } = resolveExerciseMedia(ex as unknown as Record<string, unknown>, null);
      if (imageUrl || videoUrl) out[ex.id] = { imageUrl, videoUrl };
    }
  } catch (err) {
    console.warn('[shared-workout-media] catalog lookup failed', err);
  }
  return out;
}

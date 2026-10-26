/**
 * Which media a place workout card shows (pure). Same rule as home's daily
 * card — the workout's own exercise media when the workout is generated
 * (pickHeroExercise + resolveHeroMedia, see useLeadWorkout) — else the
 * place's own photo (where this run / walk / hybrid happens), else nothing
 * and HeroMediaBackground draws the brand gradient. Never a stock photo.
 */

import { bunnyImg } from '@/lib/bunny-image';
import type { MediaWorkoutCardMedia } from '@/components/ui/v2/MediaWorkoutCard';
import type { PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';
import type { GeneratedLead } from './place-workout-copy';

export const NO_MEDIA: MediaWorkoutCardMedia = { thumbnailUrl: '', videoUrl: '' };
/** Card width × 2 (retina) for Bunny's resize. */
const PHOTO_W = 520;

/** The first real photo of a park / route doc (cover first). */
export function placePhotoOf(doc: { images?: readonly (string | null | undefined)[] | null; imageUrl?: string | null; image?: string | null }): string | null {
  const candidates = [doc.imageUrl, doc.images?.[0], doc.image];
  const url = candidates.find((u): u is string => typeof u === 'string' && u.trim().length > 0);
  return url ?? null;
}

export function placeCardMedia(
  s: PlaceWorkoutSuggestion,
  lead: GeneratedLead | 'loading' | null,
  placePhoto: string | null,
): MediaWorkoutCardMedia {
  const generated = s.start.kind === 'park_strength' && lead && lead !== 'loading' ? lead.media : undefined;
  if (generated && (generated.thumbnailUrl || generated.videoUrl)) return generated;
  if (placePhoto) return { thumbnailUrl: bunnyImg(placePhoto, PHOTO_W), videoUrl: '' };
  return NO_MEDIA;
}

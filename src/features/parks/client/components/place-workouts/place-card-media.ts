/**
 * Which media a place workout card shows (pure). Same rule as home's daily
 * card — the workout's own exercise media when the workout is generated
 * (workout-card-media, see useLeadWorkout) — else the place's own photo, else
 * nothing and HeroMediaBackground draws the brand gradient. Never a stock
 * photo. The park workout's card waits on the brand gradient while its
 * workout generates (owner 26.10: the park photo there read as "the card
 * shows the park, not the workout"); the photo only when generation is done
 * and the workout has no exercise media, or it could not be generated.
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
  if (s.start.kind === 'park_strength' && lead === 'loading') return NO_MEDIA;
  const generated = s.start.kind === 'park_strength' && lead && lead !== 'loading' ? lead.media : undefined;
  if (generated && (generated.thumbnailUrl || generated.videoUrl)) return generated;
  if (placePhoto) return { thumbnailUrl: bunnyImg(placePhoto, PHOTO_W), videoUrl: '' };
  return NO_MEDIA;
}

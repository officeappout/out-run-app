/**
 * resolve-tree-node-image.ts — the Tree's node-thumbnail image resolver.
 *
 * Round 5 fix: the canonical resolveImageForLocation(exercise, 'park') only
 * ever derives an image from a park method's `media.previewVideo` (Phase 5
 * field) or `media.imageUrl` — never from `media.mainVideoUrl` directly.
 * Some exercises (confirmed live example: "Y משיכות" / mFcuYlNgKXLqWVUFo0zt
 * level 1) have a park METHOD with a real mainVideoUrl but no previewVideo
 * and no imageUrl — so the canonical function's park branch finds nothing
 * and falls all the way through to its last resort, the location-agnostic
 * legacy `exercise.media.imageUrl`, which for that exercise happens to be a
 * home photo. That's the reported bug: "current node shows HOME image."
 *
 * This resolver adds exactly one more tier, tried before giving up on park
 * entirely: if an exact-or-locationMapping park method has a mainVideoUrl
 * whose URL contains a Bunny video ID, derive a thumbnail from THAT video
 * (buildBunnyThumbnailUrl) rather than skipping straight to the full
 * cross-location waterfall. Order, most to least specific:
 *   1. Park method's preview-video thumbnail (same as the canonical fn)
 *   2. Park method's explicit imageUrl
 *   3. Park method's mainVideoUrl → derived Bunny thumbnail (NEW)
 *   4. resolveImageForLocation(exercise, 'park') — canonical full waterfall,
 *      which can still fall back to a home photo. Reached only when the
 *      exercise has no park method at all, or that method has nothing
 *      derivable by any of the 3 tiers above.
 *
 * Imported from the specific submodule, NOT the '@/features/content/exercises'
 * barrel — that barrel re-exports ExerciseEditorForm.tsx (JSX), which this
 * repo's vitest config (plain node env, no JSX transform) cannot parse.
 * Same pitfall + same fix already documented at program-groups.utils.ts.
 *
 * Round 6: Bug 1 is still reported open on the live front-lever tree — the
 * video-thumbnail tier above isn't producing a park image for "Y משיכות"
 * level 1. Rather than guess at which tier is silently failing (no exact
 * park method found at all? a mainVideoUrl that doesn't match the Bunny
 * UUID regex? something else?), this function now logs every intermediate
 * value once per call — see the temporary console.log at the bottom.
 */
import {
  Exercise,
  ExecutionMethod,
  resolveImageForLocation,
  resolvePreviewForLang,
} from '@/features/content/exercises/core/exercise.types';
import { buildBunnyThumbnailUrl, extractBunnyVideoId } from '@/lib/bunny/bunny.config';

function findExactParkMethod(exercise: Exercise): ExecutionMethod | null {
  const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
  const exact = methods.find((m) => m.location === 'park');
  if (exact) return exact;
  return methods.find((m) => m.locationMapping?.includes('park')) ?? null;
}

export function resolveTreeNodeImage(exercise: Exercise): string {
  const parkMethod = findExactParkMethod(exercise);

  // Tier 1: same preview-thumbnail derivation the canonical function uses.
  const preview = parkMethod
    ? resolvePreviewForLang(parkMethod.media as Parameters<typeof resolvePreviewForLang>[0])
    : undefined;
  const previewThumb =
    preview?.thumbnailUrl ?? (preview?.videoId ? buildBunnyThumbnailUrl(preview.videoId) : undefined);

  // Tier 2: explicit image on the park method itself.
  const methodImageUrl = parkMethod?.media?.imageUrl ?? null;

  // Tier 3 (the round-5 fix): no park image variant, but a park VIDEO
  // exists — derive a thumbnail from it instead of giving up on park.
  const mainVideoUrl = parkMethod?.media?.mainVideoUrl ?? null;
  const extractedVideoId = mainVideoUrl ? extractBunnyVideoId(mainVideoUrl) : null;
  const videoThumb = extractedVideoId ? buildBunnyThumbnailUrl(extractedVideoId) : null;

  let tier: 'preview' | 'method-image' | 'video-thumbnail' | 'canonical-waterfall';
  let url: string;

  if (previewThumb) {
    tier = 'preview';
    url = previewThumb;
  } else if (methodImageUrl) {
    tier = 'method-image';
    url = methodImageUrl;
  } else if (videoThumb) {
    tier = 'video-thumbnail';
    url = videoThumb;
  } else {
    // Tier 4: no exact park method, or the one found had nothing derivable
    // at all (e.g. a non-Bunny video URL) — fall through to the canonical
    // full waterfall, which can still legitimately end in a home photo.
    tier = 'canonical-waterfall';
    url = resolveImageForLocation(exercise, 'park');
  }

  // TEMPORARY diagnostic (round 6 — Bug 1 still open: "Y משיכות" front-lever
  // level 1 still shows a home image despite this round-5 tier existing).
  // Unconditional (a Vercel preview sets NODE_ENV=production, which would
  // silently suppress a dev-gated log) so the founder can see, per node,
  // exactly which tier fired and why the video-thumbnail tier didn't
  // produce a park image — instead of guessing at the failing tier.
  // Remove once Bug 1 is confirmed fixed for real.
  // eslint-disable-next-line no-console
  console.log('[resolveTreeNodeImage]', {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    foundParkMethod: !!parkMethod,
    parkMethodLocation: parkMethod?.location ?? null,
    parkMethodLocationMapping: parkMethod?.locationMapping ?? null,
    hasPreviewVideo: !!preview,
    hasMethodImageUrl: !!methodImageUrl,
    mainVideoUrl,
    extractedVideoId,
    videoThumbnailTierFired: tier === 'video-thumbnail',
    tier,
    finalUrl: url,
  });

  return url;
}

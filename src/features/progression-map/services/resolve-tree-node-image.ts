/**
 * resolve-tree-node-image.ts — the Tree's node-thumbnail image resolver.
 *
 * Round 5 fix: the canonical resolveImageForLocation(exercise, 'park') only
 * ever derives an image from a park method's `media.previewVideo` (Phase 5
 * field) or `media.imageUrl` — never from `media.mainVideoUrl` directly.
 * Some park methods have a real mainVideoUrl but no previewVideo and no
 * imageUrl — so the canonical function's park branch found nothing and fell
 * all the way through to its last resort, the location-agnostic legacy
 * `exercise.media.imageUrl`, which can be a home photo. That's the reported
 * bug: "current node shows HOME image." This resolver adds one more tier,
 * tried before giving up on park entirely: derive a thumbnail from a park
 * method's mainVideoUrl (buildBunnyThumbnailUrl) when it contains a Bunny
 * video ID, rather than skipping straight to the full cross-location
 * waterfall.
 *
 * Round 7 (the actual root cause of Bug 1, found by the founder in the
 * CMS): "Y משיכות" (front-lever level 1) has MULTIPLE park-tagged execution
 * methods — e.g. one for rings (has media), one for built-in straps (no
 * media at all). Round 5/6 only ever looked at the FIRST park method found
 * and gave up on park entirely the moment THAT ONE had nothing derivable —
 * never checking whether a LATER park method had usable media. Fixed by
 * scanning every park-location method (not just the first) and returning
 * the first one, in order, that yields something via the same per-method
 * tier waterfall below. Only when NONE of them have anything derivable does
 * this fall through to the canonical function (which can still end in home).
 * A method's `media.imageUrl` is accepted from ANY host (Firebase Storage,
 * Bunny, anything) — it's tier 2 below regardless of who hosts it; only the
 * mainVideoUrl→thumbnail derivation (tier 3) is Bunny-specific, because only
 * Bunny CDN URLs carry a derivable video ID in their path shape.
 *
 * Method-selection order: exact `location === 'park'` methods first (in
 * their original array order), then `locationMapping`-only park methods —
 * same relative priority round 5/6 used for picking a single method, now
 * just applied to build a search LIST instead of stopping at the first hit.
 *
 * Per-method tier order (unchanged from round 5/6, just applied per method
 * now instead of only to the first one found):
 *   1. Preview-video thumbnail (same derivation the canonical fn uses)
 *   2. Explicit method.media.imageUrl (any host)
 *   3. Bunny thumbnail derived from method.media.mainVideoUrl
 *   4. (only if NO park method yielded anything above) —
 *      resolveImageForLocation(exercise, 'park'), the canonical full
 *      waterfall, which can still legitimately end in a home photo.
 *
 * Imported from the specific submodule, NOT the '@/features/content/exercises'
 * barrel — that barrel re-exports ExerciseEditorForm.tsx (JSX), which this
 * repo's vitest config (plain node env, no JSX transform) cannot parse.
 * Same pitfall + same fix already documented at program-groups.utils.ts.
 */
import {
  Exercise,
  ExecutionMethod,
  resolveImageForLocation,
  resolvePreviewForLang,
} from '@/features/content/exercises/core/exercise.types';
import { buildBunnyThumbnailUrl, extractBunnyVideoId } from '@/lib/bunny/bunny.config';

type DerivedTier = 'preview' | 'method-image' | 'video-thumbnail';

function findParkMethods(exercise: Exercise): ExecutionMethod[] {
  const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
  const exact = methods.filter((m) => m.location === 'park');
  const mapped = methods.filter((m) => m.location !== 'park' && m.locationMapping?.includes('park'));
  return [...exact, ...mapped];
}

/** Per-method tier waterfall (unchanged from round 5/6) — null if none fire. */
function deriveImageFromMethod(
  method: ExecutionMethod,
): { url: string; tier: DerivedTier; diagnostic: MethodDiagnostic } | null {
  const preview = resolvePreviewForLang(method.media as Parameters<typeof resolvePreviewForLang>[0]);
  const previewThumb =
    preview?.thumbnailUrl ?? (preview?.videoId ? buildBunnyThumbnailUrl(preview.videoId) : undefined);
  const methodImageUrl = method.media?.imageUrl ?? null;
  const mainVideoUrl = method.media?.mainVideoUrl ?? null;
  const extractedVideoId = mainVideoUrl ? extractBunnyVideoId(mainVideoUrl) : null;

  const diagnosticBase = {
    location: method.location ?? null,
    locationMapping: method.locationMapping ?? null,
    hasPreviewVideo: !!preview,
    hasMethodImageUrl: !!methodImageUrl,
    mainVideoUrl,
    extractedVideoId,
  };

  if (previewThumb) return { url: previewThumb, tier: 'preview', diagnostic: { ...diagnosticBase, derivedTier: 'preview' } };
  if (methodImageUrl) return { url: methodImageUrl, tier: 'method-image', diagnostic: { ...diagnosticBase, derivedTier: 'method-image' } };
  if (extractedVideoId) {
    return {
      url: buildBunnyThumbnailUrl(extractedVideoId),
      tier: 'video-thumbnail',
      diagnostic: { ...diagnosticBase, derivedTier: 'video-thumbnail' },
    };
  }
  return null;
}

interface MethodDiagnostic {
  location: string | null;
  locationMapping: string[] | null;
  hasPreviewVideo: boolean;
  hasMethodImageUrl: boolean;
  mainVideoUrl: string | null;
  extractedVideoId: string | null;
  derivedTier: DerivedTier | null;
}

export function resolveTreeNodeImage(exercise: Exercise): string {
  const parkMethods = findParkMethods(exercise);

  let chosenMethodIndex: number | null = null;
  let tier: DerivedTier | 'canonical-waterfall' = 'canonical-waterfall';
  let url: string | null = null;
  const perMethodDiagnostics: MethodDiagnostic[] = [];

  for (let i = 0; i < parkMethods.length; i++) {
    const derived = deriveImageFromMethod(parkMethods[i]);
    if (derived) {
      perMethodDiagnostics.push(derived.diagnostic);
      if (url === null) {
        chosenMethodIndex = i;
        tier = derived.tier;
        url = derived.url;
      }
    } else {
      perMethodDiagnostics.push({
        location: parkMethods[i].location ?? null,
        locationMapping: parkMethods[i].locationMapping ?? null,
        hasPreviewVideo: false,
        hasMethodImageUrl: false,
        mainVideoUrl: parkMethods[i].media?.mainVideoUrl ?? null,
        extractedVideoId: null,
        derivedTier: null,
      });
    }
  }

  if (url === null) {
    // No park method (of however many) had anything derivable at all —
    // fall through to the canonical full waterfall, which can still
    // legitimately end in a home photo.
    tier = 'canonical-waterfall';
    url = resolveImageForLocation(exercise, 'park');
  }

  // TEMPORARY diagnostic (round 6, extended round 7 for the multi-method
  // scan). Was deliberately unconditional (a Vercel preview sets
  // NODE_ENV=production, which suppresses a dev-gated log) so the founder
  // could see, per node, how many park methods exist, which one (if any)
  // was chosen, and why. Gated behind NODE_ENV now (Phase 4c-2) — it was
  // flooding the console on every render of every one of the ~20 tree
  // nodes. If this needs to be visible on a preview again, flip the
  // condition back rather than re-removing the guard blind. Remove this
  // log entirely once Bug 1 is confirmed fixed for real.
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('[resolveTreeNodeImage]', {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      parkMethodCount: parkMethods.length,
      foundParkMethod: parkMethods.length > 0,
      chosenMethodIndex,
      perMethodDiagnostics,
      tier,
      finalUrl: url,
    });
  }

  return url;
}

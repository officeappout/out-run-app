/**
 * Unified Media Resolution Utility
 *
 * Exhaustive 5-level deep search for exercise video/image URLs.
 * Shared across Workout Overview (home/page.tsx), Swap UI, and any
 * component that needs to resolve exercise media.
 *
 * Search priority (video):
 *   1. Selected method's media.mainVideoUrl / media.videoUrl
 *   2. Any OTHER method's media.mainVideoUrl / media.videoUrl — park-tagged
 *      methods first, then the rest in original order (see byParkFirst)
 *   3. Exercise-level media.videoUrl
 *   4. Exercise root videoUrl / media.mainVideoUrl
 *
 * Search priority (image):
 *   1. Selected method's media.imageUrl
 *   2. Any OTHER method's media.imageUrl — park-tagged methods first, then
 *      the rest in original order (see byParkFirst)
 *   3. Exercise-level media.imageUrl
 *   4. Exercise root imageUrl / coverImage / thumbnailUrl
 *   5. Falls back to resolved video URL (video thumbnail)
 *
 * Search priority (fullTutorial — long-form instructional video):
 *   1. Selected method's media.fullTutorial (HE, with HE fallback)
 *   2. Any OTHER method's media.fullTutorial — park-tagged methods first,
 *      then the rest in original order (see byParkFirst)
 *   3. Exercise-level media.fullTutorial
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { resolveTutorialForLang, resolvePreviewForLang } from '@/features/content/exercises/core/exercise.types';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';
import { buildBunnyStreamUrl, buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';

export interface ResolvedMedia {
  videoUrl: string | undefined;
  imageUrl: string | undefined;
  /** Long-form instructional video, deep-searched like videoUrl. Null when none uploaded. */
  fullTutorial: ExternalVideo | null;
  /** Bare Bunny UUID of the resolved method — feed to useNetworkAwareStreamUrl for
   *  ADAPTIVE playback (do NOT use the fixed-resolution videoUrl for the live player).
   *  Undefined for legacy/non-Bunny methods. */
  bunnyVideoId: string | undefined;
}

const _BUNNY_UUID = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

/**
 * Cross-method fallback order: the requested method itself is already checked
 * before any of the three .reduce() calls below reach this list — this only
 * decides the order AFTER that. Park first, then everything else in its
 * original relative order (stable partition, not a re-sort of the whole
 * array). Reason: today every cross-method fallback in the catalog (559/559,
 * measured) happens to land on a park method anyway, purely because park is
 * the only location with near-complete video content — but the underlying
 * .reduce() was plain array order with no rule behind it. That's silently
 * exploitable two ways: (1) admin's MethodsSection duplicate/remove reindexes
 * execution_methods on every edit, so which method "wins" the fallback could
 * change with no data change at all; (2) the day real video content lands on
 * a non-park method authored earlier in the array, the fallback would jump to
 * it with no signal that a rule was ever intended. Explicit park-first makes
 * today's accidental behavior a real, stable rule instead.
 */
function byParkFirst(allMethods: any[]): any[] {
  const park = allMethods.filter((m) => m?.location === 'park');
  const rest = allMethods.filter((m) => m?.location !== 'park');
  return [...park, ...rest];
}

/**
 * Resolve a SINGLE method's Bunny id from ALL of its slots, in order:
 *   previewVideo.videoId → media.bunnyVideoId_mainVideoUrl → UUID parsed from mainVideoUrl.
 * Reading every slot of the SELECTED method is what fixes the bug where a park method's
 * video lives in `mainVideoUrl` (not `previewVideo`) — previously the resolver saw no
 * previewVideo and fell through to another method / root (the home image).
 */
function methodBunnyId(media: Record<string, any> | undefined): string | undefined {
  if (!media) return undefined;
  const preview = resolvePreviewForLang(media as any)?.videoId;
  if (preview) return preview;
  if (typeof media.bunnyVideoId_mainVideoUrl === 'string' && media.bunnyVideoId_mainVideoUrl) {
    return media.bunnyVideoId_mainVideoUrl;
  }
  const m = typeof media.mainVideoUrl === 'string' ? media.mainVideoUrl.match(_BUNNY_UUID) : null;
  return m ? m[1] : undefined;
}

/**
 * Resolve media URLs for an exercise, using a deep fallback chain
 * across the selected method, all available methods, and the exercise root.
 *
 * @param exercise  - The exercise object (any shape — tolerant of legacy schemas)
 * @param method    - The selected execution method (optional)
 * @returns `{ videoUrl, imageUrl }` — either may be undefined if truly absent
 */
export function resolveExerciseMedia(
  exercise: Record<string, any>,
  method?: Record<string, any> | null,
): ResolvedMedia {
  const methodMedia = method?.media as Record<string, any> | undefined;
  const allMethods: any[] =
    exercise.execution_methods || exercise.executionMethods || exercise.methods || [];
  // Computed once, reused by all 4 cross-method fallbacks below — see byParkFirst's own comment.
  const allMethodsParkFirst = byParkFirst(allMethods);

  // ── Bunny preview (NEW structured field) ──
  // Resolved BEFORE the legacy chain so a Bunny-only exercise (has
  // `media.previewVideo.he.videoId` but no legacy `mainVideoUrl`) stops being a
  // [Media FAIL]. Deep search mirrors the fullTutorial/video priority: selected
  // method → any method → exercise root. A legacy-only exercise yields `undefined`
  // here and falls straight through to the untouched legacy chain below, so its
  // resolution stays byte-identical.
  // Per-method (ALL slots) → any method → root. See methodBunnyId above.
  const bunnyVideoId: string | undefined =
    methodBunnyId(methodMedia) ??
    allMethodsParkFirst.reduce<string | undefined>(
      (found, m: any) => found ?? methodBunnyId(m?.media),
      undefined,
    ) ??
    methodBunnyId(exercise.media as any) ??
    undefined;
  const bunnyStreamUrl: string | undefined = bunnyVideoId
    ? buildBunnyStreamUrl(bunnyVideoId)
    : undefined;
  // Thumbnail from the SAME method's Bunny id (explicit previewVideo.thumbnailUrl wins) —
  // never from the root/Firebase image.
  const bunnyThumbUrl: string | undefined =
    resolvePreviewForLang(methodMedia as any)?.thumbnailUrl ??
    (bunnyVideoId ? buildBunnyThumbnailUrl(bunnyVideoId) : undefined);

  // ── Video resolution ──
  const videoUrl: string | undefined =
    bunnyStreamUrl ||
    methodMedia?.mainVideoUrl ||
    methodMedia?.videoUrl ||
    allMethodsParkFirst.reduce(
      (found: string | undefined, m: any) =>
        found || m?.media?.mainVideoUrl || m?.media?.videoUrl,
      undefined,
    ) ||
    exercise.media?.videoUrl ||
    exercise.videoUrl ||
    exercise.media?.mainVideoUrl ||
    undefined;

  // ── Image resolution ──
  const imageUrl: string | undefined =
    bunnyThumbUrl ||
    methodMedia?.imageUrl ||
    allMethodsParkFirst.reduce(
      (found: string | undefined, m: any) => found || m?.media?.imageUrl,
      undefined,
    ) ||
    exercise.media?.imageUrl ||
    exercise.imageUrl ||
    exercise.coverImage ||
    exercise.thumbnailUrl ||
    videoUrl || // last resort: video thumbnail
    undefined;

  // ── Full tutorial resolution (deep search, mirrors video priority) ──
  const fullTutorial: ExternalVideo | null =
    resolveTutorialForLang(methodMedia as any) ??
    allMethodsParkFirst.reduce<ExternalVideo | undefined>(
      (found, m: any) => found || resolveTutorialForLang(m?.media),
      undefined,
    ) ??
    resolveTutorialForLang(exercise.media as any) ??
    null;

  return { videoUrl, imageUrl, fullTutorial, bunnyVideoId };
}

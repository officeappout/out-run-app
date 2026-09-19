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
 * Search priority (image) — 19.09.2026 fix: restored to match this actual
 * documented order (the code had drifted to trying a Bunny-derived
 * thumbnail FIRST, silently overriding a perfectly good stored image
 * whenever the exercise also had a resolvable video — see isCleanImageUrl):
 *   1. Selected method's media.imageUrl (skipped if it looks like a video
 *      URL — a known write-side artifact, see isCleanImageUrl below)
 *   2. Any OTHER method's media.imageUrl — park-tagged methods first, then
 *      the rest in original order (see byParkFirst) — same video-URL guard
 *   3. Exercise-level media.imageUrl (same guard)
 *   4. Exercise root imageUrl / coverImage / thumbnailUrl (same guard)
 *   5. Bunny-derived thumbnail (bunnyThumbUrl) — true last resort before 6,
 *      for a bunny-only exercise with no stored image anywhere
 *   6. Falls back to the resolved video URL itself — ONLY when it does NOT
 *      look like a raw video file/host (isCleanImageUrl again): a genuine
 *      video URL must never reach an <img>/<Image> src, so this tier now
 *      degrades to "no image" instead of a guaranteed-broken render.
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
import { buildBunnyStreamUrl, buildBunnyThumbnailUrl, extractBunnyVideoId } from '@/lib/bunny/bunny.config';

/**
 * Shared with the admin exercise list (src/app/admin/exercises/page.tsx,
 * where this exact pattern originated) — one canonical definition of "this
 * URL looks like a video, never hand it to an <img>/<Image> src." A stored
 * `media.imageUrl` field can legitimately hold a video URL (ExerciseEditorForm's
 * own save-time fallback: media.imageUrl falls back to media.mainVideoUrl when
 * no image was uploaded), so every "stored image" tier below must guard
 * against it, not just trust the field name.
 */
export const IMAGE_URL_VIDEO_PATTERNS = /\.(mp4|mov|webm|avi|mkv)(\?|#|$)|youtube\.com|youtu\.be|vimeo\.com/i;

function isCleanImageUrl(url: unknown): url is string {
  return typeof url === 'string' && url.trim().length > 0 && !IMAGE_URL_VIDEO_PATTERNS.test(url);
}

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

/**
 * Cross-method fallback order: the requested method itself is already checked
 * before any of the four .reduce() calls below reach this list — this only
 * decides the order AFTER that. Park first, then everything else in its
 * original relative order (stable partition, not a re-sort of the whole
 * array).
 *
 * Measurable behavior change, not a no-op: ~12% of exercises with 2+ methods
 * (42/349, measured) get a different video under this ordering than under
 * the old plain-array-order .reduce(). 125 exercises had been getting video
 * from a method that isn't park (out of ~341-346 old-fallback fires measured
 * — the exact denominator depends on counting methodology and wasn't
 * independently reproduced; the 125 itself was reproduced twice, by two
 * different methodologies). Affected: users at locations with no
 * content of their own (office/street/service) — they used to fall through
 * to whatever a home method happened to offer; now they get park. The
 * production impact today is minimal because PARK FORCE already routes
 * everyone to 'park' — this starts to matter the moment other locations
 * become independently reachable. Approved by David, per ADR-004
 * ("one workout = one location" — every method in a workout should carry
 * the SAME location tag, and this fallback existing at all is itself a
 * symptom of that not being enforced yet upstream).
 *
 * Underlying risk this closes: the old array-order .reduce() was silently
 * exploitable two ways — (1) admin's MethodsSection duplicate/remove
 * reindexes execution_methods on every edit, so which method "wins" a
 * fallback could change with no data change at all; (2) the day real video
 * content lands on a non-park method authored earlier in the array, the
 * fallback would jump to it with no signal a rule was ever intended.
 */
export function byParkFirst(allMethods: any[]): any[] {
  const park = allMethods.filter((m) => m?.location === 'park');
  const rest = allMethods.filter((m) => m?.location !== 'park');
  return [...park, ...rest];
}

/**
 * Resolve a SINGLE method's Bunny id from ALL of its slots, in order:
 *   previewVideo.videoId → media.bunnyVideoId_mainVideoUrl → uuid parsed from mainVideoUrl.
 * Reading every slot of the SELECTED method is what fixes the bug where a park method's
 * video lives in `mainVideoUrl` (not `previewVideo`) — previously the resolver saw no
 * previewVideo and fell through to another method / root (the home image).
 *
 * The last tier now goes through the SHARED extractBunnyVideoId (16.09.2026
 * unification) instead of a local regex — the previous local regex required a
 * trailing slash after the uuid that no real Bunny URL (embed or play) has,
 * which is why this always returned undefined for machine-pseudo-exercise
 * videos and the live player fell through to <img>/black.
 */
function methodBunnyId(media: Record<string, any> | undefined): string | undefined {
  if (!media) return undefined;
  const preview = resolvePreviewForLang(media as any)?.videoId;
  if (preview) return preview;
  if (typeof media.bunnyVideoId_mainVideoUrl === 'string' && media.bunnyVideoId_mainVideoUrl) {
    return media.bunnyVideoId_mainVideoUrl;
  }
  return extractBunnyVideoId(media.mainVideoUrl) ?? undefined;
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
    (isCleanImageUrl(methodMedia?.imageUrl) ? methodMedia!.imageUrl : undefined) ||
    allMethodsParkFirst.reduce(
      (found: string | undefined, m: any) =>
        found || (isCleanImageUrl(m?.media?.imageUrl) ? m.media.imageUrl : undefined),
      undefined,
    ) ||
    (isCleanImageUrl(exercise.media?.imageUrl) ? exercise.media.imageUrl : undefined) ||
    (isCleanImageUrl(exercise.imageUrl) ? exercise.imageUrl : undefined) ||
    (isCleanImageUrl(exercise.coverImage) ? exercise.coverImage : undefined) ||
    (isCleanImageUrl(exercise.thumbnailUrl) ? exercise.thumbnailUrl : undefined) ||
    bunnyThumbUrl || // true last resort: bunny-only exercise, no stored image anywhere
    (isCleanImageUrl(videoUrl) ? videoUrl : undefined) || // never hand a raw video URL to an <img> src
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

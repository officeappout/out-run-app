/**
 * resolve-park-node-image.ts — the Tree's node-thumbnail image resolver.
 *
 * Deliberately NOT resolveImageForLocation (exercise.types.ts), and
 * deliberately NOT findMethodForLocation either — both have fallback steps
 * that can surface a WRONG-location photo silently:
 *   - resolveImageForLocation's LAST step reads exercise.media.imageUrl, a
 *     location-AGNOSTIC legacy field that can hold ANY location's photo
 *     (often an old home-context shot, pre-dating the multi-method system).
 *   - findMethodForLocation itself falls back to "any method with media" —
 *     even the home method — when no park-tagged method exists at all
 *     (confirmed by a failing test in this file's own suite: passing it an
 *     exercise with only a home method still returned that home method,
 *     not null — exactly the false-positive this resolver exists to avoid).
 * Both would look exactly as valid as a real park photo — worse than a
 * placeholder, since a placeholder is honestly "no park photo yet" while a
 * wrong photo looks like a real park photo that just happens to be indoors.
 *
 * This resolver finds ONLY an exact-or-locationMapping park match (no
 * further fallback), then derives an image from THAT method alone — using
 * the same Bunny-preview-thumbnail derivation the canonical function uses.
 * Null means "no park image" and the caller should show a neutral
 * placeholder — never a video URL as a broken <img> src, never the
 * exercise-root legacy field, never a different location's method.
 */
// Imported from the specific submodule, NOT the '@/features/content/exercises'
// barrel — that barrel re-exports ExerciseEditorForm.tsx (JSX), which this
// repo's vitest config (plain node env, no JSX transform) cannot parse.
// Same pitfall + same fix already documented at program-groups.utils.ts.
import {
  Exercise,
  ExecutionMethod,
  resolvePreviewForLang,
} from '@/features/content/exercises/core/exercise.types';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';

function findExactParkMethod(exercise: Exercise): ExecutionMethod | null {
  const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
  const exact = methods.find((m) => m.location === 'park');
  if (exact) return exact;
  return methods.find((m) => m.locationMapping?.includes('park')) ?? null;
}

export function resolveParkNodeImage(exercise: Exercise): string | null {
  const method = findExactParkMethod(exercise);
  if (!method) return null;
  // ExecutionMethod.media is a structurally-similar-but-distinct inline type
  // from the named ExerciseMedia resolvePreviewForLang expects (some fields
  // allow `| null` here where ExerciseMedia only allows `| undefined`) — a
  // pre-existing type-design detail elsewhere in this codebase, not
  // something to work around by touching that shared type. The cast is
  // safe: resolvePreviewForLang only ever reads `.previewVideo`, a field
  // whose shape is identical between the two.
  const preview = resolvePreviewForLang(method.media as Parameters<typeof resolvePreviewForLang>[0]);
  const bunnyThumb = preview?.thumbnailUrl ?? (preview?.videoId ? buildBunnyThumbnailUrl(preview.videoId) : undefined);
  return bunnyThumb || method.media?.imageUrl || null;
}

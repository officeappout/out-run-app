/**
 * Shared initials-avatar fallback — extracted from DashboardTab.tsx
 * ("public profile" slice 1) so the public-profile page can render the
 * exact same deterministic-color/grapheme-safe fallback the self-profile
 * already uses, instead of a second, duplicated implementation.
 */

// Small brand-aligned palette — swap freely, nothing else depends on these
// exact hexes.
const AVATAR_PALETTE = ['#00ADEF', '#10B981', '#F59E0B', '#8B5CF6', '#F43F5E', '#0EA5E9'];
const AVATAR_FALLBACK_GRADIENT = 'linear-gradient(135deg, #00ADEF, #5BC2F2)';

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic background for a user's initials avatar — same uid/name
 * always lands on the same palette color. Falls back to the brand gradient
 * when neither uid nor name is available (truly unknown user). */
export function avatarBackground(seed: string | null): string {
  if (!seed) return AVATAR_FALLBACK_GRADIENT;
  return AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];
}

/** Grapheme-safe first letter — avoids splitting a surrogate pair (emoji,
 * non-BMP characters) in half. Hebrew/Latin names uppercase as expected;
 * .toUpperCase() is a harmless no-op on Hebrew (no case to begin with). */
export function firstGrapheme(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';
  const SegmenterCtor = (Intl as unknown as { Segmenter?: new (locale?: string, opts?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (SegmenterCtor) {
    // Array.from (not spread/for-of) — this repo's tsconfig has no `target`
    // set, so spreading a non-array iterable hits TS2802; Array.from is a
    // plain function call, not a language construct the compiler needs to
    // downlevel, and still iterates the real runtime iterator correctly.
    const first = Array.from(new SegmenterCtor(undefined, { granularity: 'grapheme' }).segment(trimmed))[0];
    return first ? first.segment.toUpperCase() : '?';
  }
  return Array.from(trimmed)[0]?.toUpperCase() ?? '?';
}

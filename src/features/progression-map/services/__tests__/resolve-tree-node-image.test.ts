import { describe, it, expect } from 'vitest';
import { resolveTreeNodeImage } from '../resolve-tree-node-image';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';

const BUNNY_VIDEO_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function method(overrides: Partial<ExecutionMethod>): ExecutionMethod {
  return {
    location: 'park',
    requiredGearType: 'none',
    media: {},
    ...overrides,
  } as unknown as ExecutionMethod;
}

function ex(methods: ExecutionMethod[], rootImageUrl?: string): Exercise {
  return {
    id: 'e1',
    name: { he: 'e1', en: 'e1' },
    execution_methods: methods,
    media: rootImageUrl ? { imageUrl: rootImageUrl } : {},
  } as unknown as Exercise;
}

describe('resolveTreeNodeImage', () => {
  it('tier 1: uses the park method preview-thumbnail when present', () => {
    const e = ex([
      method({
        media: {
          previewVideo: { he: { videoId: BUNNY_VIDEO_ID, provider: 'bunny', thumbnailUrl: 'https://cdn/preview-thumb.jpg' } },
        } as any,
      }),
    ]);
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/preview-thumb.jpg');
  });

  it('tier 1b: derives from previewVideo.videoId when no explicit thumbnailUrl', () => {
    const e = ex([
      method({
        media: { previewVideo: { he: { videoId: BUNNY_VIDEO_ID, provider: 'bunny' } } } as any,
      }),
    ]);
    expect(resolveTreeNodeImage(e)).toContain(BUNNY_VIDEO_ID);
  });

  it('tier 2: uses the park method explicit imageUrl when no preview video', () => {
    const e = ex([method({ media: { imageUrl: 'https://cdn/park-photo.jpg' } })]);
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/park-photo.jpg');
  });

  it('tier 3 (round-5 fix): derives a Bunny thumbnail from the park method mainVideoUrl when no image variant exists', () => {
    const e = ex([
      method({
        media: { mainVideoUrl: `https://cdn.example.com/${BUNNY_VIDEO_ID}/play_360p.mp4` },
      }),
    ]);
    const result = resolveTreeNodeImage(e);
    expect(result).toContain(BUNNY_VIDEO_ID);
    expect(result).toContain('thumbnail.jpg');
  });

  it('tier 4: a non-Bunny park video URL is not derivable — falls through to the canonical waterfall, which now derives a real image instead of returning the raw video URL (resolveImageForLocation hero-image fix, 2026-10-01 skill-foundation-unify merge, updated from the original pre-fix expectation)', () => {
    const e = ex(
      [method({ media: { mainVideoUrl: 'https://example.com/not-a-bunny-url.mp4' } })],
      'https://cdn/home-legacy.jpg',
    );
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/home-legacy.jpg');
  });

  it('tier 4: falls through to the canonical waterfall (home) when the park method has no derivable media at all', () => {
    const e = ex([method({ media: {} })], 'https://cdn/home-legacy.jpg');
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/home-legacy.jpg');
  });

  it('tier 4: falls through to the canonical waterfall (home) when there is no park method at all', () => {
    const e = ex([method({ location: 'home', media: { imageUrl: 'https://cdn/home-photo.jpg' } })]);
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/home-photo.jpg');
  });

  it('matches via locationMapping when no method has an exact park location', () => {
    const e = ex([
      method({
        location: 'gym',
        locationMapping: ['gym', 'park'],
        media: { imageUrl: 'https://cdn/gym-but-park-mapped.jpg' },
      }),
    ]);
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/gym-but-park-mapped.jpg');
  });

  it('returns empty string when nothing is derivable anywhere', () => {
    const e = ex([method({ media: {} })]);
    expect(resolveTreeNodeImage(e)).toBe('');
  });

  // Round 7: the real root cause of Bug 1 — an exercise can have MULTIPLE
  // park-tagged execution methods (e.g. "rings" and "built-in straps" for
  // front-lever level 1), and rounds 5/6 only ever inspected the FIRST one
  // found, giving up on park entirely the moment that one had nothing
  // derivable — never checking a later park method that did have media.

  it('round 7: scans ALL park methods — first has no media, second has an imageUrl (any host) → returns the second', () => {
    const e = ex([
      method({ media: {} }), // e.g. "built-in straps" — no image/video at all
      method({
        media: { imageUrl: 'https://firebasestorage.googleapis.com/v0/b/out/o/rings.jpg?alt=media' },
      }), // e.g. "rings"
    ]);
    expect(resolveTreeNodeImage(e)).toBe(
      'https://firebasestorage.googleapis.com/v0/b/out/o/rings.jpg?alt=media',
    );
  });

  it('round 7: scans ALL park methods — first has no media, second has only a Bunny video → derives from the second', () => {
    const e = ex([
      method({ media: {} }),
      method({
        media: { mainVideoUrl: `https://vz-b17872ab-7a7.b-cdn.net/${BUNNY_VIDEO_ID}/play_360p.mp4` },
      }),
    ]);
    const result = resolveTreeNodeImage(e);
    expect(result).toContain(BUNNY_VIDEO_ID);
    expect(result).toContain('thumbnail.jpg');
  });

  it('round 7: a home method listed BEFORE the real park method is never picked — only methods tagged park are scanned', () => {
    const e = ex([
      method({ location: 'home', media: { imageUrl: 'https://cdn/home-should-not-be-picked.jpg' } }),
      method({ location: 'park', media: { imageUrl: 'https://cdn/park-photo.jpg' } }),
    ]);
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/park-photo.jpg');
  });

  it('round 7: still returns home when NO park method (of several) has anything derivable', () => {
    const e = ex(
      [method({ media: {} }), method({ location: 'park', locationMapping: ['park'], media: {} })],
      'https://cdn/home-legacy-2.jpg',
    );
    expect(resolveTreeNodeImage(e)).toBe('https://cdn/home-legacy-2.jpg');
  });
});

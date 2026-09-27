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

  it('tier 4: a non-Bunny park video URL is not derivable — falls through to the canonical waterfall, which returns the raw video URL itself (pre-existing resolveImageForLocation behavior, not new here)', () => {
    const e = ex(
      [method({ media: { mainVideoUrl: 'https://example.com/not-a-bunny-url.mp4' } })],
      'https://cdn/home-legacy.jpg',
    );
    expect(resolveTreeNodeImage(e)).toBe('https://example.com/not-a-bunny-url.mp4');
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
});

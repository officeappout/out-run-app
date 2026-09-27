import { describe, it, expect } from 'vitest';
import { resolveParkNodeImage } from '../resolve-park-node-image';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

function ex(execution_methods: unknown[]): Exercise {
  return { id: 'e1', name: { he: 'e1', en: 'e1' }, execution_methods } as unknown as Exercise;
}

describe('resolveParkNodeImage', () => {
  it('returns the park methods own imageUrl when present', () => {
    const e = ex([{ location: 'park', media: { imageUrl: 'https://cdn/park.jpg' } }]);
    expect(resolveParkNodeImage(e)).toBe('https://cdn/park.jpg');
  });

  it('derives a Bunny thumbnail from the park methods preview video when no explicit imageUrl exists', () => {
    const e = ex([{ location: 'park', media: { previewVideo: { he: { videoId: 'abc123' } } } }]);
    const result = resolveParkNodeImage(e);
    expect(result).toContain('abc123');
  });

  it('returns null (not the home methods image, not a video URL) when the park method has no image of its own', () => {
    const e = ex([
      { location: 'home', media: { imageUrl: 'https://cdn/home.jpg' } },
      { location: 'park', media: { mainVideoUrl: 'https://cdn/park.mp4' } },
    ]);
    expect(resolveParkNodeImage(e)).toBeNull();
  });

  it('returns null when there is no park method at all, rather than falling back to a home photo', () => {
    const e = ex([{ location: 'home', media: { imageUrl: 'https://cdn/home.jpg' } }]);
    expect(resolveParkNodeImage(e)).toBeNull();
  });

  it('returns null for an exercise with no execution methods', () => {
    const e = ex([]);
    expect(resolveParkNodeImage(e)).toBeNull();
  });
});

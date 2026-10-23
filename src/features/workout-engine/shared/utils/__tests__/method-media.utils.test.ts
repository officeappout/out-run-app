import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/bunny/bunny.config', async (orig) => {
  const actual = await orig<typeof import('@/lib/bunny/bunny.config')>();
  return { ...actual, buildBunnyThumbnailUrl: (id: string) => `https://cdn.test/${id}/thumbnail.jpg` };
});

import { methodHasAnyMedia, methodHasImageMedia, methodHasVideoMedia, resolveMethodPoster } from '../method-media.utils';
import { resolveExerciseImage } from '@/features/workouts/components/workout-preview-drawer/utils/exercise-display.utils';
import { resolveHeroMedia } from '../heroMedia.utils';

const BUNNY = '11111111-2222-3333-4444-555555555555';
const videoOnly: any = { location: 'home', media: { mainVideoUrl: `https://iframe.mediadelivery.net/embed/1/${BUNNY}` } };
const imageOnly: any = { location: 'home', media: { imageUrl: 'https://cdn/i.jpg' } };
const rawVideoOnly: any = { location: 'home', media: { mainVideoUrl: 'https://cdn/clip.mp4' } };

describe('method media presence (video OR image)', () => {
  it('counts a video-only and an image-only method as having media; an empty one not', () => {
    expect(methodHasAnyMedia(videoOnly)).toBe(true);
    expect(methodHasAnyMedia(imageOnly)).toBe(true);
    expect(methodHasAnyMedia({ media: {} } as any)).toBe(false);
    expect(methodHasAnyMedia(null)).toBe(false);
    expect(methodHasVideoMedia(imageOnly)).toBe(false);
    expect(methodHasImageMedia(videoOnly)).toBe(false);
  });
});

describe('resolveMethodPoster', () => {
  it('uses the method image when it has one', () => {
    expect(resolveMethodPoster(imageOnly)).toBe('https://cdn/i.jpg');
  });
  it('derives the poster frame from the method own Bunny video when there is no image', () => {
    expect(resolveMethodPoster(videoOnly)).toBe(`https://cdn.test/${BUNNY}/thumbnail.jpg`);
  });
  it('ignores an imageUrl that is really a video file and falls back to the video poster', () => {
    const m: any = { media: { imageUrl: 'https://cdn/clip.mp4', mainVideoUrl: `https://iframe.mediadelivery.net/embed/1/${BUNNY}` } };
    expect(resolveMethodPoster(m)).toBe(`https://cdn.test/${BUNNY}/thumbnail.jpg`);
  });
  it('is undefined for a raw video file (no still can be produced) and for no media', () => {
    expect(resolveMethodPoster(rawVideoOnly)).toBeUndefined();
    expect(resolveMethodPoster(null)).toBeUndefined();
  });
});

describe('poster-from-video fallback in the display resolvers (flag-gated)', () => {
  const exercise: any = {
    id: 'e',
    execution_methods: [
      videoOnly,
      { location: 'park', media: { imageUrl: 'https://cdn/park.jpg' } },
    ],
  };

  it('resolveExerciseImage: flag off keeps today\'s result (another method image leaks in), flag on shows the own-video poster', () => {
    const ex: any = { exercise, method: videoOnly };
    expect(resolveExerciseImage(ex)).toBe('https://cdn/park.jpg');
    expect(resolveExerciseImage(ex, { posterFromVideo: true })).toBe(`https://cdn.test/${BUNNY}/thumbnail.jpg`);
  });

  it('resolveExerciseImage: flag on with a raw video falls through to today\'s behaviour', () => {
    const ex: any = { exercise: { id: 'e2', execution_methods: [rawVideoOnly] }, method: rawVideoOnly };
    expect(resolveExerciseImage(ex, { posterFromVideo: true })).toBe(resolveExerciseImage(ex));
  });

  it('resolveHeroMedia: flag on prefers the own-video poster over another method image; flag off unchanged', () => {
    const ex: any = { exercise };
    expect(resolveHeroMedia(ex, 'home').thumbnailUrl).toBe('https://cdn/park.jpg');
    expect(resolveHeroMedia(ex, 'home', { posterFromVideo: true }).thumbnailUrl).toBe(`https://cdn.test/${BUNNY}/thumbnail.jpg`);
  });
});

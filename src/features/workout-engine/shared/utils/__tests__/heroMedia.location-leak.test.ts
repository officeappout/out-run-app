import { describe, it, expect } from 'vitest';
import { resolveHeroMedia } from '../heroMedia.utils';

// Bug fix regression test — heroMedia.utils.ts resolveHeroMedia()
//
// Before the fix, resolveHeroMedia delegated straight to
// resolveImageForLocation/resolveVideoForLocation (exercise.types.ts), whose
// findMethodForLocation() falls back to "first method with ANY media,
// regardless of location" once no exact/mapped method exists for the
// requested location. A 'home' exercise authored ONLY with a park method
// (with a video) would silently surface that park video/photo on the home
// hero card / preview-drawer hero — instead of the safe generic fallback.

const homeOnlyExercise = (): any => ({
  id: 'ex1',
  name: { he: 'תרגיל' },
  movementGroup: 'horizontal_push',
  execution_methods: [
    { location: 'home', media: {} }, // authored, but no media at all
  ],
});

const parkOnlyWithVideoExercise = (): any => ({
  id: 'ex2',
  name: { he: 'תרגיל' },
  movementGroup: 'horizontal_push',
  execution_methods: [
    { location: 'park', media: { mainVideoUrl: 'https://cdn.example/park-video.mp4', imageUrl: 'https://cdn.example/park.jpg' } },
  ],
});

describe('resolveHeroMedia — no cross-location leak', () => {
  it('home request, exercise has ONLY a park method with video: does NOT leak the park video', () => {
    const ex = { exercise: parkOnlyWithVideoExercise() } as any;
    const { videoUrl, thumbnailUrl } = resolveHeroMedia(ex, 'home');

    expect(videoUrl).toBe(''); // BEFORE the fix this was the park video URL
    // Safe generic substitute (movement-group fallback), never the park photo.
    expect(thumbnailUrl).not.toBe('https://cdn.example/park.jpg');
  });

  it('home request, exercise HAS a home method (even with no media): still no cross-location leak', () => {
    const ex = { exercise: homeOnlyExercise() } as any;
    const { videoUrl, thumbnailUrl } = resolveHeroMedia(ex, 'home');
    expect(videoUrl).toBe('');
    expect(thumbnailUrl).toBeTruthy(); // generic fallback, not undefined/crash
  });

  it('exact-location match with real media is unaffected (no false positive)', () => {
    const ex = {
      exercise: {
        id: 'ex3', name: { he: 'x' }, movementGroup: 'horizontal_push',
        execution_methods: [{ location: 'home', media: { mainVideoUrl: 'https://cdn.example/home.mp4', imageUrl: 'https://cdn.example/home.jpg' } }],
      },
    } as any;
    const { videoUrl, thumbnailUrl } = resolveHeroMedia(ex, 'home');
    expect(videoUrl).toBe('https://cdn.example/home.mp4');
    expect(thumbnailUrl).toBe('https://cdn.example/home.jpg');
  });
});

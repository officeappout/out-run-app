import { describe, it, expect } from 'vitest';
import { resolveHeroMedia } from '../heroMedia.utils';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

/**
 * Hero-image fix (2026-10-01, revised): resolveHeroMedia now delegates to
 * resolveExerciseMedia (the wide, already-proven "video pipeline" resolver)
 * instead of the narrower resolveImageForLocation/resolveVideoForLocation
 * pair. Pins the exact gap this closed — confirmed against the live catalog
 * (5.7% of combos had no image under the narrow pair, 0.5% under this one).
 */
describe('resolveHeroMedia', () => {
  it('finds an exercise-root image the narrow resolver never checked', () => {
    // No method-level media at all — only an exercise-root field the narrow
    // resolveImageForLocation (exercise.media?.imageUrl only) never reads.
    const we = {
      exercise: {
        id: 'ex1',
        execution_methods: [{ location: 'home', media: {} }],
        imageUrl: 'https://firebasestorage.googleapis.com/real-root-image.png',
      },
    } as unknown as WorkoutExercise;
    const media = resolveHeroMedia(we, 'home');
    expect(media.thumbnailUrl).toBe('https://firebasestorage.googleapis.com/real-root-image.png');
  });

  it('finds a sibling method\'s image when the location-matched method has none', () => {
    const we = {
      exercise: {
        id: 'ex2',
        execution_methods: [
          { location: 'home', media: {} },
          { location: 'park', media: { imageUrl: 'https://example.com/park-image.jpg' } },
        ],
      },
    } as unknown as WorkoutExercise;
    const media = resolveHeroMedia(we, 'home');
    expect(media.thumbnailUrl).toBe('https://example.com/park-image.jpg');
  });

  it('returns empty strings (never a stock photo) when truly no media resolves anywhere', () => {
    const we = {
      exercise: {
        id: 'ex3',
        execution_methods: [{ location: 'home', media: {} }],
      },
    } as unknown as WorkoutExercise;
    const media = resolveHeroMedia(we, 'home');
    expect(media.thumbnailUrl).toBe('');
    expect(media.videoUrl).toBe('');
  });

  it('returns empty strings for an undefined exercise', () => {
    const media = resolveHeroMedia(undefined, 'home');
    expect(media).toEqual({ thumbnailUrl: '', videoUrl: '' });
  });
});

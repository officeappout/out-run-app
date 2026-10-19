import { describe, it, expect } from 'vitest';
import { resolveHeroMedia, pickHeroExercise, isLocationAgnosticHeroExercise } from '../heroMedia.utils';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

// Shape of a real prod rest-day recovery video (exercises/rec_*, read-only recon
// 2026-10-19): exerciseRole 'recovery', ONE 'home' method, Bunny previewVideo
// only — no stored imageUrl anywhere.
const VIDEO_ID = '00695c88-f3cb-4dfd-897d-fbb59c062099';
const homeMethod = {
  location: 'home',
  media: {
    previewVideo: { he: { videoId: VIDEO_ID, provider: 'bunny' } },
    fullTutorial: { he: { videoId: VIDEO_ID, provider: 'bunny' } },
    videoDurationSeconds: 816, mainVideoUrl: null, imageUrl: null,
  },
};
const recoveryWE = (): WorkoutExercise => ({
  exercise: {
    id: `rec_${VIDEO_ID}`, name: { he: 'סשן התאוששות #3' }, exerciseRole: 'recovery',
    media: {}, execution_methods: [homeMethod],
  },
  method: homeMethod,
  exerciseRole: 'main',
} as unknown as WorkoutExercise);

describe('resolveHeroMedia — rest-day recovery video', () => {
  it.each(['park', 'home', null])('resolves the Bunny thumbnail for location=%s (not the blue gradient)', (loc) => {
    const ex = pickHeroExercise([recoveryWE()], loc);
    const { thumbnailUrl, videoUrl } = resolveHeroMedia(ex, loc);
    expect(thumbnailUrl).toContain(VIDEO_ID);
    expect(thumbnailUrl).toMatch(/thumbnail\.jpg$/);
    expect(videoUrl).toContain(VIDEO_ID);
  });

  it('cooldown stretches are location-agnostic too; strength stays gated', () => {
    expect(isLocationAgnosticHeroExercise(recoveryWE())).toBe(true);
    expect(isLocationAgnosticHeroExercise({ exercise: { exerciseRole: 'cooldown' } } as any)).toBe(true);
    expect(isLocationAgnosticHeroExercise({ exercise: { exerciseRole: 'main' } } as any)).toBe(false);
    expect(isLocationAgnosticHeroExercise({ exercise: {} } as any)).toBe(false);

    // A main strength exercise with only a home method still does NOT leak to a park hero.
    const strength = { exercise: { id: 's', exerciseRole: 'main', execution_methods: [homeMethod] }, method: homeMethod } as any;
    expect(resolveHeroMedia(strength, 'park')).toEqual({ thumbnailUrl: '', videoUrl: '' });
  });
});

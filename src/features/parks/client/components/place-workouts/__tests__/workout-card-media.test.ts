import { describe, expect, it } from 'vitest';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { pickWorkoutCardMedia } from '../workout-card-media';

const parkEx = (id: string, media: Record<string, string>, role?: string): WorkoutExercise => ({
  exercise: { id, name: { he: id }, exerciseRole: role, execution_methods: [{ location: 'park', media }] },
}) as unknown as WorkoutExercise;
/** A machine station as composeParkWorkoutFromMachines builds it: media on its own method only. */
const machine = (id: string, media: Record<string, string>): WorkoutExercise => ({
  exercise: { id, name: { he: id }, media: {} },
  method: { location: 'park', media },
  exerciseRole: 'main',
}) as unknown as WorkoutExercise;

describe('pickWorkoutCardMedia (park workout card, owner 26.10)', () => {
  it('the hero exercise has media → its still + video (home card rule)', () => {
    const m = pickWorkoutCardMedia([parkEx('a', { mainVideoUrl: 'https://c/a.mp4', imageUrl: 'https://c/a.jpg' })], 'park');
    expect(m).toEqual({ thumbnailUrl: 'https://c/a.jpg', videoUrl: 'https://c/a.mp4' });
  });

  it('the hero has no media → the next exercise that does, not the park photo', () => {
    const m = pickWorkoutCardMedia([parkEx('a', {}), parkEx('b', { imageUrl: 'https://c/b.jpg' })], 'park');
    expect(m.thumbnailUrl).toBe('https://c/b.jpg');
  });

  it('a machines-only workout → the machine station\'s own media', () => {
    const m = pickWorkoutCardMedia([machine('m1', { imageUrl: 'https://c/m1.jpg', mainVideoUrl: 'https://c/m1.mp4' })], 'park');
    expect(m).toEqual({ thumbnailUrl: 'https://c/m1.jpg', videoUrl: 'https://c/m1.mp4' });
  });

  it('nothing anywhere → empty (the caller shows the park photo)', () => {
    expect(pickWorkoutCardMedia([parkEx('a', {}), machine('m', {})], 'park')).toEqual({ thumbnailUrl: '', videoUrl: '' });
    expect(pickWorkoutCardMedia([], 'park')).toEqual({ thumbnailUrl: '', videoUrl: '' });
  });
});

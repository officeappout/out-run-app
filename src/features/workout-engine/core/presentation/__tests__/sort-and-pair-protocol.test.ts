import { describe, it, expect } from 'vitest';
import { sortAndPair } from '../PresentationFormatter';
import type { GeneratedWorkout, WorkoutExercise } from '../../../logic/workout-generator.types';

const we = (id: string, movementGroup: string): WorkoutExercise =>
  ({ exercise: { id, name: { he: id, en: id }, movementGroup }, sets: 3, reps: 8, exerciseRole: 'main', priority: 'compound' }) as unknown as WorkoutExercise;
const workout = (appliedProtocol?: string) =>
  ({ exercises: [we('p', 'horizontal_push'), we('r', 'horizontal_pull'), we('s', 'squat')], appliedProtocol }) as unknown as GeneratedWorkout;

describe('sortAndPair — pairs only when the protocol roll chose them', () => {
  it('the panel listing antagonist_pair no longer pairs a session whose roll did not pick it', () => {
    const w = sortAndPair(workout(undefined), { isSingleDomain: false, adminPreferredProtocols: ['antagonist_pair'] });
    expect(w.exercises.some((e) => e.pairedWith)).toBe(false);
  });

  it('a session whose roll picked antagonist_pair is paired', () => {
    const w = sortAndPair(workout('antagonist_pair'), { isSingleDomain: false });
    expect(w.exercises.some((e) => e.pairedWith)).toBe(true);
  });

  it('a single-domain session is never paired', () => {
    const w = sortAndPair(workout('antagonist_pair'), { isSingleDomain: true });
    expect(w.exercises.some((e) => e.pairedWith)).toBe(false);
  });
});
